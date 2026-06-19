import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'

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

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

async function loadMatterCaseIds(userId: string, userEmail: string) {
  const { data: links, error: linksError } = await supabaseAdmin
    .from('client_business_links')
    .select('business_id, businesses(name)')
    .eq('client_id', userId)
    .eq('status', 'active')

  if (linksError || !Array.isArray(links)) return []

  const email = normalizeEmail(userEmail)
  if (!email) return []

  const caseIds = new Set<string>()
  for (const link of links) {
    const businessId = String((link as Record<string, unknown>).business_id || '')
    if (!businessId) continue

    const { data: matter } = await supabaseAdmin
      .from('client_matters')
      .select('case_id')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .eq('email', email)
      .not('case_id', 'is', null)
      .limit(1)
      .maybeSingle()

    if (matter?.case_id) {
      caseIds.add(String(matter.case_id))
    }
  }

  return Array.from(caseIds)
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user?.id || !user.email) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const caseIds = await loadMatterCaseIds(user.id, user.email)

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
        sourceLabel: 'Your upload',
      })),
      ...((sharedDocsResult as { data?: SharedDocumentRow[] }).data || []).map((doc: SharedDocumentRow) => ({
        id: String(doc.id),
        name: String(doc.name || 'Document'),
        createdAt: String(doc.created_at || new Date().toISOString()),
        size: Number(doc.file_size || 0),
        mimeType: String(doc.mime_type || ''),
        sourceLabel: 'Shared by your professional',
      })),
    ]

    const deduped = Array.from(new Map(docs.map((doc) => [doc.id, doc])).values())

    return NextResponse.json({ documents: deduped, caseIds })
  } catch (error) {
    console.error('Client documents load error:', error)
    return NextResponse.json({ message: 'Unable to load documents.' }, { status: 500 })
  }
}
