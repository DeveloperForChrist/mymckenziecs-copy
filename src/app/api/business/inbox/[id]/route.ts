import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type InboxActionBody = {
  action?: 'trash' | 'restore'
}

type InboxMessageRecord = {
  id: string
  recipient_email: string
  deleted_at: string | null
}

async function getAuthedUserEmail() {
  const supabase = await createSupabaseRouteClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user?.email) {
    return { email: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { email: authData.user.email, error: null }
}

async function loadInboxMessage(id: string) {
  const { data, error } = await supabaseAdmin
    .from('inbox_messages')
    .select('id, recipient_email, deleted_at')
    .eq('id', id)
    .maybeSingle<InboxMessageRecord>()

  if (error) {
    throw error
  }

  return data ?? null
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { email, error: authResponse } = await getAuthedUserEmail()
    if (authResponse) return authResponse

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Missing message id.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => ({}))) as InboxActionBody
    if (body.action !== 'trash' && body.action !== 'restore') {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
    }

    const message = await loadInboxMessage(id)
    if (!message || message.recipient_email !== email) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
    }

    const nowIso = new Date().toISOString()
    const nextDeletedAt = body.action === 'trash' ? (message.deleted_at ?? nowIso) : null

    const { data, error } = await supabaseAdmin
      .from('inbox_messages')
      .update({ deleted_at: nextDeletedAt })
      .eq('id', id)
      .eq('recipient_email', email)
      .select('id, deleted_at')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to update message.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: {
        id: data?.id || id,
        deletedAt: data?.deleted_at || nextDeletedAt,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update message.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { email, error: authResponse } = await getAuthedUserEmail()
    if (authResponse) return authResponse

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Missing message id.' }, { status: 400 })
    }

    const message = await loadInboxMessage(id)
    if (!message || message.recipient_email !== email) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
    }

    if (!message.deleted_at) {
      return NextResponse.json({ error: 'Move the message to Trash before deleting it permanently.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('inbox_messages')
      .delete()
      .eq('id', id)
      .eq('recipient_email', email)

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to delete message.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete message.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
