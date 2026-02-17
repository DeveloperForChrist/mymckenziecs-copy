import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const { data: document, error } = await supabase
    .from('documents')
    .select('id, storage_path, mime_type, name')
    .eq('id', id)
    .single()

  if (error || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (!document.storage_path) {
    return NextResponse.json({ error: 'No storage path' }, { status: 400 })
  }

  const { data: signed, error: signedError } = await supabase
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
