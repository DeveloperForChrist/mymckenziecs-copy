import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'

const uploadDir = path.join(os.tmpdir(), 'mymckenzie-chat-uploads')
const isSafeId = (value: string) => /^tmp_[a-zA-Z0-9_-]+$/.test(value)

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

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const { id } = await context.params
    if (!id || !isSafeId(id)) {
      return NextResponse.json({ message: 'Invalid download id.' }, { status: 400 })
    }
    const metaPath = path.join(uploadDir, `${id}.json`)
    try {
      const metaRaw = await fs.readFile(metaPath, 'utf8')
      const meta = JSON.parse(metaRaw) as UploadMeta
      if (meta.ownerId !== user.id) {
        return NextResponse.json({ message: 'Forbidden.' }, { status: 403 })
      }
      const expiresAt = new Date(meta.expiresAt).getTime()
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        const filePath = path.join(uploadDir, meta.filename)
        await fs.unlink(filePath).catch(() => undefined)
        await fs.unlink(metaPath).catch(() => undefined)
        return NextResponse.json({ message: 'File not found or expired.' }, { status: 404 })
      }

      const filePath = path.join(uploadDir, meta.filename)
      const buffer = Buffer.from(await fs.readFile(filePath))

      // Chat uploads are transient: remove after first successful read.
      await fs.unlink(filePath).catch(() => undefined)
      await fs.unlink(metaPath).catch(() => undefined)

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': meta.mimeType || 'application/octet-stream'
        }
      })
    } catch {
      return NextResponse.json({ message: 'File not found or expired.' }, { status: 404 })
    }
  } catch {
    return NextResponse.json({ message: 'File not found or expired.' }, { status: 404 })
  }
}
