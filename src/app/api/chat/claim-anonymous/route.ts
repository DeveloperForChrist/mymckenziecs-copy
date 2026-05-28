import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const normalizeGuestUuid = (value?: string | null): string | null => {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (uuidRegex.test(raw)) return raw
  const anonMatch = raw.match(/^anon_([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i)
  return anonMatch?.[1] && uuidRegex.test(anonMatch[1]) ? anonMatch[1] : null
}

const buildMemoryKey = (authUserId: string, caseId: string | null, conversationId: string | null) => {
  const casePart = caseId ? `c:${caseId}` : 'c:none'
  const convPart = conversationId ? `v:${conversationId}` : 'v:none'
  return `u:${authUserId}|${casePart}|${convPart}`
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    const authUserId = authData?.user?.id || null

    if (authError || !authUserId) {
      return NextResponse.json({ claimed: false, error: 'Sign in required' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const anonymousUserId = typeof body?.anonymousUserId === 'string' ? body.anonymousUserId.trim() : ''
    const conversationId = typeof body?.conversationId === 'string' ? body.conversationId.trim() : ''
    const guestUuid = normalizeGuestUuid(anonymousUserId)

    if (!anonymousUserId.startsWith('anon_') || !guestUuid || !conversationId || !uuidRegex.test(conversationId)) {
      return NextResponse.json({ claimed: false, error: 'Invalid anonymous conversation' }, { status: 400 })
    }

    const { data: memoryRows, error: memoryLoadError } = await supabaseAdmin
      .from('chat_memory')
      .select('memory_key, case_id, conversation_id')
      .eq('guest_id', guestUuid)
      .eq('conversation_id', conversationId)

    if (memoryLoadError) {
      console.warn('Failed to load anonymous chat memory for claim:', memoryLoadError)
    }

    const { data: actionRows, error: actionLoadError } = await supabaseAdmin
      .from('chat_action_items')
      .select('id')
      .eq('guest_id', guestUuid)
      .eq('conversation_id', conversationId)

    if (actionLoadError) {
      console.warn('Failed to load anonymous chat action items for claim:', actionLoadError)
    }

    let claimedActionRows = 0
    for (const row of actionRows || []) {
      const rowId = (row as any)?.id
      if (!rowId) continue
      const { error: updateError } = await supabaseAdmin
        .from('chat_action_items')
        .update({
          user_id: authUserId,
          guest_id: null,
          memory_key: null,
        })
        .eq('id', rowId)

      if (updateError) {
        console.warn('Failed to claim anonymous chat action item:', updateError)
      } else {
        claimedActionRows += 1
      }
    }

    let claimedMemoryRows = 0
    for (const row of memoryRows || []) {
      const memoryKey = (row as any)?.memory_key
      const rowConversationId = (row as any)?.conversation_id || conversationId
      const caseId = (row as any)?.case_id || null
      if (!memoryKey) continue

      const targetMemoryKey = buildMemoryKey(authUserId, caseId, rowConversationId)
      const { error: updateError } = await supabaseAdmin
        .from('chat_memory')
        .update({
          user_id: authUserId,
          guest_id: null,
          memory_key: targetMemoryKey,
        })
        .eq('memory_key', memoryKey)

      if (updateError) {
        const fallback = await supabaseAdmin
          .from('chat_memory')
          .update({
            user_id: authUserId,
            guest_id: null,
          })
          .eq('memory_key', memoryKey)

        if (fallback.error) {
          console.warn('Failed to claim anonymous chat memory row:', fallback.error)
        } else {
          claimedMemoryRows += 1
        }
      } else {
        claimedMemoryRows += 1
      }
    }

    const { data: messageRows, error: messageLoadError } = await supabaseAdmin
      .from('messages')
      .select('id, metadata')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true })
      .limit(300)

    if (messageLoadError) {
      console.warn('Failed to load anonymous chat messages for claim:', messageLoadError)
    }

    let claimedMessageRows = 0
    for (const row of messageRows || []) {
      const metadata = (row as any)?.metadata
      const ownerUserId =
        metadata && typeof metadata === 'object' && typeof metadata.owner_user_id === 'string'
          ? metadata.owner_user_id
          : null
      if (ownerUserId !== anonymousUserId) continue

      const { error: updateError } = await supabaseAdmin
        .from('messages')
        .update({
          metadata: {
            ...(metadata || {}),
            owner_user_id: authUserId,
            claimed_from_anonymous_user_id: anonymousUserId,
          },
        })
        .eq('id', (row as any).id)

      if (updateError) {
        console.warn('Failed to claim anonymous chat message:', updateError)
      } else {
        claimedMessageRows += 1
      }
    }

    return NextResponse.json({
      claimed: claimedMemoryRows > 0 || claimedActionRows > 0 || claimedMessageRows > 0,
      conversationId,
      claimedMemoryRows,
      claimedActionRows,
      claimedMessageRows,
    })
  } catch (error) {
    console.error('Anonymous chat claim error:', error)
    return NextResponse.json({ claimed: false, error: 'Failed to claim anonymous conversation' }, { status: 500 })
  }
}
