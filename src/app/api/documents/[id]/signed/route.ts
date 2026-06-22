import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { getClientAccessibleDocument } from '@/lib/documents/client-document-access'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  void request
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const document = user.email
    ? await getClientAccessibleDocument({ userId: user.id, userEmail: user.email, documentId: id })
    : null

  if (!document) {
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
