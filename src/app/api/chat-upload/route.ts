import { after, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import {
  assistantPlusUploadDailyRateLimiter,
  assistantPlusUploadMonthlyRateLimiter,
  assistantProUploadDailyRateLimiter,
  assistantProUploadMonthlyRateLimiter,
  assistantUsageLimits,
  getClientIp,
  getIdentifier,
  rateLimit,
  rateLimitExceededResponse,
  uploadIpRateLimiter,
} from '@/lib/utils/rate-limit'
import { formatSupportedAttachmentTypes, isSupportedChatAttachment } from '@/lib/chat/attachments'
import { getUserPlanData } from '@/lib/payments/user-plan'
import { getPlanTier } from '@/lib/plans/access'
import {
  CHAT_UPLOAD_BUCKET,
  CHAT_UPLOAD_TTL_MS,
  buildChatUploadStoragePath,
  deleteExpiredChatUploads,
  processChatUploadExtractionById,
  sanitizeChatUploadFilename,
} from '@/lib/chat/upload-store'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 25 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    const planData = await getUserPlanData(user.id, user.email || null)
    if (!planData?.paidAccess) {
      return NextResponse.json(
        { message: 'Document uploads are available on Assistant Plus and higher plans.' },
        { status: 403 }
      )
    }
    const planTier = getPlanTier(planData.plan || '')

    const ip = getClientIp(request.headers)
    const limit = await rateLimit(uploadIpRateLimiter, `upload:chat:ip:${getIdentifier(undefined, ip)}`, 60, 10 * 60 * 1000)
    if (!limit.success) {
      return rateLimitExceededResponse(limit, 'Too many upload requests. Please try again later.')
    }
    if (planTier === 'assistant_plus' || planTier === 'assistant_pro') {
      const dailyUploadLimit = planTier === 'assistant_pro'
        ? assistantUsageLimits.proUploadDaily
        : assistantUsageLimits.plusUploadDaily
      const dailyLimiter = planTier === 'assistant_pro'
        ? assistantProUploadDailyRateLimiter
        : assistantPlusUploadDailyRateLimiter
      const dailyLimit = await rateLimit(
        dailyLimiter,
        `upload:chat:${planTier}:${user.id}`,
        dailyUploadLimit,
        24 * 60 * 60 * 1000
      )
      if (!dailyLimit.success) {
        return rateLimitExceededResponse(
          dailyLimit,
          planTier === 'assistant_pro'
            ? 'You have reached today\'s Assistant Pro upload limit. Please try again tomorrow.'
            : 'You have reached today\'s Assistant Plus upload limit. Please try again tomorrow.'
        )
      }

      const monthlyUploadLimit = planTier === 'assistant_pro'
        ? assistantUsageLimits.proUploadMonthly
        : assistantUsageLimits.plusUploadMonthly
      const monthlyLimiter = planTier === 'assistant_pro'
        ? assistantProUploadMonthlyRateLimiter
        : assistantPlusUploadMonthlyRateLimiter
      const monthlyLimit = await rateLimit(
        monthlyLimiter,
        `upload:chat:${planTier}:monthly:${user.id}`,
        monthlyUploadLimit,
        30 * 24 * 60 * 60 * 1000
      )
      if (!monthlyLimit.success) {
        return rateLimitExceededResponse(
          monthlyLimit,
          planTier === 'assistant_pro'
            ? 'You have reached the Assistant Pro monthly upload limit. Please try again when it resets.'
            : 'You have reached the Assistant Plus monthly upload limit. Upgrade to Pro for more uploads, or try again when it resets.'
        )
      }
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
          extracted_text: null,
          extract_status: 'pending',
          extracted_at: null,
          extract_error: null,
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })

      if (insertError) {
        console.error('Chat upload metadata error', insertError)
        await supabaseAdmin.storage.from(CHAT_UPLOAD_BUCKET).remove([storagePath]).catch(() => undefined)
        return NextResponse.json({ message: 'Upload failed.' }, { status: 500 })
      }

      after(async () => {
        await processChatUploadExtractionById(id).catch((error) => {
          console.error('Background chat upload extraction failed', error)
        })
      })

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
