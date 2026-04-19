import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { hasUserPlatformAccess } from '@/lib/auth/platform-access'

async function hasPaidAccess(userId: string): Promise<boolean> {
  return hasUserPlatformAccess(userId)
}

async function getAccessibleDocument(supabase: any, docId: string) {
  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, uploaded_by, case_id, storage_path')
    .eq('id', docId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !doc) return null
  return doc
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Missing document id' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    if (typeof body?.starred !== 'boolean') {
      return NextResponse.json({ error: 'starred must be a boolean' }, { status: 400 })
    }

    const doc = await getAccessibleDocument(supabase, id)
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const { data: updated, error: updateErr } = await supabase
      .from('documents')
      .update({ starred: body.starred })
      .eq('id', id)
      .select('id, starred')
      .maybeSingle()

    if (updateErr) {
      if (/column .*starred/i.test(updateErr.message || '')) {
        return NextResponse.json({ error: 'Document starring is not available yet. Please run latest database migrations.' }, { status: 503 })
      }
      return NextResponse.json({ error: updateErr.message || 'Failed to update document' }, { status: 500 })
    }

    return NextResponse.json({ success: true, document: { id: updated?.id || id, starred: Boolean(updated?.starred) } })
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Failed to update document'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const paid = await hasPaidAccess(authData.user.id)
    if (!paid) {
      return NextResponse.json(
        { error: 'Read-only mode: resume plan to manage documents. Your files remain safe.' },
        { status: 402 }
      )
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Missing document id' }, { status: 400 })
    }

    const doc = await getAccessibleDocument(supabase, id)
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Best-effort delete from Storage using service role after access check.
    if (doc.storage_path) {
      const { error: storageErr } = await supabaseAdmin.storage.from('user-uploads').remove([doc.storage_path])
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
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Failed to delete document'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
