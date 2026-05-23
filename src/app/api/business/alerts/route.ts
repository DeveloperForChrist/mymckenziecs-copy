import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

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

    const persistedAlerts = (data || []).map((row: any) => ({
        id: String(row.id),
        type: String(row.type || 'system'),
        priority: String(row.priority || 'medium'),
        title: String(row.title || 'Alert'),
        body: String(row.body || ''),
        time: toRelativeTime(String(row.created_at || new Date().toISOString())),
        read: Boolean(row.is_read),
        clientName: row.client_name ? String(row.client_name) : undefined,
        actionLabel: row.action_label ? String(row.action_label) : undefined,
        metadata: row.metadata || {},
      }))

    const derivedAlerts: any[] = []

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
      const deadline = String((row as any).next_deadline || '')
      if (!deadline) continue
      const overdue = deadline < todayIso
      derivedAlerts.push({
        id: `derived-deadline-${row.id}-${deadline}`,
        type: 'deadline',
        priority: overdue ? 'urgent' : 'high',
        title: overdue ? 'Deadline overdue' : 'Deadline approaching',
        body: `${String((row as any).client_name || 'Client')} matter ${String((row as any).matter_number || '')} deadline ${overdue ? `was ${deadline}` : `is ${deadline}`}.`,
        time: 'Live',
        read: false,
        clientName: String((row as any).client_name || ''),
        actionLabel: 'Open Calendar',
      })
    }

    if (user.email) {
      const staleIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: staleMessages } = await supabaseAdmin
        .from('inbox_messages')
        .select('id, sender_name, created_at, subject')
        .eq('recipient_email', user.email)
        .eq('is_read', false)
        .contains('metadata', { fromClient: true })
        .lte('created_at', staleIso)
        .limit(10)

      for (const msg of staleMessages || []) {
        derivedAlerts.push({
          id: `derived-sla-${msg.id}`,
          type: 'message',
          priority: 'high',
          title: 'Client reply pending over 24h',
          body: `${String(msg.sender_name || 'Client')} is awaiting response: ${String(msg.subject || 'Message')}.`,
          time: toRelativeTime(String(msg.created_at || new Date().toISOString())),
          read: false,
          clientName: String(msg.sender_name || ''),
          actionLabel: 'Reply',
        })
      }
    }

    const merged = [...derivedAlerts, ...persistedAlerts]
      .sort((a, b) => (a.time === 'Live' ? -1 : b.time === 'Live' ? 1 : 0))
      .slice(0, 300)

    return NextResponse.json({ alerts: merged })
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
