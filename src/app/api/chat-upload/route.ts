import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse, uploadIpRateLimiter } from '@/lib/utils/rate-limit'
import { formatSupportedAttachmentTypes, isSupportedChatAttachment } from '@/lib/chat/attachments'
import { extractTextFromBuffer } from '@/lib/chat/text-extraction'
import {
  CHAT_UPLOAD_BUCKET,
  CHAT_UPLOAD_TTL_MS,
  buildChatUploadStoragePath,
  deleteExpiredChatUploads,
  sanitizeChatUploadFilename,
} from '@/lib/chat/upload-store'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const IMMEDIATE_EXTRACTION_MAX_BYTES = 4 * 1024 * 1024
const IMMEDIATE_EXTRACTION_TIMEOUT_MS = 4000

const extractWithTimeout = async (buffer: Buffer, name: string, mimeType: string | null) => {
  return await Promise.race<string>([
    extractTextFromBuffer(buffer, name, mimeType),
    new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('Extraction timed out')), IMMEDIATE_EXTRACTION_TIMEOUT_MS)
    }),
  ])
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const ip = getClientIp(request.headers)
    const limit = await rateLimit(uploadIpRateLimiter, `upload:chat:ip:${getIdentifier(undefined, ip)}`, 60, 10 * 60 * 1000)
    if (!limit.success) {
      return rateLimitExceededResponse(limit, 'Too many upload requests. Please try again later.')
    }

    await deleteExpiredChatUploads()

    const formData = await request.formData()
    const entries = formData.getAll('files')
    if (!entries.length) {
      return NextResponse.json({ message: 'No files provided.' }, { status: 400 })
    }

    const files: Array<{
      name: string
      downloadURL: string
      storagePath: string
      size: number
      mimeType: string | null
    }> = []

    for (const entry of entries) {
      if (!(entry instanceof File)) continue
      if (!isSupportedChatAttachment({ name: entry.name, type: entry.type || null })) {
        return NextResponse.json(
          { message: `Unsupported file type for "${entry.name}". Supported types: ${formatSupportedAttachmentTypes()}.` },
          { status: 400 }
        )
      }
      if (entry.size > MAX_FILE_SIZE) {
        return NextResponse.json({ message: 'File too large. Max size is 25MB.' }, { status: 400 })
      }

      const safeName = sanitizeChatUploadFilename(entry.name)
      const id = `tmp_${randomUUID().replace(/-/g, '')}`
      const storagePath = buildChatUploadStoragePath(user.id, id, safeName)
      const now = new Date()
      const expiresAt = new Date(now.getTime() + CHAT_UPLOAD_TTL_MS)
      const fileBuffer = Buffer.from(await entry.arrayBuffer())
      let extractedText: string | null = null
      let extractStatus: 'pending' | 'complete' = 'pending'
      let extractedAt: string | null = null

      if (fileBuffer.length <= IMMEDIATE_EXTRACTION_MAX_BYTES) {
        try {
          const extracted = await extractWithTimeout(fileBuffer, safeName, entry.type || null)
          extractedText = extracted.trim() ? extracted : null
          extractStatus = 'complete'
          extractedAt = now.toISOString()
        } catch {
          extractStatus = 'pending'
        }
      }

      const { error: uploadError } = await supabaseAdmin.storage
        .from(CHAT_UPLOAD_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: entry.type || 'application/octet-stream',
          upsert: false,
        })

      if (uploadError) {
        console.error('Chat upload storage error', uploadError)
        return NextResponse.json({ message: 'Upload failed.' }, { status: 500 })
      }

      const { error: insertError } = await supabaseAdmin
        .from('chat_uploads')
        .insert({
          id,
          owner_id: user.id,
          name: safeName,
          mime_type: entry.type || 'application/octet-stream',
          size_bytes: fileBuffer.length,
          storage_path: storagePath,
          extracted_text: extractedText,
          extract_status: extractStatus,
          extracted_at: extractedAt,
          extract_error: null,
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })

      if (insertError) {
        console.error('Chat upload metadata error', insertError)
        await supabaseAdmin.storage.from(CHAT_UPLOAD_BUCKET).remove([storagePath]).catch(() => undefined)
        return NextResponse.json({ message: 'Upload failed.' }, { status: 500 })
      }

      files.push({
        name: safeName,
        downloadURL: `/api/chat-upload/${id}`,
        storagePath: id,
        size: fileBuffer.length,
        mimeType: entry.type || null,
      })
    }

    return NextResponse.json({ files }, { status: 200 })
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ message }, { status: 500 })
  }
}
