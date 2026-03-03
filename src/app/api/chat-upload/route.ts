import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse, uploadIpRateLimiter } from '@/lib/utils/rate-limit'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const CHAT_UPLOAD_TTL_MS = 30 * 60 * 1000
const uploadDir = path.join(os.tmpdir(), 'mymckenzie-chat-uploads')

const sanitizeFilename = (value: string) => {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.replace(/[^a-zA-Z0-9._\- ]/g, '').trim() || 'uploaded-document'
}

type UploadMeta = {
  id: string
  name: string
  mimeType: string
  size: number
  filename: string
  ownerId: string
  createdAt: string
  expiresAt: string
}

const ensureUploadDir = async () => {
  await fs.mkdir(uploadDir, { recursive: true })
}

const cleanupExpiredUploads = async () => {
  await ensureUploadDir()
  const now = Date.now()
  const entries = await fs.readdir(uploadDir).catch(() => [])

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const metaPath = path.join(uploadDir, entry)
    try {
      const raw = await fs.readFile(metaPath, 'utf8')
      const meta = JSON.parse(raw) as UploadMeta
      const expiresAt = new Date(meta.expiresAt).getTime()
      if (!Number.isFinite(expiresAt) || expiresAt > now) continue
      const filePath = path.join(uploadDir, meta.filename)
      await fs.unlink(filePath).catch(() => undefined)
      await fs.unlink(metaPath).catch(() => undefined)
    } catch {
      await fs.unlink(metaPath).catch(() => undefined)
    }
  }
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

    const formData = await request.formData()
    const entries = formData.getAll('files')
    if (!entries.length) {
      return NextResponse.json({ message: 'No files provided.' }, { status: 400 })
    }
    await cleanupExpiredUploads()
    await ensureUploadDir()

    const files: Array<{
      name: string
      downloadURL: string
      storagePath: string
      size: number
      mimeType: string | null
    }> = []

    for (const entry of entries) {
      if (!(entry instanceof File)) continue
      if (entry.size > MAX_FILE_SIZE) {
        return NextResponse.json({ message: 'File too large. Max size is 25MB.' }, { status: 400 })
      }

      const safeName = sanitizeFilename(entry.name)
      const id = `tmp_${randomUUID().replace(/-/g, '')}`
      const filename = `${id}--${safeName}`
      const filePath = path.join(uploadDir, filename)
      const metaPath = path.join(uploadDir, `${id}.json`)
      const buffer = Buffer.from(await entry.arrayBuffer())
      await fs.writeFile(filePath, buffer)
      const now = new Date()
      const expiresAt = new Date(now.getTime() + CHAT_UPLOAD_TTL_MS)
      const meta: UploadMeta = {
        id,
        name: safeName,
        mimeType: entry.type || 'application/octet-stream',
        size: buffer.length,
        filename,
        ownerId: user.id,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
      }
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2))

      files.push({
        name: safeName,
        downloadURL: `/api/chat-upload/${id}`,
        storagePath: id,
        size: buffer.length,
        mimeType: entry.type || null
      })
    }

    return NextResponse.json({ files }, { status: 200 })
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ message }, { status: 500 })
  }
}
