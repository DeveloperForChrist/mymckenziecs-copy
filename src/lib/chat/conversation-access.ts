import { supabaseAdmin } from '@/lib/database/supabase-server'

const dedupe = <T,>(items: T[]): T[] => Array.from(new Set(items.filter(Boolean) as T[]))

export async function resolveUserIdsByEmail(email: string | null): Promise<string[]> {
  if (!email) return []
  const normalizedEmail = email.trim()
  if (!normalizedEmail) return []

  const { data } = await supabaseAdmin
    .from('users')
    .select('id')
    .ilike('email', normalizedEmail)

  return dedupe((data || []).map((row: any) => row.id).filter(Boolean))
}

export async function resolveScopedUserIds(authUid: string, authEmail: string | null): Promise<string[]> {
  const emailUserIds = await resolveUserIdsByEmail(authEmail)
  return dedupe([authUid, ...emailUserIds])
}

export async function getOwnedCaseIds(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return []

  const { data } = await supabaseAdmin
    .from('cases')
    .select('id')
    .in('user_id', userIds)
    .is('deleted_at', null)

  return dedupe((data || []).map((row: any) => row.id).filter(Boolean))
}

export async function canAccessConversation(
  scopedUserIds: string[],
  conversationId: string,
  caseIds: string[]
): Promise<boolean> {
  if (scopedUserIds.length === 0) return false

  const { data: memoryRow } = await supabaseAdmin
    .from('chat_memory')
    .select('conversation_id')
    .in('user_id', scopedUserIds)
    .eq('conversation_id', conversationId)
    .limit(1)
    .maybeSingle()

  if (memoryRow?.conversation_id) return true

  const { data: actionRow } = await supabaseAdmin
    .from('chat_action_items')
    .select('id')
    .in('user_id', scopedUserIds)
    .eq('conversation_id', conversationId)
    .limit(1)
    .maybeSingle()

  if (actionRow?.id) return true

  if (caseIds.length > 0) {
    const { data: messageRow } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .in('case_id', caseIds)
      .limit(1)
      .maybeSingle()

    if (messageRow?.id) return true
  }

  const { data: conversationRows, error: conversationRowsError } = await supabaseAdmin
    .from('messages')
    .select('metadata')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: false })
    .limit(60)

  if (!conversationRowsError && Array.isArray(conversationRows)) {
    const ownsConversation = conversationRows.some((row: any) => {
      const ownerId =
        row?.metadata && typeof row.metadata === 'object' && typeof row.metadata.owner_user_id === 'string'
          ? row.metadata.owner_user_id
          : null
      return Boolean(ownerId && scopedUserIds.includes(ownerId))
    })
    if (ownsConversation) return true
  }

  return false
}

export async function getConversationAccess(
  scopedUserIds: string[],
  conversationId: string,
  caseIds: string[]
): Promise<'owned' | 'missing' | 'forbidden'> {
  if (scopedUserIds.length === 0) return 'forbidden'

  const owned = await canAccessConversation(scopedUserIds, conversationId, caseIds)
  if (owned) return 'owned'

  const { data: anyMemoryRow } = await supabaseAdmin
    .from('chat_memory')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .limit(1)
    .maybeSingle()

  if (anyMemoryRow?.conversation_id) return 'forbidden'

  const { data: anyActionRow } = await supabaseAdmin
    .from('chat_action_items')
    .select('id')
    .eq('conversation_id', conversationId)
    .limit(1)
    .maybeSingle()

  if (anyActionRow?.id) return 'forbidden'

  const { data: anyMessageRow } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .limit(1)
    .maybeSingle()

  return anyMessageRow?.id ? 'forbidden' : 'missing'
}
