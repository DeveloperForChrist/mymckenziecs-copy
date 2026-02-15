import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'

export async function DELETE(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = context?.params?.id
    if (!id) {
      return NextResponse.json({ error: 'Missing document id' }, { status: 400 })
    }

    // RLS on documents ensures the user can only delete their own document rows.
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('id, storage_path')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()

    if (docErr) {
      return NextResponse.json({ error: docErr.message }, { status: 500 })
    }
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Best-effort delete from Storage. Storage RLS limits this to the user's own prefix.
    if (doc.storage_path) {
      const { error: storageErr } = await supabase.storage.from('user-uploads').remove([doc.storage_path])
      if (storageErr) {
        // If storage deletion fails, don't leave DB deleted while file remains inaccessible (or vice versa).
        return NextResponse.json({ error: storageErr.message || 'Failed to delete file' }, { status: 500 })
      }
    }

    const nowIso = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('documents')
      .update({ deleted_at: nowIso })
      .eq('id', id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete document'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

