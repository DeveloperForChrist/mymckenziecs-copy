import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'
import { createBusinessAlert } from '@/lib/business/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return input as Record<string, unknown>
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asOptionalString(value: unknown) {
  const next = asString(value)
  return next || null
}

function asBoolean(value: unknown) {
  return value === true || value === 'true'
}

function normalizeEmail(value: unknown) {
  return asString(value).toLowerCase()
}

function asPositiveNumber(value: unknown, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return numeric
}

async function getContext() {
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) throw new BusinessWorkspaceError('Unauthorized', 401)
  return ensureBusinessContext(user)
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BusinessWorkspaceError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  console.error(fallback, error)
  return NextResponse.json({ message: fallback }, { status: 500 })
}

function isMissingMeetingPortalColumns(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  const message = String((error as { message?: unknown }).message || '').toLowerCase()
  if (code !== 'PGRST204' && code !== '42703') return false
  return ['business_id', 'client_email', 'client_name', 'matter_id', 'case_id'].some((column) => message.includes(column))
}

function isMeetingStatus(value: string): value is MeetingStatus {
  return value === 'scheduled' || value === 'in_progress' || value === 'completed' || value === 'cancelled' || value === 'no_show'
}

type MeetingContext = Awaited<ReturnType<typeof getContext>>

async function updateMeetingStatus(context: MeetingContext, id: string, status: MeetingStatus, skipAlert = false) {
  const { data: previousMeeting } = await supabaseAdmin
    .from('meetings')
    .select('id,status,title,meeting_date,meeting_time,client_id')
    .eq('id', id)
    .eq('user_id', context.userId)
    .maybeSingle()

  let updateResult: any = await supabaseAdmin
    .from('meetings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', context.userId)
    .select('id,client_id,client_name,client_email,business_id,matter_id,case_id,title,description,meeting_date,meeting_time,duration_minutes,room_name,status,created_at,updated_at')
    .single()

  if (updateResult.error && isMissingMeetingPortalColumns(updateResult.error)) {
    updateResult = await supabaseAdmin
      .from('meetings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', context.userId)
      .select('id,client_id,title,description,meeting_date,meeting_time,duration_minutes,room_name,status,created_at,updated_at')
      .single()
  }

  const { data: meeting, error } = updateResult

  if (error || !meeting) {
    console.error('Unable to update meeting', error)
    return NextResponse.json({ message: 'Unable to update meeting.' }, { status: 500 })
  }

  if (!skipAlert && String(previousMeeting?.status || '') !== String(meeting.status || '')) {
    await createBusinessAlert({
      businessId: context.businessId,
      type: 'meeting',
      priority: status === 'cancelled' ? 'low' : 'medium',
      title: 'Meeting status updated',
      body: `"${meeting.title}" is now ${meeting.status}.`,
      actionLabel: 'Open Meetings',
      metadata: { meetingId: meeting.id, from: previousMeeting?.status || null, to: meeting.status },
    })
  }

  return NextResponse.json({ meeting })
}

