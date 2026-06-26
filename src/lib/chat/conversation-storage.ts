export const GLOBAL_CONVERSATION_STORAGE_KEY = 'currentConversationId'

export function getConversationStorageKey(userId?: string | null) {
  const normalizedUserId = String(userId || '').trim()
  return normalizedUserId
    ? `${GLOBAL_CONVERSATION_STORAGE_KEY}:${normalizedUserId}`
    : GLOBAL_CONVERSATION_STORAGE_KEY
}
