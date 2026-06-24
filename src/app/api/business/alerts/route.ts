import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'
import { isImportantBusinessAlertType } from '@/lib/business/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type PersistedAlertRow = {
  id: string | number | null
  type: string | null
  priority: string | null
  title: string | null
  body: string | null
  client_name: string | null
  action_label: string | null
  metadata: Record<string, unknown> | null
  is_read: boolean | null
  created_at: string | null
}

type MatterDeadlineRow = {
  id: string | number | null
  client_name: string | null
  matter_number: string | null
  next_deadline: string | null
}

type StaleMessageRow = {
  id: string | number | null
  sender_name: string | null
  created_at: string | null
  subject: string | null
}

type AlertResponseItem = {
  id: string
  type: string
  priority: string
  title: string
  body: string
  time: string
  read: boolean
  clientName?: string
  actionLabel?: string
  metadata?: Record<string, unknown>
}

function toRelativeTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  if (hours < 48) return 'Yesterday'
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

async function getContext() {
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) throw new BusinessWorkspaceError('Unauthorized', 401)
  const workspace = await ensureBusinessContext(user)
  return { user, workspace }
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
    const { workspace, user } = await getContext()
    const { data, error } = await supabaseAdmin
      .from('business_alerts')
      .select('id, type, priority, title, body, client_name, action_label, metadata, is_read, dismissed_at, created_at')
      .eq('business_id', workspace.businessId)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(300)

    if (error) {
      return NextResponse.json({ message: 'Unable to load alerts.' }, { status: 500 })
    }

    const persistedAlerts: AlertResponseItem[] = (data || [])
      .map((row) => {
        const typedRow = row as PersistedAlertRow
        const type = String(typedRow.type || 'system')
        if (!isImportantBusinessAlertType(type)) return null
        return {
          id: String(typedRow.id),
          type,
          priority: String(typedRow.priority || 'medium'),
          title: String(typedRow.title || 'Alert'),
          body: String(typedRow.body || ''),
          time: toRelativeTime(String(typedRow.created_at || new Date().toISOString())),
          read: Boolean(typedRow.is_read),
          clientName: typedRow.client_name ? String(typedRow.client_name) : undefined,
          actionLabel: typedRow.action_label ? String(typedRow.action_label) : undefined,
          metadata: typedRow.metadata || {},
        }
      })
      .filter((alert): alert is AlertResponseItem => Boolean(alert))

    const derivedAlerts: AlertResponseItem[] = []

    const todayIso = new Date().toISOString().slice(0, 10)
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: deadlineRows } = await supabaseAdmin
      .from('client_matters')
      .select('id, client_name, matter_number, next_deadline')
      .eq('business_id', workspace.businessId)
      .eq('status', 'active')
      .not('next_deadline', 'is', null)
      .lte('next_deadline', nextWeek)
      .limit(30)

    for (const row of deadlineRows || []) {
      const typedRow = row as MatterDeadlineRow
      const deadline = String(typedRow.next_deadline || '')
      if (!deadline) continue
      const overdue = deadline < todayIso
      derivedAlerts.push({
        id: `derived-deadline-${typedRow.id}-${deadline}`,
        type: 'deadline',
        priority: overdue ? 'urgent' : 'high',
        title: overdue ? 'Deadline overdue' : 'Deadline approaching',
        body: `${String(typedRow.client_name || 'Client')} matter ${String(typedRow.matter_number || '')} deadline ${overdue ? `was ${deadline}` : `is ${deadline}`}.`,
        time: 'Live',
        read: false,
        clientName: String(typedRow.client_name || ''),
        actionLabel: 'Open Calendar',
      })
    }

    if (user.email) {
      const userEmail = normalizeEmail(user.email)
      const staleIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: staleMessages } = await supabaseAdmin
        .from('inbox_messages')
        .select('id, sender_name, created_at, subject')
        .eq('recipient_email', userEmail)
        .eq('is_read', false)
        .is('deleted_at', null)
        .contains('metadata', { fromClient: true })
        .lte('created_at', staleIso)
        .limit(10)

      for (const msg of staleMessages || []) {
        const typedMessage = msg as StaleMessageRow
        derivedAlerts.push({
          id: `derived-sla-${typedMessage.id}`,
          type: 'message',
          priority: 'high',
          title: 'Client reply pending over 24h',
          body: `${String(typedMessage.sender_name || 'Client')} is awaiting response: ${String(typedMessage.subject || 'Message')}.`,
          time: toRelativeTime(String(typedMessage.created_at || new Date().toISOString())),
          read: false,
          clientName: String(typedMessage.sender_name || ''),
          actionLabel: 'Reply',
        })
      }
    }

    const merged = [...derivedAlerts, ...persistedAlerts]
      .sort((a, b) => (a.time === 'Live' ? -1 : b.time === 'Live' ? 1 : 0))
      .slice(0, 300)

    return NextResponse.json({ alerts: merged, businessId: workspace.businessId })
  } catch (error) {
    return errorResponse(error, 'Unable to load alerts.')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { workspace } = await getContext()
    const body = await request.json().catch(() => ({}))
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    const markAllRead = Boolean(body?.markAllRead)
    if (!id && !markAllRead) {
      return NextResponse.json({ message: 'Alert id is required.' }, { status: 400 })
    }

    if (markAllRead) {
      const { error } = await supabaseAdmin
        .from('business_alerts')
        .update({ is_read: true })
        .eq('business_id', workspace.businessId)
        .is('dismissed_at', null)
        .eq('is_read', false)
      if (error) return NextResponse.json({ message: 'Unable to mark alerts as read.' }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    const { error } = await supabaseAdmin
      .from('business_alerts')
      .update({ is_read: true })
      .eq('business_id', workspace.businessId)
      .eq('id', id)
    if (error) return NextResponse.json({ message: 'Unable to mark alert as read.' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'Unable to update alerts.')
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { workspace } = await getContext()
    const body = await request.json().catch(() => ({}))
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    if (!id) {
      return NextResponse.json({ message: 'Alert id is required.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('business_alerts')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('business_id', workspace.businessId)
      .eq('id', id)
    if (error) return NextResponse.json({ message: 'Unable to dismiss alert.' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'Unable to dismiss alert.')
  }
}
