import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { loadClientPortalMatters, normalizePortalEmail } from '@/lib/client-portal/portal-matters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function isMissingMeetingPortalColumns(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  const message = String((error as { message?: unknown }).message || '').toLowerCase()
  if (code !== 'PGRST204' && code !== '42703') return false
  return ['business_id', 'client_email', 'client_name', 'matter_id', 'case_id'].some((column) => message.includes(column))
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    const user = authData?.user

    if (authError || !user?.id || !user?.email) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { links, matters } = await loadClientPortalMatters(user.id, user.email)
    const businessIds = Array.from(new Set(links.map((link) => link.businessId).filter(Boolean)))
    if (businessIds.length === 0) {
      return NextResponse.json({ meetings: [] })
    }

    const { data: businesses, error: businessesError } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_user_id, name')
      .in('id', businessIds)

    if (businessesError) {
      console.error('Unable to load client portal businesses', businessesError)
      return NextResponse.json({ message: 'Unable to load meetings.' }, { status: 500 })
    }

    const businessesById = new Map((businesses || []).map((business: any) => [String(business.id), business]))
    const businessesByOwnerId = new Map((businesses || []).map((business: any) => [String(business.owner_user_id), business]))
    const ownerUserIds = Array.from(new Set((businesses || []).map((business: any) => String(business.owner_user_id || '')).filter(Boolean)))

    const normalizedEmail = normalizePortalEmail(user.email)
    const { data: legacyClients, error: clientsError } = ownerUserIds.length
      ? await supabaseAdmin
          .from('clients')
          .select('id, user_id, name, email')
          .in('user_id', ownerUserIds)
          .eq('email', normalizedEmail)
      : { data: [], error: null }

    if (clientsError) {
      console.error('Unable to load legacy client meeting contacts', clientsError)
      return NextResponse.json({ message: 'Unable to load meetings.' }, { status: 500 })
    }

    const legacyClientIds = (legacyClients || []).map((client: any) => String(client.id || '')).filter(Boolean)

    const meetingQuery = supabaseAdmin
      .from('meetings')
      .select('id,user_id,client_id,client_email,client_name,business_id,matter_id,case_id,title,description,meeting_date,meeting_time,duration_minutes,room_name,status,created_at,updated_at')
      .in('user_id', ownerUserIds)
      .in('status', ['scheduled', 'in_progress'])
      .order('meeting_date', { ascending: true })
      .order('meeting_time', { ascending: true })

    let meetingsResult: any = await meetingQuery

    if (meetingsResult.error && isMissingMeetingPortalColumns(meetingsResult.error)) {
      meetingsResult = await supabaseAdmin
        .from('meetings')
        .select('id,user_id,client_id,title,description,meeting_date,meeting_time,duration_minutes,room_name,status,created_at,updated_at')
        .in('user_id', ownerUserIds)
        .in('status', ['scheduled', 'in_progress'])
        .order('meeting_date', { ascending: true })
        .order('meeting_time', { ascending: true })
    }

    const { data: meetings, error: meetingsError } = meetingsResult

    if (meetingsError) {
      console.error('Unable to load client meetings', meetingsError)
      return NextResponse.json({ message: 'Unable to load meetings.' }, { status: 500 })
    }

    const legacyClientsById = new Map((legacyClients || []).map((client: any) => [String(client.id), client]))
    const caseMatters = new Map(matters.filter((matter) => matter.caseId).map((matter) => [String(matter.caseId), matter]))
    const matterById = new Map(matters.map((matter) => [matter.id, matter]))

    const filteredMeetings = (meetings || []).filter((meeting: any) => {
      const meetingClientEmail = normalizePortalEmail(meeting.client_email || legacyClientsById.get(String(meeting.client_id || ''))?.email)
      if (meetingClientEmail && meetingClientEmail === normalizedEmail) return true
      return legacyClientIds.includes(String(meeting.client_id || ''))
    })

    return NextResponse.json({
      meetings: filteredMeetings.map((meeting: any) => {
        const legacyClient = legacyClientsById.get(String(meeting.client_id || ''))
        const business =
          businessesById.get(String(meeting.business_id || '')) ||
          businessesByOwnerId.get(String(meeting.user_id || ''))
        const matter =
          matterById.get(String(meeting.matter_id || '')) ||
          caseMatters.get(String(meeting.case_id || '')) ||
          matters.find((entry) => entry.businessId === String(business?.id || '') && entry.status === 'active') ||
          null

        return {
          id: String(meeting.id),
          title: String(meeting.title || 'Client consultation'),
          description: String(meeting.description || ''),
          meetingDate: String(meeting.meeting_date || ''),
          meetingTime: String(meeting.meeting_time || '').slice(0, 5),
          durationMinutes: Number(meeting.duration_minutes || 45),
          roomName: String(meeting.room_name || ''),
          status: String(meeting.status || 'scheduled'),
          clientName: String(meeting.client_name || legacyClient?.name || 'Client'),
          businessId: String(business?.id || ''),
          businessName: String(business?.name || 'Legal professional'),
          matterId: matter?.id || (typeof meeting.matter_id === 'string' ? meeting.matter_id : null),
          caseId: matter?.caseId || (typeof meeting.case_id === 'string' ? meeting.case_id : null),
          matterLabel: matter?.matterNumber || matter?.issueType || null,
          matterStage: matter?.stage || null,
        }
      }),
    })
  } catch (error) {
    console.error('Unable to load client meetings', error)
    return NextResponse.json({ message: 'Unable to load meetings.' }, { status: 500 })
  }
}
