import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { hasUserPlatformAccess } from '@/lib/auth/platform-access'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'
import type { User } from '@supabase/supabase-js'

type DocumentQueryClient = Pick<typeof supabaseAdmin, 'from'>

async function hasPaidAccess(userId: string): Promise<boolean> {
  return hasUserPlatformAccess(userId)
}

async function getAccessibleDocument(supabase: DocumentQueryClient, docId: string) {
  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, uploaded_by, case_id, storage_path')
    .eq('id', docId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !doc) return null
  return doc
}

async function canAccessDocument(options: {
  supabase: Awaited<ReturnType<typeof createSupabaseRouteClient>>
  user: User
  doc: { uploaded_by: string | null; case_id: string | null }
}) {
  const { supabase, user, doc } = options

  if (doc.uploaded_by === user.id) {
    return true
  }

  if (!doc.case_id) {
    return false
  }

  const { data: ownedCase, error: ownedCaseError } = await supabase
    .from('cases')
    .select('id')
    .eq('id', doc.case_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (ownedCaseError) {
    throw new Error(ownedCaseError.message)
  }

  if (ownedCase?.id) {
    return true
  }

  try {
    const workspace = await ensureBusinessContext(user)
    const { data: matterRow, error: matterError } = await supabaseAdmin
      .from('client_matters')
      .select('id')
      .eq('business_id', workspace.businessId)
      .eq('case_id', doc.case_id)
      .maybeSingle()

    if (matterError) {
      throw new Error(matterError.message)
    }

    return Boolean(matterRow?.id)
  } catch (error) {
    if (error instanceof BusinessWorkspaceError && error.status === 403) {
      return false
    }
    throw error
  }
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

    const doc = await getAccessibleDocument(supabaseAdmin, id)
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const hasAccess = await canAccessDocument({ supabase, user: authData.user, doc })
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
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
  } catch (error: unknown) {
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

    const doc = await getAccessibleDocument(supabaseAdmin, id)
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const hasAccess = await canAccessDocument({ supabase, user: authData.user, doc })
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    const { error: updateErr } = await supabaseAdmin
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
