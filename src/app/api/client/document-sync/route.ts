import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { createBusinessAlert } from '@/lib/business/alerts'
import { loadClientPortalMatters } from '@/lib/client-portal/portal-matters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type SyncTarget = {
  businessId: string
  businessName: string
  caseId: string
  matterId: string
  matterLabel: string
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

async function loadTargets(userId: string, userEmail: string): Promise<SyncTarget[]> {
  const { matters } = await loadClientPortalMatters(userId, normalizeEmail(userEmail))
  return matters
    .filter((matter) => matter.status === 'active' && matter.caseId)
    .map((matter) => ({
      businessId: matter.businessId,
      businessName: matter.businessName,
      caseId: String(matter.caseId),
      matterId: matter.id,
      matterLabel: matter.matterNumber || matter.issueType || matter.clientName || 'Client matter',
    }))
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const targets = await loadTargets(user.id, user.email || '')
    return NextResponse.json({ targets })
  } catch (error) {
    console.error('Document sync target load failed:', error)
    return NextResponse.json({ message: 'Unable to load sync targets.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const businessId = typeof body?.businessId === 'string' ? body.businessId.trim() : ''
    const matterId = typeof body?.matterId === 'string' ? body.matterId.trim() : ''
    const caseId = typeof body?.caseId === 'string' ? body.caseId.trim() : ''
    const mode = body?.mode === 'remove' ? 'remove' : 'sync'
    const documentIdsRaw = Array.isArray(body?.documentIds) ? body.documentIds : []
    const documentIds = documentIdsRaw
      .map((id: unknown) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean)

    if (!businessId || documentIds.length === 0) {
      return NextResponse.json({ message: 'businessId and documentIds are required.' }, { status: 400 })
    }

    const targets = await loadTargets(user.id, user.email || '')
    const target = targets.find((item) => {
      if (item.businessId !== businessId) return false
      if (matterId) return item.matterId === matterId
      if (caseId) return item.caseId === caseId
      return true
    })
    if (!target) {
      return NextResponse.json({ message: 'No active professional matter found for this account.' }, { status: 403 })
    }

    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('owner_user_id')
      .eq('id', businessId)
      .maybeSingle()
    const ownerUserId = String(business?.owner_user_id || '')
    if (!ownerUserId) {
      return NextResponse.json({ message: 'Business owner not found.' }, { status: 404 })
    }

    const { data: sourceDocuments, error: sourceError } = await supabaseAdmin
      .from('documents')
      .select('id, name, storage_url, storage_path, type, file_size, mime_type, deleted_at')
      .in('id', documentIds)
      .eq('uploaded_by', user.id)
      .is('deleted_at', null)

    if (sourceError) {
      return NextResponse.json({ message: sourceError.message }, { status: 500 })
    }
    if (!Array.isArray(sourceDocuments) || sourceDocuments.length === 0) {
      return NextResponse.json({ message: 'No eligible documents found to sync.' }, { status: 404 })
    }

    const existingPaths = sourceDocuments
      .map((doc) => String(doc.storage_path || ''))
      .filter(Boolean)
    const { data: existingRows } = existingPaths.length
      ? await supabaseAdmin
          .from('documents')
          .select('storage_path')
          .eq('case_id', target.caseId)
          .eq('uploaded_by', ownerUserId)
          .in('storage_path', existingPaths)
          .is('deleted_at', null)
      : { data: [] as Array<{ storage_path?: string | null }> }

    const existingPathSet = new Set((existingRows || []).map((row) => String(row.storage_path || '')))

    const toInsert = sourceDocuments
      .filter((doc) => !existingPathSet.has(String(doc.storage_path || '')))
      .map((doc) => ({
        case_id: target.caseId,
        name: `[Shared by client] ${String(doc.name || 'Document')}`,
        storage_url: String(doc.storage_url || doc.storage_path || ''),
        storage_path: String(doc.storage_path || ''),
        type: doc.type || null,
        file_size: typeof doc.file_size === 'number' ? doc.file_size : null,
        mime_type: doc.mime_type || null,
        uploaded_by: ownerUserId,
        starred: false,
      }))
      .filter((row) => row.storage_url && row.storage_path)

    if (mode === 'remove') {
      const sourcePaths = sourceDocuments
        .map((doc) => String(doc.storage_path || ''))
        .filter(Boolean)
      if (sourcePaths.length > 0) {
        const { error: removeError } = await supabaseAdmin
          .from('documents')
          .update({ deleted_at: new Date().toISOString() })
          .eq('case_id', target.caseId)
          .eq('uploaded_by', ownerUserId)
          .in('storage_path', sourcePaths)
          .is('deleted_at', null)
        if (removeError) {
          console.error('Document unsync failed:', removeError)
          return NextResponse.json({ message: 'Failed to remove shared documents.' }, { status: 500 })
        }
      }
      await createBusinessAlert({
        businessId,
        type: 'document',
        priority: 'low',
        title: 'Client removed shared document copies',
        body: `${user.email || 'Client'} removed ${sourcePaths.length} shared document ${sourcePaths.length === 1 ? 'copy' : 'copies'} from ${target.matterLabel}.`,
        actionLabel: 'View Documents',
        dedupeKey: `client-doc-remove:${businessId}:${user.id}:${target.caseId}:${sourcePaths.sort().join('|')}`,
        dedupeWindowMinutes: 5,
        metadata: { mode: 'remove', sourcePaths, targetCaseId: target.caseId, matterId: target.matterId },
      })
      return NextResponse.json({
        message: 'Shared document copies removed successfully.',
        removedCount: sourcePaths.length,
        target,
      })
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin.from('documents').insert(toInsert)
      if (insertError) {
        console.error('Document sync insert failed:', insertError)
        return NextResponse.json({ message: 'Failed to sync documents.' }, { status: 500 })
      }
    }
    await createBusinessAlert({
      businessId,
      type: 'document',
      priority: toInsert.length > 0 ? 'medium' : 'low',
      title: toInsert.length > 0 ? 'Client shared documents' : 'Client re-synced documents',
      body:
        toInsert.length > 0
          ? `${user.email || 'Client'} shared ${toInsert.length} document${toInsert.length === 1 ? '' : 's'} to ${target.matterLabel}.`
          : `${user.email || 'Client'} re-synced documents to ${target.matterLabel}.`,
      actionLabel: 'View Documents',
      dedupeKey: `client-doc-sync:${businessId}:${user.id}:${target.caseId}:${documentIds.sort().join('|')}:${toInsert.length}`,
      dedupeWindowMinutes: 5,
      metadata: {
        mode: 'sync',
        syncedCount: toInsert.length,
        skippedCount: sourceDocuments.length - toInsert.length,
        targetCaseId: target.caseId,
        matterId: target.matterId,
      },
    })

    return NextResponse.json({
      message: 'Documents synced successfully.',
      syncedCount: toInsert.length,
      skippedCount: sourceDocuments.length - toInsert.length,
      target,
    })
  } catch (error) {
    console.error('Document sync failed:', error)
    return NextResponse.json({ message: 'Unable to sync documents.' }, { status: 500 })
  }
}