export async function GET() {
  try {
    const context = await getContext()

    const { data: clients, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('id,name,email,phone,company,notes')
      .eq('user_id', context.userId)

    if (clientsError) {
      console.error('Unable to load clients', clientsError)
      return NextResponse.json({ message: 'Unable to load meetings.' }, { status: 500 })
    }

    let meetingsResult: any = await supabaseAdmin
      .from('meetings')
      .select('id,client_id,client_name,client_email,business_id,matter_id,case_id,title,description,meeting_date,meeting_time,duration_minutes,room_name,status,created_at,updated_at')
      .eq('user_id', context.userId)
      .order('meeting_date', { ascending: true })
      .order('meeting_time', { ascending: true })

    if (meetingsResult.error && isMissingMeetingPortalColumns(meetingsResult.error)) {
      meetingsResult = await supabaseAdmin
        .from('meetings')
        .select('id,client_id,title,description,meeting_date,meeting_time,duration_minutes,room_name,status,created_at,updated_at')
        .eq('user_id', context.userId)
        .order('meeting_date', { ascending: true })
        .order('meeting_time', { ascending: true })
    }

    const { data: meetings, error: meetingsError } = meetingsResult

    if (meetingsError) {
      console.error('Unable to load meetings', meetingsError)
      return NextResponse.json({ message: 'Unable to load meetings.' }, { status: 500 })
    }

    return NextResponse.json({ clients: clients ?? [], meetings: meetings ?? [] })
  } catch (error) {
    return errorResponse(error, 'Unable to load meetings.')
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getContext()
    const body = asRecord(await request.json())
    if (!body) return NextResponse.json({ message: 'Invalid meeting payload.' }, { status: 400 })

    const id = asString(body.id)
    const clientName = asString(body.clientName)
    const clientEmail = asString(body.clientEmail)
    const title = asString(body.title)
    const meetingDate = asString(body.meetingDate)
    const meetingTime = asString(body.meetingTime)
    const description = asOptionalString(body.description)
    const durationMinutes = asPositiveNumber(body.durationMinutes, 45)
    const roomName = asString(body.roomName)
    const statusValue = asString(body.status)
    const status = (statusValue || 'scheduled') as MeetingStatus
    const matterId = asOptionalString(body.matterId)
    const caseId = asOptionalString(body.caseId)
    const skipAlert = asBoolean(body.skipAlert)

    if (id && isMeetingStatus(statusValue) && !clientName && !clientEmail && !title && !meetingDate && !meetingTime && !roomName) {
      return updateMeetingStatus(context, id, statusValue, skipAlert)
    }

    if (!clientName || !title || !meetingDate || !meetingTime || !roomName) {
      return NextResponse.json({ message: 'Missing required meeting fields.' }, { status: 400 })
    }

    let clientId: string | null = asOptionalString(body.clientId)
    if (!clientId) {
      const { data: existingClient } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('user_id', context.userId)
        .eq('name', clientName)
        .eq('email', clientEmail || null)
        .maybeSingle()

      if (existingClient?.id) {
        clientId = String(existingClient.id)
      } else {
        const { data: createdClient, error: createClientError } = await supabaseAdmin
          .from('clients')
          .insert({
            user_id: context.userId,
            name: clientName,
            email: clientEmail || null,
          })
          .select('id')
          .single()

        if (createClientError || !createdClient?.id) {
          console.error('Unable to create client', createClientError)
          return NextResponse.json({ message: 'Unable to create client for meeting.' }, { status: 500 })
        }
        clientId = String(createdClient.id)
      }
    }

    const insertPayload = {
      user_id: context.userId,
      client_id: clientId,
      business_id: context.businessId,
      client_name: clientName,
      client_email: normalizeEmail(clientEmail) || null,
      matter_id: matterId,
      case_id: caseId,
      title,
      description,
      meeting_date: meetingDate,
      meeting_time: meetingTime,
      duration_minutes: durationMinutes,
      room_name: roomName,
      status,
      location_type: 'video',
    }

    let createResult: any = await supabaseAdmin
      .from('meetings')
      .insert(insertPayload)
      .select('id,client_id,client_name,client_email,business_id,matter_id,case_id,title,description,meeting_date,meeting_time,duration_minutes,room_name,status,created_at,updated_at')
      .single()

    if (createResult.error && isMissingMeetingPortalColumns(createResult.error)) {
      const {
        business_id: _businessId,
        client_name: _clientName,
        client_email: _clientEmail,
        matter_id: _matterId,
        case_id: _caseId,
        ...legacyInsertPayload
      } = insertPayload

      createResult = await supabaseAdmin
        .from('meetings')
        .insert(legacyInsertPayload)
        .select('id,client_id,title,description,meeting_date,meeting_time,duration_minutes,room_name,status,created_at,updated_at')
        .single()
    }

    const { data: meeting, error: meetingError } = createResult

    if (meetingError || !meeting) {
      console.error('Unable to create meeting', meetingError)
      return NextResponse.json({ message: 'Unable to schedule meeting.' }, { status: 500 })
    }

    await createBusinessAlert({
      businessId: context.businessId,
      type: 'meeting',
      priority: 'medium',
      title: 'Client meeting scheduled',
      body: `${clientName} meeting "${title}" set for ${meetingDate} ${meetingTime}.`,
      clientName,
      actionLabel: 'Open Meetings',
      metadata: { meetingId: meeting.id, status: meeting.status },
    })

    return NextResponse.json({ meeting })
  } catch (error) {
    return errorResponse(error, 'Unable to schedule meeting.')
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getContext()
    const body = asRecord(await request.json())
    if (!body) return NextResponse.json({ message: 'Invalid meeting payload.' }, { status: 400 })

    const id = asString(body.id)
    const statusValue = asString(body.status)
    if (!id || !isMeetingStatus(statusValue)) {
      return NextResponse.json({ message: 'Meeting id and status are required.' }, { status: 400 })
    }
    return updateMeetingStatus(context, id, statusValue, asBoolean(body.skipAlert))
  } catch (error) {
    return errorResponse(error, 'Unable to update meeting.')
  }
}
