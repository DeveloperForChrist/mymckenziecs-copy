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

    const { data: meetings, error: meetingsError } = await supabaseAdmin
      .from('meetings')
      .select('id,client_id,title,description,meeting_date,meeting_time,duration_minutes,room_name,status,created_at,updated_at')
      .eq('user_id', context.userId)
      .order('meeting_date', { ascending: true })
      .order('meeting_time', { ascending: true })

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

    const clientName = asString(body.clientName)
    const clientEmail = asString(body.clientEmail)
    const title = asString(body.title)
    const meetingDate = asString(body.meetingDate)
    const meetingTime = asString(body.meetingTime)
    const description = asOptionalString(body.description)
    const durationMinutes = asPositiveNumber(body.durationMinutes, 45)
    const roomName = asString(body.roomName)
    const status = (asString(body.status) || 'scheduled') as MeetingStatus

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

    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from('meetings')
      .insert({
        user_id: context.userId,
        client_id: clientId,
        title,
        description,
        meeting_date: meetingDate,
        meeting_time: meetingTime,
        duration_minutes: durationMinutes,
        room_name: roomName,
        status,
        location_type: 'video',
      })
      .select('id,client_id,title,description,meeting_date,meeting_time,duration_minutes,room_name,status,created_at,updated_at')
      .single()

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
    const status = asString(body.status) as MeetingStatus
    if (!id || !status) {
      return NextResponse.json({ message: 'Meeting id and status are required.' }, { status: 400 })
    }

    const { data: previousMeeting } = await supabaseAdmin
      .from('meetings')
      .select('id,status,title,meeting_date,meeting_time,client_id')
      .eq('id', id)
      .eq('user_id', context.userId)
      .maybeSingle()

    const { data: meeting, error } = await supabaseAdmin
      .from('meetings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', context.userId)
      .select('id,client_id,title,description,meeting_date,meeting_time,duration_minutes,room_name,status,created_at,updated_at')
      .single()

    if (error || !meeting) {
      console.error('Unable to update meeting', error)
      return NextResponse.json({ message: 'Unable to update meeting.' }, { status: 500 })
    }

    if (String(previousMeeting?.status || '') !== String(meeting.status || '')) {
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
  } catch (error) {
    return errorResponse(error, 'Unable to update meeting.')
  }
}
