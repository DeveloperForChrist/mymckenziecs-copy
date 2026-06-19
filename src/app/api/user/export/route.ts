import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { CHAT_UPLOAD_BUCKET } from '@/lib/chat/upload-store'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type IdRow = { id: string }
type AnyRecord = Record<string, any>
type SignedDocument = AnyRecord & { downloadUrl: string | null }

const dedupeStrings = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))

const toIsoDate = (value = new Date()) => value.toISOString().slice(0, 10)

const asArray = <T = AnyRecord>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

async function loadSignedDocumentLinks(documents: AnyRecord[]): Promise<SignedDocument[]> {
  const attachments = await Promise.all(
    documents.map(async (doc) => {
      const storagePath = String(doc.storage_path || '').trim()
      if (!storagePath) {
        return {
          ...doc,
          downloadUrl: null,
        }
      }

      const { data } = await supabaseAdmin.storage
        .from(CHAT_UPLOAD_BUCKET)
        .createSignedUrl(storagePath, 60 * 60)

      return {
        ...doc,
        downloadUrl: data?.signedUrl || null,
      }
    })
  )

  return attachments as SignedDocument[]
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = authData.user
    const userId = user.id
    const userEmail = user.email || ''

    const privacyRequestQuery = supabaseAdmin
      .from('privacy_requests')
      .select('*')

    if (userEmail) {
      privacyRequestQuery.or(`user_id.eq.${userId},user_email.eq.${userEmail}`)
    } else {
      privacyRequestQuery.eq('user_id', userId)
    }

    const [
      userRowResult,
      preferencesResult,
      entitlementResult,
      subscriptionResult,
      professionalProfileResult,
      ownedBusinessesResult,
      membershipsResult,
      clientsResult,
      meetingsResult,
      invitesSentResult,
      invitesReceivedResult,
      portalLinksResult,
      notesResult,
      caseLawResult,
      calendarEventsResult,
      chatUploadsResult,
      privacyRequestsResult,
    ] = await Promise.all([
      supabaseAdmin.from('users').select('*').eq('id', userId).maybeSingle(),
      supabaseAdmin.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('user_entitlements').select('*').eq('user_id', userId).maybeSingle(),
      supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }),
      supabaseAdmin.from('professional_profiles').select('*').eq('owner_id', userId).maybeSingle(),
      supabaseAdmin
        .from('businesses')
        .select('id, owner_user_id, name, billing_email, plan_type, status, created_at, updated_at')
        .eq('owner_user_id', userId)
        .order('updated_at', { ascending: false }),
      supabaseAdmin
        .from('business_members')
        .select('business_id, user_id, role, status, invited_by, joined_at, created_at, updated_at, businesses(id, name, owner_user_id)')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }),
      supabaseAdmin
        .from('clients')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('meetings')
        .select('*')
        .eq('user_id', userId)
        .order('meeting_date', { ascending: false }),
      supabaseAdmin
        .from('client_invitations')
        .select('*')
        .eq('inviter_id', userId)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('client_invitations')
        .select('*')
        .eq('invited_email', userEmail)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('client_business_links')
        .select('*')
        .eq('client_id', userId)
        .order('updated_at', { ascending: false }),
      supabaseAdmin.from('user_notes').select('*').eq('user_id', userId).maybeSingle(),
      supabaseAdmin
        .from('user_case_law_history')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
      supabaseAdmin
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('chat_uploads')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false }),
      privacyRequestQuery.order('submitted_at', { ascending: false }),
    ])

    if (userRowResult.error) {
      return NextResponse.json({ error: userRowResult.error.message }, { status: 500 })
    }

    const ownedBusinesses = asArray(ownedBusinessesResult.data)
    const memberships = asArray(membershipsResult.data)
    const businessIds = dedupeStrings([
      ...ownedBusinesses.map((row) => row.id),
      ...memberships.map((row) => row.business_id),
    ])

    const businessLeadResult = businessIds.length
      ? await supabaseAdmin
          .from('business_leads')
          .select('*')
          .in('business_id', businessIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null }

    const clientMatterResult = businessIds.length
      ? await supabaseAdmin
          .from('client_matters')
          .select('*')
          .in('business_id', businessIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null }

    const businessLeadRows = asArray(businessLeadResult.data)
    const clientMatterRows = asArray(clientMatterResult.data)
    const personalCaseResult = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (businessLeadResult.error) {
      return NextResponse.json({ error: businessLeadResult.error.message }, { status: 500 })
    }

    if (clientMatterResult.error) {
      return NextResponse.json({ error: clientMatterResult.error.message }, { status: 500 })
    }

    if (personalCaseResult.error) {
      return NextResponse.json({ error: personalCaseResult.error.message }, { status: 500 })
    }

    const personalCases = asArray(personalCaseResult.data)
    const businessCaseIds = dedupeStrings(clientMatterRows.map((row) => row.case_id))
    const allCaseIds = dedupeStrings([
      ...personalCases.map((row) => row.id),
      ...businessCaseIds,
    ])

    const [documentsByOwnerResult, documentsByCaseResult, messagesResult] = await Promise.all([
      supabaseAdmin
        .from('documents')
        .select('id, case_id, name, type, file_size, mime_type, storage_path, storage_url, uploaded_by, created_at, deleted_at')
        .eq('uploaded_by', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      allCaseIds.length
        ? supabaseAdmin
            .from('documents')
            .select('id, case_id, name, type, file_size, mime_type, storage_path, storage_url, uploaded_by, created_at, deleted_at')
            .in('case_id', allCaseIds)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      allCaseIds.length
        ? supabaseAdmin
            .from('messages')
            .select('id, case_id, conversation_id, role, content, timestamp, metadata')
            .in('case_id', allCaseIds)
            .order('timestamp', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (documentsByOwnerResult.error) {
      return NextResponse.json({ error: documentsByOwnerResult.error.message }, { status: 500 })
    }

    if ('error' in documentsByCaseResult && documentsByCaseResult.error) {
      return NextResponse.json({ error: documentsByCaseResult.error.message }, { status: 500 })
    }

    if ('error' in messagesResult && messagesResult.error) {
      return NextResponse.json({ error: messagesResult.error.message }, { status: 500 })
    }

    const mergedDocuments: AnyRecord[] = Array.from(
      new Map(
        [
          ...asArray(documentsByOwnerResult.data),
          ...asArray((documentsByCaseResult as { data?: Array<Record<string, any>> }).data),
        ].map((doc) => [doc.id, doc])
      ).values()
    )
    const documents = await loadSignedDocumentLinks(mergedDocuments)
    const documentAnalysisIds = dedupeStrings(documents.map((doc) => doc.id))
    const documentAnalysesResult = documentAnalysisIds.length
      ? await supabaseAdmin
          .from('document_analyses')
          .select('id, document_id, analysis_text, analyzed_at, created_at')
          .in('document_id', documentAnalysisIds)
          .order('analyzed_at', { ascending: false })
      : { data: [] as AnyRecord[], error: null }

    if ('error' in documentAnalysesResult && documentAnalysesResult.error) {
      return NextResponse.json({ error: documentAnalysesResult.error.message }, { status: 500 })
    }

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      user: userRowResult.data,
      account: {
        email: userEmail,
        authUserId: userId,
        currentPlan: subscriptionResult.data?.[0] || null,
        entitlement: entitlementResult.data || null,
      },
      preferences: preferencesResult.data || null,
      profile: professionalProfileResult.data || null,
      businesses: ownedBusinesses,
      businessMemberships: memberships,
      clients: asArray(clientsResult.data),
      meetings: asArray(meetingsResult.data),
      clientInvitationsSent: asArray(invitesSentResult.data),
      clientInvitationsReceived: asArray(invitesReceivedResult.data),
      clientBusinessLinks: asArray(portalLinksResult.data),
      leads: businessLeadRows,
      matters: clientMatterRows,
      cases: personalCases,
      documents,
      documentAnalyses: asArray(documentAnalysesResult.data),
      messages: asArray(messagesResult.data),
      notes: notesResult.data || null,
      caseLawHistory: caseLawResult.data || null,
      calendarEvents: asArray(calendarEventsResult.data),
      chatUploads: asArray(chatUploadsResult.data).map((row) => ({
        ...row,
        storage_bucket: CHAT_UPLOAD_BUCKET,
      })),
      privacyRequests: asArray(privacyRequestsResult.data),
      summary: {
        ownedBusinesses: ownedBusinesses.length,
        memberships: memberships.length,
        clients: asArray(clientsResult.data).length,
        meetings: asArray(meetingsResult.data).length,
        cases: personalCases.length + clientMatterRows.filter((row) => Boolean(row.case_id)).length,
        documents: documents.length,
        messages: asArray(messagesResult.data).length,
        privacyRequests: asArray(privacyRequestsResult.data).length,
      },
    }

    const body = JSON.stringify(exportPayload, null, 2)
    const filename = `mymckenziecs-data-export-${toIsoDate()}.json`

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    console.error('Privacy export error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to build data export.' },
      { status: 500 }
    )
  }
}
