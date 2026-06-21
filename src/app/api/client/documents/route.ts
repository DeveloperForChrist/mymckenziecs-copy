import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { loadClientPortalMatters } from '@/lib/client-portal/portal-matters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type SharedDocumentRow = {
  id: string
  name: string
  created_at: string
  file_size?: number | null
  mime_type?: string | null
  case_id?: string | null
  uploaded_by?: string | null
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user?.id || !user.email) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const { matters } = await loadClientPortalMatters(user.id, user.email)
    const caseIds = Array.from(new Set(matters.map((matter) => matter.caseId).filter((value): value is string => Boolean(value))))
    const matterByCaseId = new Map(matters.filter((matter) => matter.caseId).map((matter) => [String(matter.caseId), matter]))

    const [ownDocsResult, sharedDocsResult] = await Promise.all([
      supabaseAdmin
        .from('documents')
        .select('id, name, created_at, file_size, mime_type, case_id, uploaded_by')
        .eq('uploaded_by', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      caseIds.length > 0
        ? supabaseAdmin
            .from('documents')
            .select('id, name, created_at, file_size, mime_type, case_id, uploaded_by')
            .in('case_id', caseIds)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as SharedDocumentRow[] }),
    ])

    if (ownDocsResult.error) {
      return NextResponse.json({ message: ownDocsResult.error.message || 'Unable to load documents.' }, { status: 500 })
    }

    if ('error' in sharedDocsResult && sharedDocsResult.error) {
      return NextResponse.json({ message: sharedDocsResult.error.message || 'Unable to load documents.' }, { status: 500 })
    }

    const docs = [
      ...(ownDocsResult.data || []).map((doc: SharedDocumentRow) => ({
        id: String(doc.id),
        name: String(doc.name || 'Document'),
        createdAt: String(doc.created_at || new Date().toISOString()),
        size: Number(doc.file_size || 0),
        mimeType: String(doc.mime_type || ''),
        businessId: null,
        matterId: null,
        caseId: null,
        matterLabel: null,
        sourceLabel: 'Your upload',
      })),
      ...((sharedDocsResult as { data?: SharedDocumentRow[] }).data || []).map((doc: SharedDocumentRow) => {
        const matter = doc.case_id ? matterByCaseId.get(String(doc.case_id)) : null
        return {
          id: String(doc.id),
          name: String(doc.name || 'Document'),
          createdAt: String(doc.created_at || new Date().toISOString()),
          size: Number(doc.file_size || 0),
          mimeType: String(doc.mime_type || ''),
          businessId: matter?.businessId || null,
          matterId: matter?.id || null,
          caseId: doc.case_id ? String(doc.case_id) : null,
          matterLabel: matter?.matterNumber || matter?.issueType || null,
          sourceLabel: 'Shared by your professional',
        }
      }),
    ]

    const deduped = Array.from(new Map(docs.map((doc) => [doc.id, doc])).values())

    return NextResponse.json({
      documents: deduped,
      caseIds,
      matters: matters.map((matter) => ({
        id: matter.id,
        businessId: matter.businessId,
        businessName: matter.businessName,
        caseId: matter.caseId,
        matterNumber: matter.matterNumber,
        issueType: matter.issueType,
        status: matter.status,
        stage: matter.stage,
      })),
    })
  } catch (error) {
    console.error('Client documents load error:', error)
    return NextResponse.json({ message: 'Unable to load documents.' }, { status: 500 })
  }
}
