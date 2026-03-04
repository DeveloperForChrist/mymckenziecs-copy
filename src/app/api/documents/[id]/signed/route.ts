import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  void request
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const { data: document, error } = await supabaseAdmin
    .from('documents')
    .select('id, storage_path, mime_type, name, uploaded_by, case_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  let authorized = document.uploaded_by === authData.user.id
  if (!authorized && document.case_id) {
    const { data: ownedCase } = await supabaseAdmin
      .from('cases')
      .select('id')
      .eq('id', document.case_id)
      .eq('user_id', authData.user.id)
      .is('deleted_at', null)
      .maybeSingle()
    authorized = Boolean(ownedCase)
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (!document.storage_path) {
    return NextResponse.json({ error: 'No storage path' }, { status: 400 })
  }

  const { data: signed, error: signedError } = await supabaseAdmin
    .storage
    .from('user-uploads')
    .createSignedUrl(document.storage_path, 60 * 15)

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: signedError?.message || 'Failed to create signed URL' }, { status: 500 })
  }

  return NextResponse.json({
    url: signed.signedUrl,
    mimeType: document.mime_type,
    name: document.name
  })
}
