import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    const user = authData?.user

    if (authError || !user?.email) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { data: clients, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('id,name,email,user_id')
      .eq('email', user.email)

    if (clientsError) {
      console.error('Unable to load client meeting contacts', clientsError)
      return NextResponse.json({ message: 'Unable to load meetings.' }, { status: 500 })
    }

    const clientRows = clients ?? []
    const clientIds = clientRows.map((client) => String(client.id))
    if (clientIds.length === 0) {
      return NextResponse.json({ meetings: [] })
    }

    const { data: meetings, error: meetingsError } = await supabaseAdmin
      .from('meetings')
      .select('id,user_id,client_id,title,description,meeting_date,meeting_time,duration_minutes,room_name,status,created_at,updated_at')
      .in('client_id', clientIds)
      .in('status', ['scheduled', 'in_progress'])
      .order('meeting_date', { ascending: true })
      .order('meeting_time', { ascending: true })

    if (meetingsError) {
      console.error('Unable to load client meetings', meetingsError)
      return NextResponse.json({ message: 'Unable to load meetings.' }, { status: 500 })
    }

    const businessIds = Array.from(new Set((meetings ?? []).map((meeting) => String(meeting.user_id)).filter(Boolean)))
    const { data: businesses } = businessIds.length
      ? await supabaseAdmin
          .from('businesses')
          .select('owner_user_id,name')
          .in('owner_user_id', businessIds)
      : { data: [] as Array<{ user_id: string; name: string }> }

    const clientsById = new Map(clientRows.map((client) => [String(client.id), client]))
    const businessesByUserId = new Map((businesses ?? []).map((business: any) => [String(business.owner_user_id), business]))

    return NextResponse.json({
      meetings: (meetings ?? []).map((meeting) => {
        const client = clientsById.get(String(meeting.client_id))
        const business = businessesByUserId.get(String(meeting.user_id))
        return {
          id: String(meeting.id),
          title: String(meeting.title || 'Client consultation'),
          description: String(meeting.description || ''),
          meetingDate: String(meeting.meeting_date || ''),
          meetingTime: String(meeting.meeting_time || '').slice(0, 5),
          durationMinutes: Number(meeting.duration_minutes || 45),
          roomName: String(meeting.room_name || ''),
          status: String(meeting.status || 'scheduled'),
          clientName: String(client?.name || 'Client'),
          businessName: String(business?.name || 'Legal professional'),
        }
      }),
    })
  } catch (error) {
    console.error('Unable to load client meetings', error)
    return NextResponse.json({ message: 'Unable to load meetings.' }, { status: 500 })
  }
}
