import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { loadClientPortalMatters } from '@/lib/client-portal/portal-matters'
import mammoth from 'mammoth'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

async function loadClientCaseIds(userId: string, userEmail: string) {
  const { matters } = await loadClientPortalMatters(userId, userEmail)
  return Array.from(new Set(matters.map((matter) => matter.caseId).filter((value): value is string => Boolean(value))))
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const { data: document, error } = await supabase
    .from('documents')
    .select('id, storage_path, mime_type, name, uploaded_by, case_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (!document.storage_path) {
    return NextResponse.json({ error: 'No storage path' }, { status: 400 })
  }

  const isOwner = document.uploaded_by === authData.user.id
  if (!isOwner && authData.user.email) {
    const clientCaseIds = await loadClientCaseIds(authData.user.id, authData.user.email)
    const isSharedCaseDoc = Boolean(document.case_id && clientCaseIds.includes(String(document.case_id)))
    if (!isSharedCaseDoc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
  }

  const { data: fileData, error: downloadError } = await supabaseAdmin
    .storage
    .from('user-uploads')
    .download(document.storage_path)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: downloadError?.message || 'Failed to download file' }, { status: 500 })
  }

  const name = (document.name || '').toLowerCase()
  const mime = document.mime_type || ''
  const buffer = Buffer.from(await fileData.arrayBuffer())

  if (mime.includes('word') || name.endsWith('.docx')) {
    const result = await mammoth.convertToHtml({ buffer })
    return NextResponse.json({ html: result.value || '' })
  }

  if (mime.startsWith('text/') || /\.(txt|md|csv|json|log)$/.test(name)) {
    return NextResponse.json({ text: buffer.toString('utf-8') })
  }

  return NextResponse.json({ error: 'Preview not supported for this file type.' }, { status: 400 })
}
