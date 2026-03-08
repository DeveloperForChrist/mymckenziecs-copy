import type { AssistantMetadata, Message } from '@/components/chatbot/chat-types'

export const INITIAL_HISTORY_PAGE_LIMIT = 80

export type StoredChatMessage = {
  id?: string
  role: 'user' | 'assistant'
  message: string
  timestamp: string
  metadata?: AssistantMetadata
}

type ConversationHistoryPageResponse = {
  messages?: StoredChatMessage[]
  total?: number
  limited?: boolean
  pageLimit?: number
  hasMoreOlder?: boolean
  nextCursor?: string | null
}

export type ConversationHistoryPage = {
  messages: Message[]
  total: number
  limited: boolean
  pageLimit: number
  hasMoreOlder: boolean
  nextCursor: string | null
}

const toMessage = (msg: StoredChatMessage): Message => ({
  id: typeof msg.id === 'string' && msg.id.trim()
    ? msg.id
    : `msg_${msg.timestamp}_${Math.random().toString(36).slice(2, 6)}`,
  role: msg.role,
  content: msg.message,
  timestamp: new Date(msg.timestamp),
  metadata:
    msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata)
      ? msg.metadata
      : undefined,
})

export async function fetchConversationHistoryPage({
  conversationId,
  before,
  limit = INITIAL_HISTORY_PAGE_LIMIT,
}: {
  conversationId: string
  before?: string | null
  limit?: number
}): Promise<ConversationHistoryPage> {
  const response = await fetch('/api/chat-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId,
      limit,
      ...(before ? { before } : {}),
    }),
  })

  const rawData = await response.json().catch(() => ({}))
  const data = rawData as ConversationHistoryPageResponse

  if (!response.ok) {
    const errorMessage =
      typeof (rawData as { error?: unknown })?.error === 'string'
        ? (rawData as { error?: string }).error
        : 'Failed to fetch conversation history'
    throw new Error(errorMessage)
  }

  const messages = Array.isArray(data.messages)
    ? data.messages
        .filter((msg): msg is StoredChatMessage => Boolean(msg && typeof msg.role === 'string' && typeof msg.message === 'string' && typeof msg.timestamp === 'string'))
        .map(toMessage)
    : []

  return {
    messages,
    total: typeof data.total === 'number' ? data.total : messages.length,
    limited: Boolean(data.limited),
    pageLimit: typeof data.pageLimit === 'number' ? data.pageLimit : limit,
    hasMoreOlder: Boolean(data.hasMoreOlder),
    nextCursor: typeof data.nextCursor === 'string' && data.nextCursor.trim() ? data.nextCursor : null,
  }
}
