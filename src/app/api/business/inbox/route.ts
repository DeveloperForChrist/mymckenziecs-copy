import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type InboxMessageRecord = {
  id: string
  sender_id: string | null
  sender_email: string | null
  sender_name: string | null
  recipient_email: string | null
  subject: string
  content: string | null
  created_at: string
  is_read: boolean
  is_starred: boolean
  deleted_at: string | null
  type: string | null
  metadata: Record<string, unknown> | null
}

type SerializedInboxMessage = {
  id: string
  sender: string
  senderEmail: string
  subject: string
  preview: string
  content: string
  timestamp: string
  isRead: boolean
  isStarred: boolean
  type: 'email'
  metadata?: Record<string, unknown>
  deletedAt?: string | null
}

function toPreview(content: string | null) {
  return String(content || '').slice(0, 100)
}

function fmtTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const hours = Math.floor((now.getTime() - date.getTime()) / 3600000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  if (hours < 48) return 'Yesterday'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
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

function mapMessage(row: InboxMessageRecord): SerializedInboxMessage {
  return {
    id: String(row.id),
    sender: String(row.sender_name || String(row.sender_email || '').split('@')[0] || 'Unknown'),
    senderEmail: String(row.sender_email || ''),
    subject: String(row.subject || ''),
    preview: toPreview(row.content),
    content: String(row.content || ''),
    timestamp: fmtTime(String(row.created_at)),
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    type: 'email',
    deletedAt: row.deleted_at,
    metadata: row.metadata || undefined,
  }
}

export async function GET() {
  try {
    const { user } = await getContext()

    const { data: receivedRows, error: receivedError } = await supabaseAdmin
      .from('inbox_messages')
      .select('id, sender_id, sender_email, sender_name, recipient_email, subject, content, created_at, is_read, is_starred, deleted_at, type, metadata')
      .eq('recipient_email', user.email)
      .order('created_at', { ascending: false })

    if (receivedError) {
      return NextResponse.json({ message: 'Unable to load inbox messages.' }, { status: 500 })
    }

    const { data: sentRows, error: sentError } = await supabaseAdmin
      .from('inbox_messages')
      .select('id, sender_id, sender_email, sender_name, recipient_email, subject, content, created_at, is_read, is_starred, deleted_at, type, metadata')
      .or(`sender_id.eq.${user.id},sender_email.eq.${String(user.email || '')}`)
      .order('created_at', { ascending: false })

    if (sentError) {
      return NextResponse.json({ message: 'Unable to load sent messages.' }, { status: 500 })
    }

    const receivedMessages = (receivedRows || []).map((row) => mapMessage(row as InboxMessageRecord))
    const sentMessages = (sentRows || [])
      .map((row) => mapMessage(row as InboxMessageRecord))
      .filter((message) => message.senderEmail === user.email || message.metadata?.sentByBusinessDashboard)

    return NextResponse.json({
      messages: receivedMessages,
      sentMessages,
    })
  } catch (error) {
    return errorResponse(error, 'Unable to load inbox messages.')
  }
}
