import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { sendResendEmail } from '@/lib/email/resend'
import { getAppUrl } from '@/lib/app-url'
import { verifyCronSecret } from '@/lib/security/timing-safe'
import { createBusinessAlert } from '@/lib/business/alerts'
import { renderPlainEmail } from '@/lib/email/plain-template'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type MeetingRow = {
  id: string
  user_id: string
  client_id: string | null
  title: string
  description: string | null
  meeting_date: string
  meeting_time: string | null
  room_name: string
  status: string
  reminder_sent: boolean
  client_reminder_sent_at: string | null
  professional_reminder_sent_at: string | null
}

type UserRow = {
  id: string
  email: string | null
  name: string | null
}

type ClientRow = {
  id: string
  name: string | null
  email: string | null
}

type BusinessRow = {
  id: string
  owner_user_id: string
  name: string | null
}

type PreferenceRow = {
  user_id: string
  email_notifications: boolean | null
  meeting_reminder_minutes: number | null
}

type ProfessionalProfileRow = {
  owner_id: string
  display_name: string | null
  business_name: string | null
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function toDateKey(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function normalizeTime(value: string | null | undefined) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return '09:00'
  return trimmed.slice(0, 5)
}

function buildMeetingDateTime(meetingDate: string, meetingTime: string | null | undefined) {
  return new Date(`${meetingDate}T${normalizeTime(meetingTime)}:00`)
}

function formatDateLabel(value: Date) {
  return value.toLocaleDateString('en-GB', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function formatTimeLabel(value: string | null | undefined) {
  const time = normalizeTime(value)
  return time || 'Time TBC'
}

function parseLeadMinutes(value: number | null | undefined) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1440
  return Math.max(15, Math.trunc(parsed))
}

function buildProfessionalName(user: UserRow | undefined) {
  return String(user?.name || user?.email || 'Professional')
}

function buildClientName(client: ClientRow | undefined) {
  return String(client?.name || 'Client')
}

function asOptionalString(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || null
}

function buildBusinessName(params: {
  user: UserRow | undefined
  business: BusinessRow | undefined
  profile: ProfessionalProfileRow | undefined
}) {
  return (
    asOptionalString(params.profile?.business_name) ||
    asOptionalString(params.business?.name) ||
    buildProfessionalName(params.user)
  )
}

function isDue(meetingDateTime: Date, leadMinutes: number, now: Date) {
  const minutesUntil = (meetingDateTime.getTime() - now.getTime()) / 60000
  return minutesUntil >= 0 && minutesUntil <= leadMinutes
}

async function markMeetingReminderState(meeting: MeetingRow, updates: Record<string, unknown>) {
  const nextClientSentAt = String(updates.client_reminder_sent_at || meeting.client_reminder_sent_at || '')
  const nextProfessionalSentAt = String(
    updates.professional_reminder_sent_at || meeting.professional_reminder_sent_at || '',
  )
  const { error } = await supabaseAdmin
    .from('meetings')
    .update({
      ...updates,
      reminder_sent: Boolean(nextClientSentAt) && Boolean(nextProfessionalSentAt),
      updated_at: new Date().toISOString(),
    })
    .eq('id', meeting.id)

  if (error) {
    console.error('Meeting reminders: failed to update delivery state', error)
  }
}

function buildClientReminderText(params: {
  clientName: string
  businessName: string
  meetingTitle: string
  dateLabel: string
  timeLabel: string
  joinUrl: string
}) {
  return [
    `Hello ${params.clientName},`,
    '',
    `This is a reminder that your video call with ${params.businessName} is scheduled for ${params.dateLabel} at ${params.timeLabel}.`,
    '',
    `Meeting: ${params.meetingTitle}`,
    `Join link: ${params.joinUrl}`,
    '',
    `If you need to reschedule, please contact ${params.businessName}.`,
    '',
    'Kind regards,',
    'MyMcKenzieCS',
  ].join('\n')
}

function buildProfessionalReminderText(params: {
  professionalName: string
  clientName: string
  clientNotice: string
  meetingTitle: string
  dateLabel: string
  timeLabel: string
  joinUrl: string
}) {
  return [
    `Hello ${params.professionalName},`,
    '',
    `A video call with ${params.clientName} is due soon. ${params.clientNotice}`,
    '',
    `Meeting: ${params.meetingTitle}`,
    `Date: ${params.dateLabel}`,
    `Time: ${params.timeLabel}`,
    `Open meeting room: ${params.joinUrl}`,
    '',
    'Kind regards,',
    'MyMcKenzieCS',
  ].join('\n')
}

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const headerSecret = request.headers.get('x-cron-secret') || request.headers.get('authorization')

    if (!verifyCronSecret(headerSecret, cronSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const today = toDateKey(now)
    const horizon = toDateKey(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000))

    const { data: meetings, error } = await supabaseAdmin
      .from('meetings')
      .select(
        'id,user_id,client_id,title,description,meeting_date,meeting_time,room_name,status,reminder_sent,client_reminder_sent_at,professional_reminder_sent_at'
      )
      .in('status', ['scheduled', 'in_progress'])
      .eq('reminder_sent', false)
      .gte('meeting_date', today)
      .lte('meeting_date', horizon)
      .order('meeting_date', { ascending: true })
      .order('meeting_time', { ascending: true })

    if (error) {
      console.error('Meeting reminders: failed to load meetings', error)
      return NextResponse.json({ error: 'Failed to load meetings' }, { status: 500 })
    }

    if (!meetings || meetings.length === 0) {
      return NextResponse.json({ ok: true, remindersSent: 0 })
    }

    const meetingRows = meetings as MeetingRow[]
    const clientIds = Array.from(
      new Set(meetingRows.map((meeting) => String(meeting.client_id || '').trim()).filter(Boolean)),
    )
    const userIds = Array.from(new Set(meetingRows.map((meeting) => String(meeting.user_id || '').trim()).filter(Boolean)))

    const [clientsResult, usersResult, businessesResult, prefsResult, profilesResult] = await Promise.all([
      clientIds.length
        ? supabaseAdmin.from('clients').select('id,name,email').in('id', clientIds)
        : Promise.resolve({ data: [], error: null } as any),
      userIds.length
        ? supabaseAdmin.from('users').select('id,email,name').in('id', userIds)
        : Promise.resolve({ data: [], error: null } as any),
      userIds.length
        ? supabaseAdmin.from('businesses').select('id,owner_user_id,name').in('owner_user_id', userIds)
        : Promise.resolve({ data: [], error: null } as any),
      userIds.length
        ? supabaseAdmin.from('user_preferences').select('user_id,email_notifications,meeting_reminder_minutes').in('user_id', userIds)
        : Promise.resolve({ data: [], error: null } as any),
      userIds.length
        ? supabaseAdmin
            .from('professional_profiles')
            .select('owner_id,display_name,business_name,email,website,profile_image_url,cover_image_url')
            .in('owner_id', userIds)
        : Promise.resolve({ data: [], error: null } as any),
    ])

    if (clientsResult.error) {
      console.error('Meeting reminders: failed to load clients', clientsResult.error)
      return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 })
    }

    if (usersResult.error) {
      console.error('Meeting reminders: failed to load users', usersResult.error)
      return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
    }

    if (businessesResult.error) {
      console.error('Meeting reminders: failed to load businesses', businessesResult.error)
      return NextResponse.json({ error: 'Failed to load businesses' }, { status: 500 })
    }

    if (prefsResult.error) {
      console.error('Meeting reminders: failed to load user preferences', prefsResult.error)
      return NextResponse.json({ error: 'Failed to load user preferences' }, { status: 500 })
    }

    if (profilesResult.error) {
      console.error('Meeting reminders: failed to load professional profiles', profilesResult.error)
      return NextResponse.json({ error: 'Failed to load professional profiles' }, { status: 500 })
    }

    const clientsById = new Map<string, ClientRow>(
      (clientsResult.data || []).map((row: any) => [String(row.id), row]),
    )
    const usersById = new Map<string, UserRow>(
      (usersResult.data || []).map((row: any) => [String(row.id), row]),
    )
    const businessesByUserId = new Map<string, BusinessRow>(
      (businessesResult.data || []).map((row: any) => [String(row.owner_user_id), row]),
    )
    const prefsByUserId = new Map<string, PreferenceRow>(
      (prefsResult.data || []).map((row: any) => [String(row.user_id), row]),
    )
    const profilesByUserId = new Map<string, ProfessionalProfileRow>(
      (profilesResult.data || []).map((row: any) => [String(row.owner_id), row]),
    )

    const appUrl = getAppUrl(request)
    let remindersSent = 0

    for (const meeting of meetingRows) {
      const meetingDateTime = buildMeetingDateTime(meeting.meeting_date, meeting.meeting_time)
      if (Number.isNaN(meetingDateTime.getTime())) continue

      const user = usersById.get(String(meeting.user_id))
      const client = meeting.client_id ? clientsById.get(String(meeting.client_id)) : undefined
      const business = businessesByUserId.get(String(meeting.user_id))
      const profile = profilesByUserId.get(String(meeting.user_id))
      const prefs = prefsByUserId.get(String(meeting.user_id))
      const leadMinutes = parseLeadMinutes(prefs?.meeting_reminder_minutes)

      if (!isDue(meetingDateTime, leadMinutes, now)) continue

      const meetingTitle = String(meeting.title || 'Client consultation')
      const clientName = buildClientName(client)
      const professionalName = buildProfessionalName(user)
      const businessName = buildBusinessName({ user, business, profile })
      const dateLabel = formatDateLabel(meetingDateTime)
      const timeLabel = formatTimeLabel(meeting.meeting_time)
      const joinUrl = `${appUrl}/video-call?room=${encodeURIComponent(String(meeting.room_name || ''))}`
      const nowIso = now.toISOString()

      await createBusinessAlert({
        businessId: String(business?.id || meeting.user_id),
        type: 'meeting',
        priority: 'medium',
        title: 'Meeting reminder due',
        body: `${clientName} has a video call scheduled for ${dateLabel} at ${timeLabel}.`,
        clientName,
        actionLabel: 'Open Meeting',
        metadata: {
          meetingId: meeting.id,
          meetingDate: meeting.meeting_date,
          meetingTime: timeLabel,
          reminderMinutes: leadMinutes,
        },
        dedupeKey: `meeting-reminder-alert:${meeting.id}`,
        dedupeWindowMinutes: 60 * 24 * 7,
      })

      const updates: Record<string, unknown> = {}
      const professionalCanEmail = Boolean(user?.email && prefs?.email_notifications !== false)
      const clientCanEmail = Boolean(client?.email)
      const clientNotice = clientCanEmail
        ? `${clientName} has also been sent their reminder email.`
        : 'No client email is on file, so only your reminder is being sent.'

      if (!meeting.professional_reminder_sent_at) {
        if (!professionalCanEmail) {
          updates.professional_reminder_sent_at = nowIso
        } else {
          try {
            const htmlBody = renderPlainEmail({
              preheader: `${meetingTitle} with ${clientName} is due soon.`,
              title: 'Upcoming client meeting',
              greeting: `Hello ${professionalName},`,
              intro: `A video call with ${clientName} is due soon. ${clientNotice}`,
              detailsTitle: 'Meeting summary',
              details: [
                { label: 'Meeting', value: meetingTitle },
                { label: 'Date', value: dateLabel },
                { label: 'Time', value: timeLabel },
                { label: 'Client', value: clientName },
              ],
              ctaLabel: 'Open meeting room',
              ctaUrl: joinUrl,
              note: 'If the meeting details have changed, update the schedule in your dashboard.',
              closing: 'Kind regards,\nMyMcKenzieCS',
            })

            const textBody = buildProfessionalReminderText({
              professionalName,
              clientName,
              clientNotice,
              meetingTitle,
              dateLabel,
              timeLabel,
              joinUrl,
            })

            await sendResendEmail({
              from: process.env.RESEND_ALERT_FROM_EMAIL || 'alerts@mymckenziecs.com',
              to: user?.email || '',
              subject: `Reminder: ${meetingTitle} with ${clientName} on ${dateLabel}`,
              htmlBody,
              textBody,
              tag: 'meeting-reminder-professional',
            })
            updates.professional_reminder_sent_at = nowIso
          } catch (sendError) {
            console.error('Meeting reminders: failed to send professional email', {
              meetingId: meeting.id,
              error: sendError,
            })
          }
        }
      }

      if (!meeting.client_reminder_sent_at) {
        if (!clientCanEmail) {
          updates.client_reminder_sent_at = nowIso
        } else {
          try {
            const htmlBody = renderPlainEmail({
              preheader: `Your video call with ${businessName} is coming up soon.`,
              title: 'Upcoming video call',
              greeting: `Hello ${clientName},`,
              intro: `This is a reminder that your video call with ${businessName} is coming up soon.`,
              detailsTitle: 'Meeting summary',
              details: [
                { label: 'Meeting', value: meetingTitle },
                { label: 'Date', value: dateLabel },
                { label: 'Time', value: timeLabel },
              ],
              ctaLabel: 'Join meeting',
              ctaUrl: joinUrl,
              note: `If you need to reschedule, please contact ${businessName}.`,
              closing: 'Kind regards,\nMyMcKenzieCS',
            })

            const textBody = buildClientReminderText({
              clientName,
              businessName,
              meetingTitle,
              dateLabel,
              timeLabel,
              joinUrl,
            })

            await sendResendEmail({
              from: process.env.RESEND_ALERT_FROM_EMAIL || 'alerts@mymckenziecs.com',
              to: client?.email || '',
              subject: `Reminder: ${meetingTitle} on ${dateLabel}`,
              htmlBody,
              textBody,
              tag: 'meeting-reminder-client',
            })
            updates.client_reminder_sent_at = nowIso
          } catch (sendError) {
            console.error('Meeting reminders: failed to send client email', {
              meetingId: meeting.id,
              error: sendError,
            })
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await markMeetingReminderState(meeting, updates)
        remindersSent += 1
      }
    }

    return NextResponse.json({ ok: true, remindersSent })
  } catch (error: any) {
    console.error('Meeting reminders cron failed', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
