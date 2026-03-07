import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { CHAT_UPLOAD_BUCKET, deleteChatUpload } from '@/lib/chat/upload-store'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'

const isSafeId = (value: string) => /^tmp_[a-zA-Z0-9_-]+$/.test(value)

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

    const { data: upload, error } = await supabaseAdmin
      .from('chat_uploads')
      .select('id, owner_id, mime_type, storage_path, expires_at')
      .eq('id', id)
      .maybeSingle()

    if (error || !upload) {
      return NextResponse.json({ message: 'File not found or expired.' }, { status: 404 })
    }
    if (upload.owner_id !== user.id) {
      return NextResponse.json({ message: 'Forbidden.' }, { status: 403 })
    }

    const expiresAt = new Date(upload.expires_at).getTime()
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await deleteChatUpload({ id: String(upload.id), storage_path: String(upload.storage_path) }).catch(() => undefined)
      return NextResponse.json({ message: 'File not found or expired.' }, { status: 404 })
    }

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(CHAT_UPLOAD_BUCKET)
      .download(String(upload.storage_path))

    if (downloadError || !fileData) {
      return NextResponse.json({ message: 'File not found or expired.' }, { status: 404 })
    }

    const buffer = Buffer.from(await fileData.arrayBuffer())
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': upload.mime_type || 'application/octet-stream',
      },
    })
  } catch {
    return NextResponse.json({ message: 'File not found or expired.' }, { status: 404 })
  }
}
