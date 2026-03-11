import { NextRequest, NextResponse } from 'next/server'
import {
  type LegalSearchMode,
  type PremiumPlusToolSelection,
  invokeBasicLegalAgent,
  invokePremiumLegalAgent,
  invokePremiumLegalAgentStream,
  invokePremiumPlusLegalAgent,
  invokePremiumPlusLegalAgentStream,
} from '@/lib/ai/agents/legal-agent'
import { neutralizeLegalAdviceTone } from '@/lib/ai/agents/legal-tone'
import { ChatManager } from '@/lib/ai/chat-manager'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import {
  aiRateLimiter,
  rateLimit,
  getIdentifier,
  acquirePremiumProviderCapacity,
} from '@/lib/utils/rate-limit'
import { chatMessageSchema } from '@/validators/index'
import { z } from 'zod'
import { captureServerException } from '@/lib/monitoring/error-logger'
import { isBasicPlan, isPremiumPlan, isPremiumPlusPlan } from '@/lib/plans/access'
import { getUserPlanData } from '@/lib/payments/user-plan'
import { extractTextFromBuffer } from '@/lib/chat/text-extraction'
import {
  getConversationAccess,
  getOwnedCaseIds,
  resolveScopedUserIds,
} from '@/lib/chat/conversation-access'
import {
  buildAssistantResponsePayload,
  stripAssistantPresentationMetadata,
} from '@/lib/chat/assistant-presentation'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type AgentResponse = {
  response: string
  document_generated: boolean
  guidance_provided: boolean
  next_steps: string[]
  sources?: Array<{ number: number; title: string; url: string }>
  verifiedAuthorities?: Array<{ title: string; citation: string }>
}

type ChatAttachment = {
  name?: string
  downloadURL?: string
  mimeType?: string | null
  storagePath?: string | null
}

type ExtractedAction = {
  title: string
  dueDate: string | null
  confidence: 'high' | 'medium'
}

type CaseLawSuggestion = {
  id: string
  citation: string
  title: string
  url?: string
  summary?: string
  similarity?: number
}

type VectorCaseLawRagItem = {
  citation: string
  title: string
  summary?: string
  extracts?: string
  url?: string
  similarity?: number
}

type ThreadMemorySnapshot = {
  memory_summary: string | null
  key_facts: string[]
  open_questions: string[]
  user_turn_count: number | null
}

type RelatedThreadMemorySnapshot = ThreadMemorySnapshot & {
  conversationCount: number
  sameCaseMatch: boolean
}

const chatAttachmentSchema = z.object({
  name: z.string().optional(),
  downloadURL: z.string().optional(),
  mimeType: z.string().nullable().optional(),
  storagePath: z.string().nullable().optional(),
})

const chatRequestSchema = z.object({
  message: z.string().min(1).max(5000),
  activeCaseId: z.string().uuid().optional(),
  mode: z.enum(['legal-advisor', 'document-review', 'general']).optional(),
  history: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
  attachmentsOnly: z.boolean().optional(),
  attachments: z.array(chatAttachmentSchema).optional(),
  userId: z.string().optional(),
  conversationId: z.string().optional(),
  sessionMessageCount: z.number().int().nonnegative().optional(),
  sessionStartedAt: z.string().optional(),
}).passthrough()

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const getEnvModelValue = (...keys: string[]): string | null => {
  for (const key of keys) {
    const value = (process.env[key] || '').trim()
    if (value) return value
  }
  return null
}

const getPremiumOpenAiModel = (): string =>
  getEnvModelValue('OPENAI_PREMIUM_MODEL') || 'gpt-4o'

const getPremiumOpenAiFallbackModel = (primaryModel: string): string =>
  getEnvModelValue('OPENAI_PREMIUM_FALLBACK_MODEL', 'OPENAI_BASIC_MODEL') || primaryModel

const getPremiumPlusAnthropicModel = (): string =>
  getEnvModelValue('PREMIUM_PLUS_ANTHROPIC_MODEL') || 'claude-opus-4-6'

const getPremiumPlusAnthropicFallbackModel = (primaryModel: string): string =>
  getEnvModelValue('PREMIUM_PLUS_ANTHROPIC_FALLBACK_MODEL') || primaryModel

const getPremiumPlusOpenAiFallbackModel = (): string =>
  getEnvModelValue('OPENAI_PREMIUM_PLUS_FALLBACK_MODEL', 'OPENAI_PREMIUM_FALLBACK_MODEL') || 'gpt-4.1'

const sanitizeChatErrorMessage = (error: unknown): string => {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : ''

  if (
    message.includes('MILVUS_DEPENDENCY_MISSING') ||
    /pymilvus/i.test(message) ||
    /MILVUS_HOST missing/i.test(message)
  ) {
    return 'Case-law retrieval is unavailable right now. Please try again later.'
  }

  return message || 'MyMcKenzieCS is unavailable to help right now. Please try again later.'
}

const PREMIUM_PLUS_CASELAW_TIMEOUT_MS = Number.isFinite(Number(process.env.PREMIUM_PLUS_CASELAW_TIMEOUT_MS))
  ? Math.max(1000, Math.floor(Number(process.env.PREMIUM_PLUS_CASELAW_TIMEOUT_MS)))
  : 4000
const CHAT_THREAD_MAX_USER_TURNS_DEFAULT = Number.isFinite(Number(process.env.CHAT_THREAD_MAX_USER_TURNS))
  ? Math.max(10, Math.floor(Number(process.env.CHAT_THREAD_MAX_USER_TURNS)))
  : 80
const BASIC_THREAD_MAX_USER_TURNS = Number.isFinite(Number(process.env.BASIC_THREAD_MAX_USER_TURNS))
  ? Math.max(10, Math.floor(Number(process.env.BASIC_THREAD_MAX_USER_TURNS)))
  : CHAT_THREAD_MAX_USER_TURNS_DEFAULT
const PREMIUM_THREAD_MAX_USER_TURNS = Number.isFinite(Number(process.env.PREMIUM_THREAD_MAX_USER_TURNS))
  ? Math.max(10, Math.floor(Number(process.env.PREMIUM_THREAD_MAX_USER_TURNS)))
  : CHAT_THREAD_MAX_USER_TURNS_DEFAULT
const PREMIUM_PLUS_THREAD_MAX_USER_TURNS = Number.isFinite(Number(process.env.PREMIUM_PLUS_THREAD_MAX_USER_TURNS))
  ? Math.max(10, Math.floor(Number(process.env.PREMIUM_PLUS_THREAD_MAX_USER_TURNS)))
  : CHAT_THREAD_MAX_USER_TURNS_DEFAULT

const normalizePlanLabel = (value: any): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

const normalizeHost = (value: string | null) => {
  const trimmed = (value || '').trim()
  if (!trimmed) return null
  return trimmed.split(':')[0]?.toLowerCase() || null
}

const isAllowedOrigin = (request: NextRequest) => {
  const origin = request.headers.get('origin')
  if (!origin) return true

  let originHost: string | null = null
  try {
    originHost = new URL(origin).hostname.toLowerCase()
  } catch {
    return false
  }

  const reqHost = normalizeHost(request.headers.get('x-forwarded-host') || request.headers.get('host'))
  if (reqHost && originHost === reqHost) return true

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    try {
      const appHost = new URL(appUrl).hostname.toLowerCase()
      if (originHost === appHost) return true
    } catch {
      // ignore invalid env var
    }
  }

  return false
}

const withStageTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  stageName: string,
  fallbackValue: T
): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise

  let timeoutId: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn(`${stageName} timed out after ${timeoutMs}ms; using fallback.`)
          resolve(fallbackValue)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

const tokenizeChunkRanking = (text: string): Set<string> => {
  const raw = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const tokens = raw
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
  return new Set(tokens)
}

const chunkTextForContext = (text: string, maxChars: number = 900, overlapChars: number = 140): string[] => {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return []
  if (cleaned.length <= maxChars) return [cleaned]

  const chunks: string[] = []
  let cursor = 0
  let lastCursor = -1
  while (cursor < cleaned.length && cursor !== lastCursor) {
    lastCursor = cursor
    const end = Math.min(cleaned.length, cursor + maxChars)
    const chunk = cleaned.slice(cursor, end).trim()
    if (chunk) chunks.push(chunk)
    if (end >= cleaned.length) break
    cursor = Math.max(0, end - overlapChars)
  }
  return chunks
}

const scoreChunkAgainstQuery = (chunk: string, queryTokens: Set<string>): number => {
  if (!queryTokens.size) return 0
  const chunkTokens = tokenizeChunkRanking(chunk)
  if (!chunkTokens.size) return 0
  let overlap = 0
  for (const token of queryTokens) {
    if (chunkTokens.has(token)) overlap += 1
  }
  return overlap / Math.max(1, Math.min(queryTokens.size, 12))
}

const buildAttachmentContext = async (
  attachments: ChatAttachment[],
  baseUrl: string,
  cookieHeader?: string | null,
  rankingQuery?: string,
  authUserId?: string | null
) => {
  if (!attachments.length) return ''
  const sections: string[] = []
  let totalLength = 0
  const rankingTokens = tokenizeChunkRanking(rankingQuery || '')

  for (const attachment of attachments) {
    const name = attachment.name || 'Untitled document'
    if (!attachment.downloadURL) {
      sections.push(`Document: ${name}\n(No file content available)`)
      continue
    }

    try {
      let arrayBuffer: ArrayBuffer | null = null

      if (
        authUserId &&
        typeof attachment.storagePath === 'string' &&
        /^tmp_[a-zA-Z0-9_-]+$/.test(attachment.storagePath)
      ) {
        const { data: uploadRow } = await supabaseAdmin
          .from('chat_uploads')
          .select('storage_path, owner_id, expires_at, extracted_text, extract_status')
          .eq('id', attachment.storagePath)
          .maybeSingle()

        const expiresAtMs = uploadRow?.expires_at ? new Date(uploadRow.expires_at).getTime() : NaN
        if (
          uploadRow?.owner_id === authUserId &&
          Number.isFinite(expiresAtMs) &&
          expiresAtMs > Date.now()
        ) {
          const extractedText = typeof uploadRow?.extracted_text === 'string' ? uploadRow.extracted_text.trim() : ''
          if (extractedText) {
            const cleaned = extractedText.replace(/\s+/g, ' ').trim()
            const chunks = cleaned ? chunkTextForContext(cleaned, 900, 140) : []
            const selectedChunks = chunks
              .map((chunk, idx) => ({
                idx,
                chunk,
                score: scoreChunkAgainstQuery(chunk, rankingTokens) + (idx === 0 ? 0.02 : 0),
              }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .sort((a, b) => a.idx - b.idx)
            const excerpt = selectedChunks.length > 0
              ? selectedChunks.map((entry, idx) => `Chunk ${idx + 1}: ${entry.chunk}`).join('\n')
              : cleaned.slice(0, 2500)
            const section = `Document: ${name}\n${excerpt}`
            sections.push(section)
            totalLength += section.length
            if (totalLength >= 5200) break
            continue
          }

          if (uploadRow?.extract_status === 'failed') {
            sections.push(`Document: ${name}\n(No extractable text available)`)
            continue
          }

          sections.push(`Document: ${name}\n(File text is not ready yet)`)
          continue
        }
      }

      if (!arrayBuffer) {
        const rawUrl = attachment.downloadURL.startsWith('/api/chat-upload/')
          ? `${attachment.downloadURL}/raw`
          : attachment.downloadURL
        const url = rawUrl.startsWith('http') ? rawUrl : `${baseUrl}${rawUrl}`
        const response = await fetch(url, {
          headers: cookieHeader ? { cookie: cookieHeader } : undefined,
        })
        if (!response.ok) {
          sections.push(`Document: ${name}\n(Failed to read file content)`)
          continue
        }
        arrayBuffer = await response.arrayBuffer()
      }

      const text = await extractTextFromBuffer(Buffer.from(arrayBuffer), name, attachment.mimeType)
      const cleaned = text.replace(/\s+/g, ' ').trim()
      const chunks = cleaned ? chunkTextForContext(cleaned, 900, 140) : []
      const selectedChunks = chunks
        .map((chunk, idx) => ({
          idx,
          chunk,
          score: scoreChunkAgainstQuery(chunk, rankingTokens) + (idx === 0 ? 0.02 : 0),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .sort((a, b) => a.idx - b.idx)

      const excerpt = selectedChunks.length > 0
        ? selectedChunks.map((entry, idx) => `Chunk ${idx + 1}: ${entry.chunk}`).join('\n')
        : cleaned
          ? cleaned.slice(0, 2500)
          : '(No extractable text)'
      const section = `Document: ${name}\n${excerpt}`
      sections.push(section)
      totalLength += section.length
      if (totalLength >= 5200) break
    } catch {
      sections.push(`Document: ${name}\n(Failed to read file content)`)
    }
  }

  if (!sections.length) return ''
  return `\n\nAttachment excerpts:\n${sections.join('\n\n')}`
}

const normalizeAuthorityToken = (value: string): string =>
  (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()

const hasCaseLawSignal = (line: string): boolean => {
  const text = (line || '').trim()
  if (!text) return false
  const hasCaseNamePattern = /\b[A-Z][A-Za-z'&.\-]{1,}\s+v\.?\s+[A-Z][A-Za-z'&.\-]{1,}\b/.test(text)
  const hasNeutralCitationPattern = /\[\d{4}\]\s*[A-Z]{2,8}[A-Za-z\s]*\d+/i.test(text)
  const hasCourtToken = /\b(UKSC|EWCA|EWHC|UKUT|EWFC)\b/i.test(text)
  return hasCaseNamePattern || hasNeutralCitationPattern || hasCourtToken
}

const buildAllowedAuthorityTokens = (
  vectorItems: VectorCaseLawRagItem[],
  suggestionItems: CaseLawSuggestion[],
  verifiedAuthorities: Array<{ title: string; citation: string }> = []
): Set<string> => {
  const tokens = new Set<string>()
  const pushToken = (value: string) => {
    const normalized = normalizeAuthorityToken(value)
    if (normalized.length >= 4) tokens.add(normalized)
  }

  vectorItems.forEach((item) => {
    pushToken(item.title || '')
    pushToken(item.citation || '')
    pushToken(`${item.title || ''} ${item.citation || ''}`)
  })
  suggestionItems.forEach((item) => {
    pushToken(item.title || '')
    pushToken(item.citation || '')
    pushToken(`${item.title || ''} ${item.citation || ''}`)
  })
  verifiedAuthorities.forEach((item) => {
    pushToken(item.title || '')
    pushToken(item.citation || '')
    pushToken(`${item.title || ''} ${item.citation || ''}`)
  })

  return tokens
}

const scrubUnsupportedCaseLawClaims = (
  text: string,
  allowedAuthorityTokens: Set<string>
): { text: string; removedCount: number } => {
  // If no verified authority tokens were passed through, do not strip visible
  // case headings from the answer. Otherwise Premium+ responses collapse into
  // anonymous "This case..." summaries even when the model named the case.
  if (!allowedAuthorityTokens || allowedAuthorityTokens.size === 0) {
    return { text: (text || '').trim(), removedCount: 0 }
  }

  const lines = (text || '').split('\n')
  let removedCount = 0

  const filtered = lines.filter((line) => {
    if (!hasCaseLawSignal(line)) return true
    const normalizedLine = normalizeAuthorityToken(line)
    const hasAllowedAuthority = Array.from(allowedAuthorityTokens).some(
      (token) => token.length >= 4 && normalizedLine.includes(token)
    )
    if (hasAllowedAuthority) return true
    removedCount += 1
    return false
  })

  let finalText = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!finalText) finalText = 'I could not verify case-law references for this answer from retrieved authorities.'
  if (removedCount > 0) {
    finalText = `${finalText}\n\nNote: I removed unverified case-law references.`
  }

  return { text: finalText, removedCount }
}

const buildAttachmentMetadata = (attachments: ChatAttachment[]) => {
  if (!attachments.length) return ''
  const lines = attachments.map((file, idx) => {
    const name = file.name || 'Untitled document'
    const typeLabel = file.mimeType ? ` (${file.mimeType})` : ''
    return `File ${idx + 1}: ${name}${typeLabel}`
  })
  return `\n\nAttachment list:\n${lines.join('\n')}`
}

const truncateText = (value: string, maxChars: number) => {
  if (!value) return ''
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars - 1)}…`
}

const AGENT_HISTORY_MIN_LIMIT = 40
const AGENT_HISTORY_MIN_FETCH_LIMIT = 80

const resolveAgentHistoryLimit = (threadTurnLimit: number) =>
  Math.max(AGENT_HISTORY_MIN_LIMIT, Math.floor(Math.max(1, threadTurnLimit) * 2))

const resolveAgentHistoryFetchLimit = (agentHistoryLimit: number) =>
  Math.max(AGENT_HISTORY_MIN_FETCH_LIMIT, agentHistoryLimit * 2)

const normalizeConversationHistoryEntry = (entry: any) => {
  if (!entry || typeof entry.role !== 'string' || typeof entry.content !== 'string') return null
  const content = truncateText(String(entry.content || '').trim(), 600)
  if (!content) return null
  return {
    role: entry.role === 'assistant' ? 'assistant' : 'user',
    content,
  } as { role: 'user' | 'assistant'; content: string }
}

const mergeConversationHistoryEntries = (
  persistedHistory: Array<{ role: string; content: string }> = [],
  clientHistory: Array<{ role: string; content: string }> = [],
  currentMessage?: string,
  limit: number = AGENT_HISTORY_MIN_LIMIT
) => {
  const merged = [...persistedHistory, ...clientHistory]
    .map(normalizeConversationHistoryEntry)
    .filter((entry): entry is { role: 'user' | 'assistant'; content: string } => Boolean(entry))

  const deduped: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const entry of merged) {
    const previous = deduped[deduped.length - 1]
    if (previous && previous.role === entry.role && previous.content === entry.content) continue
    deduped.push(entry)
  }

  const normalizedCurrentMessage = typeof currentMessage === 'string' ? truncateText(currentMessage.trim(), 600) : ''
  if (normalizedCurrentMessage) {
    const lastEntry = deduped[deduped.length - 1]
    if (lastEntry?.role === 'user' && lastEntry.content === normalizedCurrentMessage) {
      deduped.pop()
    }
  }

  return deduped.slice(-Math.max(1, limit))
}

const loadPersistedConversationHistory = async (
  conversationId: string | null,
  fetchLimit: number = AGENT_HISTORY_MIN_FETCH_LIMIT
) => {
  if (!conversationId) return []

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('role, content, timestamp, id')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.max(1, fetchLimit))

  if (error) {
    console.warn('Failed to load persisted conversation history for Premium+ agent:', error)
    return []
  }

  return (data || [])
    .slice()
    .reverse()
    .map((row: any) => normalizeConversationHistoryEntry(row))
    .filter((entry): entry is { role: 'user' | 'assistant'; content: string } => Boolean(entry))
}

const firstDefinedString = (...values: any[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return ''
}

const asObject = (value: any): Record<string, any> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, any>
}

const resolveCaseStage = (caseData: Record<string, any>): string => {
  if (!caseData) return ''
  const procedural = asObject(caseData.checklist_procedural)
  return firstDefinedString(
    caseData.caseStage,
    caseData.case_stage,
    caseData.stage,
    procedural?.currentStage,
    procedural?.current_stage,
    procedural?.stage
  )
}

const resolveCaseNextDeadline = (caseData: Record<string, any>): string => {
  if (!caseData) return ''
  const procedural = asObject(caseData.checklist_procedural)
  return firstDefinedString(
    caseData.nextDeadline,
    caseData.next_deadline,
    procedural?.nextDeadline,
    procedural?.next_deadline,
    procedural?.deadline
  )
}

const normalizeCompactText = (value: string) => value.replace(/\s+/g, ' ').trim()

const COURT_REFERENCE_LABELS: Array<{ token: string; label: string }> = [
  { token: 'UKSC', label: 'UK Supreme Court' },
  { token: 'EWCA', label: 'Court of Appeal (England and Wales)' },
  { token: 'EWHC', label: 'High Court (England and Wales)' },
  { token: 'UKUT', label: 'Upper Tribunal (UK)' },
  { token: 'EWFC', label: 'Family Court (England and Wales)' },
]

const resolveCourtLabelFromCitation = (citation: string): string | null => {
  const upperCitation = citation.toUpperCase()
  for (const entry of COURT_REFERENCE_LABELS) {
    if (upperCitation.includes(entry.token)) {
      return entry.label
    }
  }
  return null
}

const formatCaseLawReferenceForUsers = (item: CaseLawSuggestion): string => {
  const title = normalizeCompactText(item.title || '')
  const citation = normalizeCompactText(item.citation || '')
  const courtLabel = citation ? resolveCourtLabelFromCitation(citation) : null

  if (title && citation && courtLabel) {
    return `${title} (${courtLabel} reference ${citation})`
  }
  if (title && citation) {
    return `${title} (case reference ${citation})`
  }
  if (title) return title
  if (citation && courtLabel) {
    return `${courtLabel} reference ${citation}`
  }
  if (citation) return `case reference ${citation}`
  return ''
}

const CASELAW_SUGGESTION_MIN_TRIGGER_SCORE = Number(
  process.env.CASELAW_SUGGESTION_MIN_TRIGGER_SCORE || '4'
)
const CASELAW_RETRIEVAL_MIN_SCORE = Number(
  process.env.CASELAW_RETRIEVAL_MIN_SCORE || process.env.CASELAW_SUGGESTION_MIN_TRIGGER_SCORE || '4'
)

const shouldUseCaseLawRetrieval = ({
  message,
  task,
  hasAttachments,
  premiumFlow,
  suggestionDecision,
}: {
  message: string
  task?: string
  hasAttachments?: boolean
  premiumFlow: boolean
  suggestionDecision: { shouldSuggest: boolean; shouldRetrieve?: boolean }
}) => {
  if (!premiumFlow) return false
  if (hasAttachments) return false

  const text = normalizeCompactText(message.toLowerCase())
  if (!text) return false

  const explicitlyNonRetrievalIntents = new Set(['deadline_query', 'document_review'])
  if (task && explicitlyNonRetrievalIntents.has(task)) {
    return false
  }

  const explicitAuthorityPattern =
    /\b(case law|precedent|authority|citation|neutral citation|judgment|court of appeal|supreme court|uksc|ewca|ewhc|cpr part|civil procedure rules|practice direction|section\s+\d+|article\s+\d+|act\s+\d{4})\b/
  if (explicitAuthorityPattern.test(text)) {
    return true
  }

  if (typeof suggestionDecision.shouldRetrieve === 'boolean') {
    return suggestionDecision.shouldRetrieve
  }

  return suggestionDecision.shouldSuggest
}

const evaluateCaseLawSuggestionNeed = ({
  message,
  history,
  task,
  hasAttachments,
}: {
  message: string
  history: Array<{ role: string; content: string }>
  task?: string
  hasAttachments?: boolean
}): {
  shouldSuggest: boolean
  shouldRetrieve: boolean
  explanationStyle: 'plain' | 'layered'
  score: number
  reasons: string[]
} => {
  const recentUserText = history
    .filter((entry) => entry.role === 'user')
    .slice(-4)
    .map((entry) => normalizeCompactText(entry.content || ''))
    .filter(Boolean)
    .join(' ')

  const aggregate = normalizeCompactText(`${recentUserText} ${message}`.toLowerCase())
  if (!aggregate) {
    return { shouldSuggest: false, shouldRetrieve: false, explanationStyle: 'plain', score: 0, reasons: ['no-content'] }
  }

  const reasons: string[] = []
  let score = 0

  if (hasAttachments && task === 'document_review') {
    return { shouldSuggest: false, shouldRetrieve: false, explanationStyle: 'plain', score: 0, reasons: ['document-review-only'] }
  }

  const administrativePattern =
    /\b(password|login|log in|sign in|signup|sign up|billing|invoice|subscription|plan|price|pricing|upload|bug|technical issue|error code)\b/
  if (administrativePattern.test(aggregate)) {
    return { shouldSuggest: false, shouldRetrieve: false, explanationStyle: 'plain', score: 0, reasons: ['administrative-topic'] }
  }

  const explicitAuthorityPattern =
    /\b(case law|precedent|authority|citation|neutral citation|judgment|court of appeal|supreme court|uksc|ewca|ewhc|cpr part|civil procedure rules|practice direction|section\s+\d+|article\s+\d+|act\s+\d{4})\b/
  const explicitAuthorityRequested = explicitAuthorityPattern.test(aggregate)
  if (explicitAuthorityRequested) {
    score += 6
    reasons.push('explicit-authority-request')
  }

  const interpretationHeavyPattern =
    /\b(duty of care|reasonableness|reasonable responses|interpretation|construe|construction|meaning in practice|boundary|exception|threshold|test|penalty clause|unfair dismissal|negligence|liability)\b/
  const interpretationHeavy = interpretationHeavyPattern.test(aggregate)
  if (interpretationHeavy) {
    score += 3
    reasons.push('interpretation-heavy-topic')
  }

  const riskStrengthPattern =
    /\b(likely|prospects|chances|chance of success|will i win|will this succeed|strength of my case|weak case|strong case|risk)\b/
  const riskStrengthQuestion = riskStrengthPattern.test(aggregate)
  if (riskStrengthQuestion) {
    score += 3
    reasons.push('risk-or-strength-question')
  }

  const ambiguityPattern =
    /\b(depends|ambiguous|unclear|grey area|could go either way|exception|boundary)\b/
  const ambiguitySignal = ambiguityPattern.test(aggregate)
  if (ambiguitySignal) {
    score += 2
    reasons.push('ambiguity-signal')
  }

  const legalSophisticationPattern =
    /\b(ratio|obiter|precedent|authority|neutral citation|cpr|practice direction|section\s+\d+|article\s+\d+)\b/
  if (legalSophisticationPattern.test(aggregate)) {
    score += 1
    reasons.push('legal-sophistication-signal')
  }

  const basicDefinitionPattern =
    /^(what is|what's|define|definition of|meaning of)\b/
  const aggregateWordCount = aggregate.split(/\s+/).filter(Boolean).length
  if (!explicitAuthorityRequested && basicDefinitionPattern.test(aggregate) && aggregateWordCount <= 20) {
    score -= 4
    reasons.push('basic-definition-request')
  }

  const proceduralPattern =
    /\b(how do i file|how to file|what form|which form|time limit|filing fee|serve by|where do i file|small claim process|n244|claim form)\b/
  if (!explicitAuthorityRequested && proceduralPattern.test(aggregate)) {
    score -= 4
    reasons.push('procedural-request')
  }

  const overwhelmPattern =
    /\b(i am stressed|i'm stressed|panic|overwhelmed|urgent help|fired today|evicted today)\b/
  if (!explicitAuthorityRequested && overwhelmPattern.test(aggregate)) {
    score -= 1
    reasons.push('avoid-overwhelm')
  }

  const taskAllowList = new Set([
    'legal_procedure',
    'case_lookup',
    'case_status',
    'deadline_query',
    'form_guidance',
    'document_drafting',
  ])
  if (task && taskAllowList.has(task)) {
    score += 2
    reasons.push(`task:${task}`)
  }

  const legalReasoningPattern =
    /\b(can i|should i|what happens|likely outcome|prospects|liability|defence|claim|hearing|directions|strike out|summary judgment|deadline)\b/
  if (legalReasoningPattern.test(aggregate)) {
    score += 2
    reasons.push('legal-reasoning-language')
  }

  const proceduralStagePattern =
    /\b(pre-action|claim form|particulars|defence|allocation|directions|witness statement|hearing|judgment|enforcement)\b/
  if (proceduralStagePattern.test(aggregate)) {
    score += 1
    reasons.push('procedural-stage-signal')
  }

  const factRichPattern =
    /\b(i was|i am|they said|they refused|deadline|court date|served|filed|paid|not paid|agreement|contract|landlord|tenant|employer)\b/
  if (factRichPattern.test(aggregate) && aggregate.length >= 120) {
    score += 1
    reasons.push('fact-rich-context')
  }

  const repeatedLegalPattern =
    /\b(claim|defence|court|hearing|deadline|judgment|evidence|protocol|appeal|enforcement)\b/g
  const legalTokenCount = (aggregate.match(repeatedLegalPattern) || []).length
  if (legalTokenCount >= 3) {
    score += 1
    reasons.push('multi-legal-signal')
  }

  const hasStrongAnchor =
    explicitAuthorityRequested ||
    interpretationHeavy ||
    riskStrengthQuestion ||
    ambiguitySignal ||
    legalReasoningPattern.test(aggregate) ||
    proceduralStagePattern.test(aggregate)

  const suggestionThreshold = Number.isFinite(CASELAW_SUGGESTION_MIN_TRIGGER_SCORE)
    ? CASELAW_SUGGESTION_MIN_TRIGGER_SCORE
    : 4
  const retrievalThreshold = Number.isFinite(CASELAW_RETRIEVAL_MIN_SCORE)
    ? CASELAW_RETRIEVAL_MIN_SCORE
    : suggestionThreshold

  const shouldRetrieve = hasStrongAnchor && score >= retrievalThreshold
  const shouldSuggest = hasStrongAnchor && score >= suggestionThreshold
  const explanationStyle: 'plain' | 'layered' = shouldRetrieve ? 'layered' : 'plain'

  return { shouldSuggest, shouldRetrieve, explanationStyle, score, reasons }
}

type RetrievalFocus = 'web_only' | 'vector_only' | 'hybrid'
type AppliedRetrievalFocus = RetrievalFocus | 'direct'

const PREMIUM_PLUS_TOOL_BY_SEARCH_MODE: Record<LegalSearchMode, PremiumPlusToolSelection['tool']> = {
  education: 'web_search_education',
  procedure: 'web_search_procedure',
  case_specific: 'web_search_case_specific',
  document_review: 'web_search_document_review',
  general: 'web_search_general',
}

const hasExplicitAuthoritySignal = ({
  message,
  history,
}: {
  message: string
  history: Array<{ role: string; content: string }>
}): boolean => {
  const recentUserText = history
    .filter((entry) => entry.role === 'user')
    .slice(-4)
    .map((entry) => normalizeCompactText(entry.content || ''))
    .filter(Boolean)
    .join(' ')

  const aggregate = normalizeCompactText(`${recentUserText} ${message}`.toLowerCase())
  if (!aggregate) return false

  const explicitAuthorityPattern =
    /\b(case law|precedent|authority|citation|neutral citation|judgment|court of appeal|supreme court|uksc|ewca|ewhc|ukut|ewfc|ratio|obiter|holding|practice direction|section\s+\d+|article\s+\d+|act\s+\d{4})\b/
  const citationOrCaseNamePattern =
    /\[[12][0-9]{3}\]\s*(uksc|ewca|ewhc|ukut|ewfc)\b|\b[\w'.-]+\s+v\.?\s+[\w'.-]+\b/i

  return explicitAuthorityPattern.test(aggregate) || citationOrCaseNamePattern.test(message)
}

const resolvePremiumPlusSearchMode = ({
  message,
  task,
  hasAttachments,
  retrievalFocusDecision,
}: {
  message: string
  task?: string
  hasAttachments?: boolean
  retrievalFocusDecision: {
    ownCaseNarrative: boolean
  }
}): LegalSearchMode => {
  if (hasAttachments || task === 'document_review') return 'document_review'
  if (task === 'deadline_query' || task === 'form_guidance' || task === 'legal_procedure' || task === 'case_status') {
    return 'procedure'
  }
  if (retrievalFocusDecision.ownCaseNarrative) return 'case_specific'

  const normalized = normalizeCompactText(message.toLowerCase())
  const educationPattern =
    /^(what is|what does|define|definition of|meaning of|explain|difference between|compare)\b/
  return educationPattern.test(normalized) ? 'education' : 'general'
}

const buildPremiumPlusHeuristicWebQuery = ({
  message,
  searchMode,
}: {
  message: string
  searchMode: LegalSearchMode
}): string => {
  const normalized = normalizeCompactText(message)
  if (!normalized) return ''

  switch (searchMode) {
    case 'procedure':
      return truncateText(`${normalized} England and Wales procedure`, 260)
    case 'case_specific':
      return truncateText(`${normalized} England and Wales practical guidance`, 260)
    case 'document_review':
      return truncateText(`${normalized} England and Wales document guidance`, 260)
    case 'education':
      return truncateText(`${normalized} plain English England and Wales`, 260)
    case 'general':
    default:
      return truncateText(normalized, 260)
  }
}

const shouldUsePremiumPlusCaseLawHeuristically = ({
  message,
  history,
  task,
  hasAttachments,
  retrievalFocusApplied,
  retrievalFocusDecision,
  suggestionDecision,
}: {
  message: string
  history: Array<{ role: string; content: string }>
  task?: string
  hasAttachments?: boolean
  retrievalFocusApplied: AppliedRetrievalFocus
  retrievalFocusDecision: {
    precedentScore: number
    procedureScore: number
  }
  suggestionDecision: {
    shouldSuggest: boolean
    shouldRetrieve: boolean
  }
}): boolean => {
  if (hasAttachments) return false
  if (retrievalFocusApplied === 'direct' || retrievalFocusApplied === 'web_only') return false
  if (hasExplicitAuthoritySignal({ message, history })) return true
  if (task === 'case_lookup') return true
  if (task === 'deadline_query' || task === 'form_guidance' || task === 'legal_procedure') return false

  if (retrievalFocusApplied === 'vector_only') {
    return suggestionDecision.shouldRetrieve || retrievalFocusDecision.precedentScore >= 4
  }

  return (
    suggestionDecision.shouldRetrieve &&
    retrievalFocusDecision.precedentScore >= Math.max(4, retrievalFocusDecision.procedureScore + 2)
  )
}

const buildHeuristicPremiumPlusTools = ({
  retrievalFocusApplied,
  searchMode,
  webQuery,
  vectorQuery,
  useCaseLawSuggestions,
  useCaseLawRag,
}: {
  retrievalFocusApplied: AppliedRetrievalFocus
  searchMode?: LegalSearchMode | null
  webQuery?: string
  vectorQuery?: string
  useCaseLawSuggestions: boolean
  useCaseLawRag: boolean
}): PremiumPlusToolSelection[] => {
  const tools: PremiumPlusToolSelection[] = []

  if (retrievalFocusApplied === 'direct') {
    tools.push({ tool: 'direct_knowledge' })
    return tools
  }

  if (retrievalFocusApplied === 'web_only' || retrievalFocusApplied === 'hybrid') {
    tools.push({
      tool: PREMIUM_PLUS_TOOL_BY_SEARCH_MODE[searchMode || 'general'],
      query: webQuery || undefined,
    })
  }

  if (useCaseLawSuggestions) {
    tools.push({ tool: 'case_law_suggestions', query: vectorQuery || undefined })
  }
  if (useCaseLawRag) {
    tools.push({ tool: 'case_law_rag', query: vectorQuery || undefined })
  }

  return tools
}

const evaluateRetrievalFocus = ({
  message,
  history,
  task,
  hasAttachments,
  caseContextData,
}: {
  message: string
  history: Array<{ role: string; content: string }>
  task?: string
  hasAttachments?: boolean
  caseContextData?: Record<string, any> | null
}): {
  focus: RetrievalFocus
  ownCaseNarrative: boolean
  precedentScore: number
  procedureScore: number
  reasons: string[]
} => {
  const recentUserText = history
    .filter((entry) => entry.role === 'user')
    .slice(-4)
    .map((entry) => normalizeCompactText(entry.content || ''))
    .filter(Boolean)
    .join(' ')

  const aggregate = normalizeCompactText(`${recentUserText} ${message}`.toLowerCase())
  const reasons: string[] = []
  if (!aggregate) {
    return {
      focus: 'web_only',
      ownCaseNarrative: false,
      precedentScore: 0,
      procedureScore: 0,
      reasons: ['no-content'],
    }
  }

  let precedentScore = 0
  let procedureScore = 0

  const precedentLanguagePattern =
    /\b(case law|precedent|authority|judgment|neutral citation|ratio|obiter|holding|how courts|similar case|uksc|ewca|ewhc|ukut|ewfc)\b/
  if (precedentLanguagePattern.test(aggregate)) {
    precedentScore += 4
    reasons.push('precedent-language')
  }

  const citationOrCaseNamePattern =
    /\[[12][0-9]{3}\]\s*(uksc|ewca|ewhc|ukut|ewfc)\b|\b[\w'.-]+\s+v\.?\s+[\w'.-]+\b/i
  if (citationOrCaseNamePattern.test(message)) {
    precedentScore += 4
    reasons.push('citation-or-case-name')
  }

  const procedureLanguagePattern =
    /\b(deadline|time limit|form|n244|claim form|particulars|serve|service|file|filing|hmcts|gov\.uk|practice direction|cpr|procedure|process|what should i do next|next steps?)\b/
  if (procedureLanguagePattern.test(aggregate)) {
    procedureScore += 4
    reasons.push('procedure-language')
  }

  const freshnessPattern = /\b(current|latest|updated|today|now|new rules?|recent)\b/
  if (freshnessPattern.test(aggregate)) {
    procedureScore += 2
    reasons.push('freshness-language')
  }

  const datePattern =
    /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b|\b\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i
  const firstPersonPattern = /\b(i|my|me|we|our)\b/
  const ownCaseActionPattern =
    /\b(sent|served|filed|received|emailed|called|paid|unpaid|deadline|hearing|claim|defence|defense|witness|evidence|contract|landlord|tenant|employer|accident|letter)\b/
  const caseContextSignal =
    Boolean(caseContextData) &&
    Boolean(
      firstDefinedString(
        caseContextData?.caseType,
        caseContextData?.case_type,
        resolveCaseStage(caseContextData || {}),
        resolveCaseNextDeadline(caseContextData || {})
      )
    )

  const ownCaseNarrative =
    (firstPersonPattern.test(aggregate) && ownCaseActionPattern.test(aggregate)) ||
    (firstPersonPattern.test(aggregate) && datePattern.test(message)) ||
    caseContextSignal

  if (ownCaseNarrative) {
    precedentScore += 1
    procedureScore += 1
    reasons.push('own-case-context')
  }

  if (task === 'case_lookup') {
    precedentScore += 2
    reasons.push('task:case_lookup-precedent')
  }
  if (task === 'legal_procedure' || task === 'deadline_query' || task === 'form_guidance') {
    procedureScore += 2
    reasons.push(`task:${task}-procedure`)
  }
  if (task === 'case_status' || task === 'document_drafting') {
    procedureScore += 1
    reasons.push(`task:${task}-procedure-lite`)
  }

  if (hasAttachments) {
    procedureScore += 1
    reasons.push('attachments-context')
  }

  let focus: RetrievalFocus = 'web_only'

  const explicitAuthorityRequested =
    precedentLanguagePattern.test(aggregate) ||
    citationOrCaseNamePattern.test(message)

  if (ownCaseNarrative && !hasAttachments) {
    if (!explicitAuthorityRequested && (task === 'legal_procedure' || task === 'deadline_query' || task === 'form_guidance' || procedureScore >= precedentScore)) {
      focus = 'web_only'
      reasons.push('own-case-web-default')
    } else if (precedentScore >= procedureScore + 3 && precedentScore >= 4) {
      focus = 'vector_only'
      reasons.push('own-case-precedent-dominant')
    } else if (precedentScore >= 3 && procedureScore >= 3) {
      focus = 'hybrid'
      reasons.push('own-case-hybrid')
    } else {
      focus = 'web_only'
      reasons.push('own-case-web-default')
    }
  } else if (precedentScore >= procedureScore + 3 && precedentScore >= 4) {
    focus = 'vector_only'
    reasons.push('precedent-dominant')
  } else if (procedureScore >= precedentScore + 3 && procedureScore >= 4) {
    focus = 'web_only'
    reasons.push('procedure-dominant')
  } else if (precedentScore >= 3 && procedureScore >= 3) {
    focus = 'hybrid'
    reasons.push('mixed-signals')
  } else if (precedentScore >= 4) {
    focus = 'vector_only'
    reasons.push('precedent-threshold')
  } else {
    focus = 'web_only'
    reasons.push('web-default')
  }

  if (hasAttachments && focus === 'vector_only') {
    focus = 'web_only'
    reasons.push('attachments-disable-vector')
  }

  return { focus, ownCaseNarrative, precedentScore, procedureScore, reasons }
}

const shouldUsePremiumPlusDirectAnswer = ({
  message,
  history,
  task,
  hasAttachments,
  retrievalFocusDecision,
}: {
  message: string
  history: Array<{ role: string; content: string }>
  task?: string
  hasAttachments?: boolean
  retrievalFocusDecision: {
    ownCaseNarrative: boolean
    precedentScore: number
    procedureScore: number
  }
}) => {
  if (hasAttachments) return false
  if (task === 'document_review' || task === 'deadline_query' || task === 'form_guidance') return false
  if (retrievalFocusDecision.ownCaseNarrative) return false

  const recentUserText = history
    .filter((entry) => entry.role === 'user')
    .slice(-4)
    .map((entry) => normalizeCompactText(entry.content || ''))
    .filter(Boolean)
    .join(' ')

  const aggregate = normalizeCompactText(`${recentUserText} ${message}`.toLowerCase())
  if (!aggregate) return false

  const wordCount = aggregate.split(/\s+/).filter(Boolean).length
  const definitionPattern = /^(what is|what does|define|definition of|meaning of|explain|difference between|compare)\b/
  const actionPattern = /\b(can i|should i|what should i do|how do i|how can i|next steps?|what happens if|will i|would i)\b/
  const freshnessPattern = /\b(current|latest|updated|today|now|new rules?|recent)\b/
  const authorityPattern =
    /\b(case law|precedent|authority|judgment|neutral citation|uksc|ewca|ewhc|cpr|practice direction|section\s+\d+|article\s+\d+|act\s+\d{4})\b/
  const procedurePattern =
    /\b(deadline|time limit|form|n244|claim form|particulars|serve|service|file|filing|hmcts|gov\.uk|procedure|process|hearing|defence|defense|order|appeal)\b/

  if (actionPattern.test(aggregate)) return false
  if (freshnessPattern.test(aggregate)) return false
  if (authorityPattern.test(aggregate)) return false
  if (procedurePattern.test(aggregate)) return false

  if (definitionPattern.test(aggregate) && wordCount <= 28) return true

  return (
    wordCount <= 12 &&
    retrievalFocusDecision.precedentScore <= 0 &&
    retrievalFocusDecision.procedureScore <= 0
  )
}

const PREMIUM_PLUS_WEB_SEARCH_MODE_BY_TOOL: Partial<Record<PremiumPlusToolSelection['tool'], LegalSearchMode>> = {
  web_search_education: 'education',
  web_search_procedure: 'procedure',
  web_search_case_specific: 'case_specific',
  web_search_document_review: 'document_review',
  web_search_general: 'general',
}

const hasPremiumPlusWebSearchTool = (tools: PremiumPlusToolSelection[] | undefined) => {
  return Array.isArray(tools) && tools.some((item) => item.tool in PREMIUM_PLUS_WEB_SEARCH_MODE_BY_TOOL)
}

const buildCaseLawSuggestionQuery = ({
  message,
  history,
  caseContextData,
  memoryRow,
}: {
  message: string
  history: Array<{ role: string; content: string }>
  caseContextData: Record<string, any> | null
  memoryRow: any
}) => {
  const caseTitle = firstDefinedString(caseContextData?.caseTitle, caseContextData?.title)
  const caseType = firstDefinedString(caseContextData?.caseType, caseContextData?.case_type)
  const caseStage = resolveCaseStage(caseContextData || {})

  const userHistory = history
    .filter((entry) => entry.role === 'user')
    .slice(-4)
    .map((entry) => normalizeCompactText(entry.content || ''))
    .filter(Boolean)

  const memoryFacts = Array.isArray(memoryRow?.key_facts)
    ? memoryRow.key_facts
        .map((item: any) => normalizeCompactText(String(item || '')))
        .filter(Boolean)
        .slice(0, 3)
    : []

  const queryParts = [
    normalizeCompactText(message),
    ...userHistory,
    caseTitle ? `Case title ${caseTitle}` : '',
    caseType ? `Case type ${caseType}` : '',
    caseStage ? `Stage ${caseStage}` : '',
    ...memoryFacts,
  ]
    .map((part) => normalizeCompactText(part))
    .filter(Boolean)

  const deduped = Array.from(new Set(queryParts))
  return truncateText(deduped.join(' | '), 720)
}

const normalizeRagText = (value: any, maxLen: number): string => {
  if (typeof value !== 'string') return ''
  const compact = normalizeCompactText(value)
  if (!compact) return ''
  return compact.length > maxLen ? `${compact.slice(0, maxLen - 1)}…` : compact
}

const buildVectorCaseLawRagContext = (items: VectorCaseLawRagItem[]): string => {
  if (!Array.isArray(items) || items.length === 0) return ''

  const lines: string[] = ['Vector case law context (Premium+):']
  items.forEach((item, idx) => {
    lines.push(`[${idx + 1}] ${item.citation} - ${item.title}`)
    if (item.summary) lines.push(`Summary: ${normalizeRagText(item.summary, 280)}`)
    if (item.extracts) lines.push(`Extract: ${normalizeRagText(item.extracts, 360)}`)
    if (item.url) lines.push(`URL: ${item.url}`)
  })

  return `\n\n${truncateText(lines.join('\n'), 2000)}`
}

const buildCaseLawSuggestionContext = (items: CaseLawSuggestion[]): string => {
  if (!Array.isArray(items) || items.length === 0) return ''

  const lines: string[] = ['Case law shortlist (Premium+):']
  items.slice(0, 3).forEach((item, idx) => {
    lines.push(`[${idx + 1}] ${item.citation} - ${item.title}`)
    if (item.summary) lines.push(`Summary: ${truncateText(normalizeCompactText(item.summary), 220)}`)
    if (item.url) lines.push(`URL: ${item.url}`)
  })

  return `\n\n${truncateText(lines.join('\n'), 1200)}`
}

const buildCaseLawSoftNextStep = ({
  shouldSuggest,
  suggestions,
  existingResponse,
}: {
  shouldSuggest: boolean
  suggestions: CaseLawSuggestion[]
  existingResponse: string
}): string | null => {
  if (!shouldSuggest) return null

  const responseText = normalizeCompactText(existingResponse.toLowerCase())
  if (!responseText) return null
  if (/\b(next step|next\s+optional\s+step).*(case law|precedent|authority)\b/.test(responseText)) {
    return null
  }

  const shortList = suggestions
    .slice(0, 2)
    .map((item) => formatCaseLawReferenceForUsers(item))
    .filter(Boolean)

  const dedupedShortList = Array.from(new Set(shortList))

  if (dedupedShortList.length > 0) {
    return `Next step (optional): I can summarise ${dedupedShortList.join(' and ')} in plain English and highlight the legal principles each authority discusses.`
  }

  return 'Next step (optional): If useful, I can pull 2 to 3 relevant UK court decisions and summarise the key legal principles they set out.'
}

const extractCaseKeywords = (caseData: Record<string, any>): string => {
  if (!caseData) return ''
  const keywords: string[] = []

  const caseType = firstDefinedString(caseData.caseType, caseData.case_type)
  const court = firstDefinedString(caseData.court)
  const claimType = firstDefinedString(caseData.claimType, caseData.claim_type)
  const userRole = firstDefinedString(caseData.userRole, caseData.user_role)
  const caseStage = resolveCaseStage(caseData)

  if (caseType) keywords.push(caseType)
  if (court) keywords.push(court)
  if (claimType) keywords.push(claimType)
  if (userRole) keywords.push(userRole)
  if (caseStage) keywords.push(caseStage)
  if (Array.isArray(caseData.keyFacts)) {
    keywords.push(...caseData.keyFacts.slice(0, 3).map((f: any) => String(f)))
  } else if (Array.isArray(caseData.key_facts)) {
    keywords.push(...caseData.key_facts.slice(0, 3).map((f: any) => String(f)))
  }
  if (Array.isArray(caseData.legalAreas)) {
    keywords.push(...caseData.legalAreas.slice(0, 2).map((a: any) => String(a)))
  } else if (Array.isArray(caseData.legal_areas)) {
    keywords.push(...caseData.legal_areas.slice(0, 2).map((a: any) => String(a)))
  }

  return keywords.filter(Boolean).join(' ').slice(0, 220)
}

const buildCaseContext = (caseData: Record<string, any>) => {
  if (!caseData) return ''
  const lines: string[] = []

  const pushList = (label: string, items?: any[], limit: number = 5) => {
    if (!Array.isArray(items) || items.length === 0) return
    const trimmed = items.slice(0, limit).map((item) => String(item))
    lines.push(`${label}: ${trimmed.join('; ')}`)
  }

  const caseTitle = firstDefinedString(caseData.caseTitle, caseData.title)
  const caseNumber = firstDefinedString(caseData.caseNumber, caseData.external_id)
  const caseType = firstDefinedString(caseData.caseType, caseData.case_type)
  const court = firstDefinedString(caseData.court)
  const caseStage = resolveCaseStage(caseData)
  const nextDeadline = resolveCaseNextDeadline(caseData)

  if (caseTitle) lines.push(`Case title: ${caseTitle}`)
  if (caseNumber) lines.push(`Case number: ${caseNumber}`)
  if (caseType) lines.push(`Case type: ${caseType}`)
  if (caseStage) lines.push(`Case stage: ${caseStage}`)
  if (court) lines.push(`Court: ${court}`)
  if (nextDeadline) lines.push(`Next deadline: ${nextDeadline}`)

  pushList('Parties', caseData.partiesInvolved || caseData.parties_involved)
  pushList('Key facts', caseData.keyFacts || caseData.key_facts)
  pushList('Evidence', caseData.evidence)

  if (!lines.length) return ''
  return `\n\nCase context:\n${lines.join('\n')}`
}

const buildMemoryKey = (
  authUserId: string | undefined,
  guestId: string | null,
  caseId: string | null,
  conversationId: string | null
) => {
  const userPart = authUserId ? `u:${authUserId}` : guestId ? `g:${guestId}` : 'anon'
  const casePart = caseId ? `c:${caseId}` : 'c:none'
  const convPart = conversationId ? `v:${conversationId}` : 'v:none'
  return `${userPart}|${casePart}|${convPart}`
}

const extractKeyFactsFromMessage = (message: string) => {
  const cleaned = message.replace(/\s+/g, ' ').trim()
  if (!cleaned) return [] as string[]

  const facts: string[] = []
  const sentenceParts = cleaned.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean)
  for (const sentence of sentenceParts) {
    const lower = sentence.toLowerCase()
    if (
      /\b(my|i have|i am|i was|i need|the issue|the problem|deadline|hearing|court|landlord|tenant|employer|claim)\b/.test(lower) &&
      sentence.length >= 16
    ) {
      facts.push(truncateText(sentence, 180))
    }
    if (facts.length >= 8) break
  }
  return facts
}

const mergeFacts = (existing: any, incoming: string[]) => {
  const current = Array.isArray(existing) ? existing.map((x) => String(x)).filter(Boolean) : []
  const merged = [...current]
  for (const fact of incoming) {
    if (!merged.includes(fact)) merged.push(fact)
    if (merged.length >= 12) break
  }
  return merged
}

const parseDateGuess = (text: string): string | null => {
  const cleaned = text.trim()
  if (!cleaned) return null
  const parsed = new Date(cleaned)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  return null
}

const extractActionItems = (text: string): ExtractedAction[] => {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean)

  const actionVerb = /\b(file|submit|serve|prepare|draft|contact|call|email|attend|pay|gather|upload|review|send|complete)\b/i
  const duePattern = /\b(?:by|on|before)\s+([\w\-/, ]{3,30})/i
  const actions: ExtractedAction[] = []

  for (const line of lines) {
    if (!actionVerb.test(line)) continue

    const dueMatch = line.match(duePattern)
    let dueDate: string | null = null
    if (dueMatch?.[1]) {
      dueDate = parseDateGuess(dueMatch[1])
    }

    actions.push({
      title: truncateText(line, 220),
      dueDate,
      confidence: dueDate ? 'high' : 'medium',
    })

    if (actions.length >= 5) break
  }

  return actions
}

const inferFollowUpQuestion = (task: string, message: string) => {
  const text = message.toLowerCase()
  const hasDate = /\b\d{1,2}[/\-]\d{1,2}([/\-]\d{2,4})?\b|\b(today|tomorrow|next week|next month|monday|tuesday|wednesday|thursday|friday)\b/i.test(message)

  if (task === 'deadline_query' && !hasDate) {
    return 'Could you share the exact deadline or hearing date so I can give guidance in the right order and timing?'
  }
  if (task === 'document_review' && !/\b(document|email|letter|photo|screenshot|witness|statement)\b/.test(text)) {
    return 'What evidence do you currently have (for example emails, letters, screenshots, or witnesses)?'
  }
  if (task === 'legal_procedure' && !/\b(claim form|defence|hearing|judgment|order|appeal|n244|cpr)\b/.test(text)) {
    return 'Which stage are you at right now (for example pre-claim, claim filed, defence filed, or hearing listed)?'
  }
  if (task === 'form_guidance' && !/\b(n\d{1,3}|claim form|defence form|n244|n180|n1)\b/.test(text)) {
    return 'Which court form do you need help with (for example N1, N180, or N244)?'
  }
  return null
}

const resolveThreadTurnLimit = ({
  basicPlanActive,
  premiumPlanActive,
  premiumPlusActive,
}: {
  basicPlanActive: boolean
  premiumPlanActive: boolean
  premiumPlusActive: boolean
}): number => {
  if (premiumPlusActive) return PREMIUM_PLUS_THREAD_MAX_USER_TURNS
  if (premiumPlanActive) return PREMIUM_THREAD_MAX_USER_TURNS
  if (basicPlanActive) return BASIC_THREAD_MAX_USER_TURNS
  return CHAT_THREAD_MAX_USER_TURNS_DEFAULT
}

const buildMemoryContext = (memory: any, heading: string = 'Conversation memory') => {
  if (!memory) return ''
  const lines: string[] = []

  if (memory.memory_summary) {
    lines.push(`Memory summary: ${truncateText(String(memory.memory_summary), 260)}`)
  }
  if (Array.isArray(memory.key_facts) && memory.key_facts.length > 0) {
    const facts = memory.key_facts.slice(0, 6).map((f: any) => `- ${truncateText(String(f), 150)}`)
    lines.push(`Known facts:\n${facts.join('\n')}`)
  }
  if (Array.isArray(memory.open_questions) && memory.open_questions.length > 0) {
    const qs = memory.open_questions.slice(0, 2).map((q: any) => truncateText(String(q), 160))
    lines.push(`Open questions: ${qs.join(' | ')}`)
  }

  if (!lines.length) return ''
  return `${heading}:\n${lines.join('\n')}`
}

const hasUsefulMemory = (memory: any): boolean => {
  if (!memory) return false
  const hasSummary = typeof memory.memory_summary === 'string' && memory.memory_summary.trim().length > 0
  const hasFacts = Array.isArray(memory.key_facts) && memory.key_facts.some((f: any) => String(f || '').trim().length > 0)
  const hasOpenQuestions =
    Array.isArray(memory.open_questions) && memory.open_questions.some((q: any) => String(q || '').trim().length > 0)
  return hasSummary || hasFacts || hasOpenQuestions
}

const normalizeMemoryList = (value: any, maxItems: number, maxChars: number): string[] => {
  const arr = Array.isArray(value) ? value : []
  const out: string[] = []
  for (const entry of arr) {
    const text = truncateText(String(entry || '').trim(), maxChars)
    if (!text) continue
    if (!out.includes(text)) out.push(text)
    if (out.length >= maxItems) break
  }
  return out
}

const loadRelatedThreadMemory = async ({
  authUserId,
  guestId,
  caseId,
  excludeConversationId,
}: {
  authUserId?: string | null
  guestId?: string | null
  caseId?: string | null
  excludeConversationId?: string | null
}): Promise<RelatedThreadMemorySnapshot | null> => {
  if (!authUserId && !guestId) return null

  let query = supabaseAdmin
    .from('chat_memory')
    .select('memory_summary,key_facts,open_questions,conversation_id,updated_at,case_id')
    .order('updated_at', { ascending: false })
    .limit(caseId ? 10 : 6)

  if (authUserId) {
    query = query.eq('user_id', authUserId)
  } else if (guestId) {
    query = query.eq('guest_id', guestId)
  }

  const { data, error } = await query
  if (error) {
    console.warn('Related thread memory lookup failed:', error)
    return null
  }

  const rows = (Array.isArray(data) ? data : []).filter((row: any) => {
    if (!row || typeof row !== 'object') return false
    if (excludeConversationId && row.conversation_id === excludeConversationId) return false
    return true
  })
  if (rows.length === 0) return null

  const sameCaseRows = caseId
    ? rows.filter((row: any) => row?.case_id === caseId)
    : []
  const selectedRows = (sameCaseRows.length > 0 ? sameCaseRows : rows).slice(0, 4)
  const sameCaseMatch = sameCaseRows.length > 0

  const summaryCandidates = selectedRows
    .map((row: any) => truncateText(String(row?.memory_summary || '').trim(), 220))
    .filter(Boolean)
    .slice(0, 2)

  const keyFacts: string[] = []
  const openQuestions: string[] = []

  for (const row of selectedRows) {
    for (const fact of normalizeMemoryList((row as any)?.key_facts, 8, 150)) {
      if (!keyFacts.includes(fact)) keyFacts.push(fact)
      if (keyFacts.length >= 12) break
    }
    for (const question of normalizeMemoryList((row as any)?.open_questions, 2, 160)) {
      if (!openQuestions.includes(question)) openQuestions.push(question)
      if (openQuestions.length >= 4) break
    }
    if (keyFacts.length >= 12 && openQuestions.length >= 4) break
  }

  const summary = summaryCandidates.length > 0
    ? truncateText(summaryCandidates.join(' | '), 320)
    : null

  const fallbackMemory: RelatedThreadMemorySnapshot = {
    memory_summary: summary,
    key_facts: keyFacts.slice(0, 12),
    open_questions: openQuestions.slice(0, 4),
    user_turn_count: null,
    conversationCount: selectedRows.length,
    sameCaseMatch,
  }

  return hasUsefulMemory(fallbackMemory) ? fallbackMemory : null
}

export async function POST(request: NextRequest) {
  let authUserId: string | undefined

  try {
    const secFetchSite = request.headers.get('sec-fetch-site')
    if (secFetchSite && secFetchSite === 'cross-site') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const contentType = request.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json({ error: 'Unsupported Media Type' }, { status: 415 })
    }

    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    authUserId = authData?.user?.id

    if (!authUserId) {
      return NextResponse.json(
        buildAssistantResponsePayload('Please sign in and choose a paid plan to use chat.', {
          signInRequired: true,
          upgradeRequired: true,
        }),
        { status: 401 }
      )
    }

    const userId = authUserId
    const guestId: string | null = null
    const withCookie = (res: NextResponse) => res

    const identifier = getIdentifier(userId)
    const rateLimitResult = await rateLimit(aiRateLimiter, identifier, 10, 60000)
    if (!rateLimitResult.success) {
      return withCookie(
        NextResponse.json(
          {
            error: 'Too many requests',
            message: 'You have exceeded the rate limit. Please try again later.',
            resetAt: new Date(rateLimitResult.reset).toISOString(),
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': String(rateLimitResult.limit),
              'X-RateLimit-Remaining': String(rateLimitResult.remaining),
              'X-RateLimit-Reset': String(rateLimitResult.reset),
            },
          }
        )
      )
    }

    const body = await request.json()
    const parsedBody = chatRequestSchema.safeParse(body)
    if (!parsedBody.success) {
      return withCookie(NextResponse.json({ error: 'Invalid input', details: parsedBody.error.issues }, { status: 400 }))
    }

    const bodyData = parsedBody.data

    const sanitizedCaseId =
      typeof bodyData?.activeCaseId === 'string' && uuidRegex.test(bodyData.activeCaseId.trim())
        ? bodyData.activeCaseId.trim()
        : undefined

    const validation = chatMessageSchema.safeParse({
      message: bodyData.message,
      caseId: sanitizedCaseId,
      mode: bodyData.mode,
    })
    if (!validation.success) {
      return withCookie(NextResponse.json({ error: 'Invalid input', details: validation.error.issues }, { status: 400 }))
    }

    const { message, history, conversationId, attachments, sessionMessageCount, sessionStartedAt } = bodyData
    const activeCaseId = sanitizedCaseId

    if (!message || typeof message !== 'string') {
      return withCookie(NextResponse.json({ message: 'Message is required' }, { status: 400 }))
    }

    let safeConversationId = conversationId
    if (typeof conversationId === 'string' && conversationId.trim()) {
      const scopedUserIds = await resolveScopedUserIds(authUserId, authData?.user?.email || null)
      const caseIds = await getOwnedCaseIds(scopedUserIds)
      const access = await getConversationAccess(scopedUserIds, conversationId.trim(), caseIds)
      if (access === 'forbidden') {
        return withCookie(
          NextResponse.json(
            buildAssistantResponsePayload('That conversation is unavailable.', {
              conversationUnavailable: true,
            }),
            { status: 403 }
          )
        )
      }
      safeConversationId = conversationId.trim()
    }

    const chatManager = new ChatManager(userId, activeCaseId, safeConversationId, authData?.user?.email || null)

    const sanitizedHistory = Array.isArray(history)
      ? history
          .filter((entry: any) => entry && typeof entry.role === 'string' && typeof entry.content === 'string')
          .map((entry: any) => ({
            role: entry.role === 'assistant' ? 'assistant' : 'user',
            content: truncateText(entry.content, 600),
          }))
      : []

    let hasPaidPlan = false
    let basicPlanActive = false
    let premiumPlanActive = false
    let premiumPlusActive = false
    let activePlanLabel = 'none'
    if (authUserId) {
      const planData = await getUserPlanData(authUserId, authData?.user?.email || null)
      activePlanLabel = normalizePlanLabel(planData?.plan || '')
      hasPaidPlan = Boolean(planData?.paidAccess)
      basicPlanActive = isBasicPlan(activePlanLabel)
      premiumPlusActive = isPremiumPlusPlan(activePlanLabel)
      premiumPlanActive = hasPaidPlan && isPremiumPlan(activePlanLabel)
      chatManager.seedUserPlan(planData?.plan || null)

      if (!hasPaidPlan) {
        return withCookie(
          NextResponse.json(
            buildAssistantResponsePayload('A paid plan is required to use chat. Please choose a plan to continue.', {
              upgradeRequired: true,
              activePlan: activePlanLabel || 'none',
              planStatus: String(planData?.planStatus || 'inactive').toLowerCase(),
            }),
            { status: 403 }
          )
        )
      }

    }

    const threadTurnLimit = resolveThreadTurnLimit({
      basicPlanActive,
      premiumPlanActive,
      premiumPlusActive,
    })
    const agentHistoryLimit = resolveAgentHistoryLimit(threadTurnLimit)
    const agentHistoryFetchLimit = resolveAgentHistoryFetchLimit(agentHistoryLimit)

    const sessionInfo = await chatManager.initializeSession()
    if (sessionInfo.requiresCaseSelection) {
      const caseSelectionResponse =
        'I see you have multiple cases. Which case would you like to discuss?\n\n' +
        sessionInfo.cases
          .map((c: any, i: number) => `${i + 1}. ${c.caseType || 'Case'} - ${c.caseNumber || c.id}`)
          .join('\n')
      return withCookie(
        NextResponse.json(
          buildAssistantResponsePayload(caseSelectionResponse, undefined, {
            requiresCaseSelection: true,
            cases: sessionInfo.cases,
          })
        )
      )
    }

    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const proto = request.headers.get('x-forwarded-proto') || 'http'
    const baseUrl = host ? `${proto}://${host}` : ''
    const activeConversationId = sessionInfo.conversationId || safeConversationId || null
    const persistedConversationHistory =
      chatManager.shouldPersistMessages()
        ? await loadPersistedConversationHistory(activeConversationId, agentHistoryFetchLimit)
        : []
    const effectiveConversationHistory = mergeConversationHistoryEntries(
      persistedConversationHistory,
      sanitizedHistory,
      message,
      agentHistoryLimit
    )

    const hasAttachments = Array.isArray(attachments) && attachments.length > 0
    const cookieHeader = request.headers.get('cookie')
    const attachmentContext = hasAttachments && baseUrl
      ? await buildAttachmentContext(attachments, baseUrl, cookieHeader, message, authUserId)
      : ''
    const attachmentMetadata = hasAttachments && !attachmentContext ? buildAttachmentMetadata(attachments) : ''

    const processingResult = await chatManager.processMessage(message, hasAttachments, {
      userAgent: request.headers.get('user-agent'),
      sessionMessageCount: typeof sessionMessageCount === 'number' ? sessionMessageCount : null,
      sessionStartedAt: typeof sessionStartedAt === 'string' ? sessionStartedAt : null,
    })

    if (authUserId && (premiumPlanActive || premiumPlusActive)) {
      const providerCapacity = await acquirePremiumProviderCapacity()
      if (!providerCapacity.success) {
        const retryAfterSeconds = Math.max(1, Math.ceil(providerCapacity.retryAfterMs / 1000))
        return withCookie(
          NextResponse.json(
            {
              error: 'Provider capacity reached',
              message: 'Premium chat is briefly at capacity. Please retry in a few seconds.',
              resetAt: new Date(providerCapacity.reset).toISOString(),
              retryAfterMs: providerCapacity.retryAfterMs,
            },
            {
              status: 429,
              headers: {
                'Retry-After': String(retryAfterSeconds),
                'X-RateLimit-Limit': String(providerCapacity.limit),
                'X-RateLimit-Remaining': String(providerCapacity.remaining),
                'X-RateLimit-Reset': String(providerCapacity.reset),
              },
            }
          )
        )
      }
    }

    let resolvedCaseId = processingResult.caseId || sessionInfo.activeCaseId || activeCaseId || null
    let caseContextData = null
    if (resolvedCaseId) {
      caseContextData = await chatManager.getCaseData(resolvedCaseId)
    }
    if (resolvedCaseId && !caseContextData) {
      resolvedCaseId = null
    }

    const memoryKey = buildMemoryKey(authUserId, guestId, resolvedCaseId || null, activeConversationId)
    const initialFacts = extractKeyFactsFromMessage(message)
    const { data: incrementedTurnCount, error: incrementTurnError } = await supabaseAdmin.rpc(
      'increment_chat_memory_turn_count',
      {
        p_memory_key: memoryKey,
        p_user_id: authUserId || null,
        p_guest_id: guestId || null,
        p_case_id: resolvedCaseId || null,
        p_conversation_id: activeConversationId,
        p_last_intent: processingResult.task,
        p_memory_summary: truncateText(`User: ${message}`, 320),
        p_key_facts: initialFacts,
        p_open_questions: [],
      }
    )
    if (incrementTurnError) {
      console.warn('Failed to increment chat memory turn count:', incrementTurnError)
    }

    const { data: memoryRow } = await supabaseAdmin
      .from('chat_memory')
      .select('memory_summary,key_facts,open_questions,user_turn_count')
      .eq('memory_key', memoryKey)
      .maybeSingle()
    const threadUserTurnCount =
      typeof incrementedTurnCount === 'number' && Number.isFinite(incrementedTurnCount)
        ? Math.max(1, incrementedTurnCount)
        : typeof memoryRow?.user_turn_count === 'number' && Number.isFinite(memoryRow.user_turn_count)
          ? Math.max(1, memoryRow.user_turn_count)
          : 1
    if (threadUserTurnCount >= threadTurnLimit) {
      return withCookie(
        NextResponse.json(
          buildAssistantResponsePayload(
            `This chat has reached the thread limit (${threadTurnLimit} user turns). ` +
              'Please start a new chat so responses stay accurate and fast.',
            {
              threadLimitReached: true,
              threadUserTurnCount,
              threadTurnLimit,
              activeCaseId: processingResult.caseId || sessionInfo.activeCaseId || null,
              conversationId: activeConversationId,
              suggestNewChat: true,
              task: processingResult.task,
              contextType: processingResult.contextType,
              urgency: processingResult.urgency,
            }
          ),
          { status: 200 }
        )
      )
    }
    const relatedThreadMemory = await loadRelatedThreadMemory({
      authUserId: authUserId || null,
      guestId,
      caseId: resolvedCaseId,
      excludeConversationId: activeConversationId,
    })
    let effectiveMemoryRow = memoryRow
    let relatedThreadMemoryUsed = false
    if (!hasUsefulMemory(effectiveMemoryRow) && hasUsefulMemory(relatedThreadMemory)) {
      effectiveMemoryRow = relatedThreadMemory
      relatedThreadMemoryUsed = true
    }
    const relatedThreadMemoryContext =
      hasUsefulMemory(relatedThreadMemory) &&
      (
        relatedThreadMemoryUsed ||
        relatedThreadMemory?.sameCaseMatch ||
        effectiveConversationHistory.length <= 8
      )
        ? buildMemoryContext(
            relatedThreadMemory,
            relatedThreadMemory?.sameCaseMatch
              ? 'Relevant earlier thread memory for this case'
              : 'Relevant earlier thread memory'
          )
        : ''

    const followUpQuestion = inferFollowUpQuestion(processingResult.task, message)
    const shouldShortCircuitToQuestion = Boolean(
      followUpQuestion &&
      !hasAttachments &&
      effectiveConversationHistory.length <= 1 &&
      !relatedThreadMemoryContext
    )

    if (shouldShortCircuitToQuestion) {
      const clarificationQuestion = followUpQuestion || 'Can you clarify the main point you need help with?'
      const mergedFacts = mergeFacts(effectiveMemoryRow?.key_facts, initialFacts)
      await supabaseAdmin.from('chat_memory').upsert(
        {
          memory_key: memoryKey,
          user_id: authUserId || null,
          guest_id: guestId || null,
          case_id: resolvedCaseId || null,
          conversation_id: activeConversationId,
          memory_summary: truncateText(`User asked: ${message}`, 320),
          key_facts: mergedFacts,
          open_questions: [clarificationQuestion],
          last_intent: processingResult.task,
        },
        { onConflict: 'memory_key' }
      )

      return withCookie(
        NextResponse.json(
          buildAssistantResponsePayload(clarificationQuestion, {
            followUpQuestion: clarificationQuestion,
            requiresClarification: true,
            caseProcessing: processingResult,
            activeCaseId: resolvedCaseId,
            task: processingResult.task,
            contextType: processingResult.contextType,
            urgency: processingResult.urgency,
          }),
          { status: 200 }
        )
      )
    }

    const caseContext = caseContextData ? buildCaseContext(caseContextData) : ''
    const caseKeywords = caseContextData ? extractCaseKeywords(caseContextData) : ''
    const premiumOpenAiModel = getPremiumOpenAiModel()
    const premiumOpenAiFallbackModel = getPremiumOpenAiFallbackModel(premiumOpenAiModel)
    const premiumPlusAnthropicModel = premiumPlusActive ? getPremiumPlusAnthropicModel() : null
    const premiumPlusAnthropicFallbackModel = premiumPlusAnthropicModel
      ? getPremiumPlusAnthropicFallbackModel(premiumPlusAnthropicModel)
      : null
    const premiumPlusOpenAiFallbackModel = getPremiumPlusOpenAiFallbackModel()
    const caseLawSuggestionDecision = evaluateCaseLawSuggestionNeed({
      message,
      history: effectiveConversationHistory,
      task: processingResult.task,
      hasAttachments,
    })
    const retrievalFocusDecision = evaluateRetrievalFocus({
      message,
      history: effectiveConversationHistory,
      task: processingResult.task,
      hasAttachments,
      caseContextData,
    })
    const baselineCaseLawQuery = buildCaseLawSuggestionQuery({
      message,
      history: effectiveConversationHistory,
      caseContextData,
      memoryRow,
    })
    const premiumSearchRoutingConfidence: number | null = null
    const premiumSearchRoutingReasons: string[] = premiumPlanActive && !premiumPlusActive
      ? ['premium-agent-autonomous-search-decision']
      : []
    const premiumPlusDirectAnswer = premiumPlusActive
      ? shouldUsePremiumPlusDirectAnswer({
          message,
          history: effectiveConversationHistory,
          task: processingResult.task,
          hasAttachments,
          retrievalFocusDecision,
        })
      : false
    let retrievalFocusApplied: AppliedRetrievalFocus = premiumPlusDirectAnswer ? 'direct' : retrievalFocusDecision.focus
    let generatedWebQuery = ''
    let generatedVectorQuery = ''
    let premiumPlusTools: PremiumPlusToolSelection[] = []
    let premiumPlusSearchMode: LegalSearchMode | null = null
    let routingReasonsApplied: string[] = retrievalFocusDecision.reasons.slice()
    if (premiumPlusActive) {
      premiumPlusSearchMode = premiumPlusDirectAnswer
        ? null
        : resolvePremiumPlusSearchMode({
            message,
            task: processingResult.task,
            hasAttachments,
            retrievalFocusDecision,
          })
      generatedWebQuery = premiumPlusSearchMode
        ? buildPremiumPlusHeuristicWebQuery({
            message,
            searchMode: premiumPlusSearchMode,
          })
        : ''
      routingReasonsApplied = [
        ...routingReasonsApplied,
        premiumPlusDirectAnswer ? 'single-pass-direct' : `single-pass-${retrievalFocusApplied}`,
      ]
    }
    const premiumPlusCaseLawBaseDecision = shouldUseCaseLawRetrieval({
      message,
      task: processingResult.task,
      hasAttachments,
      premiumFlow: premiumPlusActive,
      suggestionDecision: caseLawSuggestionDecision,
    })
    let shouldUsePremiumPlusCaseLawRetrieval =
      premiumPlusActive &&
      (
        premiumPlusCaseLawBaseDecision &&
        shouldUsePremiumPlusCaseLawHeuristically({
          message,
          history: effectiveConversationHistory,
          task: processingResult.task,
          hasAttachments,
          retrievalFocusApplied,
          retrievalFocusDecision,
          suggestionDecision: caseLawSuggestionDecision,
        })
      )

    if (premiumPlusActive && retrievalFocusApplied === 'hybrid' && !shouldUsePremiumPlusCaseLawRetrieval) {
      retrievalFocusApplied = 'web_only'
      routingReasonsApplied = [...routingReasonsApplied, 'latency-optimized-web-only']
    }
    if (premiumPlusActive && retrievalFocusApplied === 'vector_only' && !shouldUsePremiumPlusCaseLawRetrieval) {
      retrievalFocusApplied = 'web_only'
      routingReasonsApplied = [...routingReasonsApplied, 'vector-fallback-web-only']
    }

    generatedVectorQuery =
      shouldUsePremiumPlusCaseLawRetrieval
        ? (generatedVectorQuery || baselineCaseLawQuery)
        : ''

    const premiumPlusNeedsCaseLawSuggestions =
      premiumPlusActive &&
      shouldUsePremiumPlusCaseLawRetrieval &&
      caseLawSuggestionDecision.shouldSuggest
    const premiumPlusNeedsCaseLawRag =
      premiumPlusActive &&
      shouldUsePremiumPlusCaseLawRetrieval &&
      true
    premiumPlusTools = premiumPlusActive
      ? buildHeuristicPremiumPlusTools({
          retrievalFocusApplied,
          searchMode: premiumPlusSearchMode,
          webQuery: generatedWebQuery || undefined,
          vectorQuery: generatedVectorQuery || undefined,
          useCaseLawSuggestions: premiumPlusNeedsCaseLawSuggestions,
          useCaseLawRag: premiumPlusNeedsCaseLawRag,
        })
      : premiumPlusTools
    const retrievalRoutingSource: 'heuristic' = 'heuristic'
    const premiumSearchRoutingSource: 'agent_auto' = 'agent_auto'
    const premiumPlusNeedsWebRetrieval =
      premiumPlusActive &&
      hasPremiumPlusWebSearchTool(premiumPlusTools)

    const premiumShouldUseSearchRetrieval =
      premiumPlanActive
    let shouldUseSearchRetrieval =
      premiumShouldUseSearchRetrieval ||
      premiumPlusNeedsWebRetrieval
    let usePremiumPlusVectorRag =
      premiumPlusActive &&
      premiumPlusNeedsCaseLawRag &&
      !hasAttachments
    const shouldLookupCaseLawSuggestions =
      premiumPlusActive &&
      premiumPlusNeedsCaseLawSuggestions

    const caseLawSuggestions: CaseLawSuggestion[] = []
    const vectorCaseLawRagItems: VectorCaseLawRagItem[] = []
    const vectorOnlyRequested = premiumPlusActive && retrievalFocusApplied === 'vector_only'
    const vectorFallbackToWeb =
      vectorOnlyRequested &&
      usePremiumPlusVectorRag &&
      vectorCaseLawRagItems.length === 0
    if (vectorFallbackToWeb) {
      shouldUseSearchRetrieval = true
    }
    const vectorCaseLawRagContext = buildVectorCaseLawRagContext(vectorCaseLawRagItems)
    const caseLawSuggestionContext = buildCaseLawSuggestionContext(caseLawSuggestions)
    const ownCaseFacts = retrievalFocusDecision.ownCaseNarrative
      ? extractKeyFactsFromMessage(message).slice(0, 6)
      : []
    const ownCaseFactsContext = ownCaseFacts.length > 0
      ? `\n\nUser facts for issue spotting:\n${ownCaseFacts.map((fact) => `- ${fact}`).join('\n')}`
      : ''

    const rawMessageForAgent = attachmentContext
      ? `${message}${ownCaseFactsContext}\n\nThe user uploaded documents. Use the excerpts below in your analysis.${caseContext}${caseLawSuggestionContext}${vectorCaseLawRagContext}\n${attachmentContext}`
      : `${message}${ownCaseFactsContext}${caseContext}${caseLawSuggestionContext}${vectorCaseLawRagContext}${attachmentMetadata}`

    const messageForAgent = truncateText(rawMessageForAgent, 12000)
    const threadId = `thread_${Date.now()}_${userId}`

    const shouldUseBasicLegalAgent = basicPlanActive
    const shouldUsePremiumPlusLegalAgent = premiumPlusActive && !shouldUseBasicLegalAgent
    const invokePremiumPlusWithOpenAiFallback = async (): Promise<AgentResponse> => {
      const anthropicApiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
      if (!anthropicApiKey) {
        console.warn(`Premium+ Anthropic API key missing; falling back to OpenAI ${premiumPlusOpenAiFallbackModel}.`)
        return invokePremiumPlusLegalAgent(
          messageForAgent,
          threadId,
          userId,
          effectiveConversationHistory,
          caseKeywords,
          {
            memoryContext: relatedThreadMemoryContext || undefined,
            autoDecideSearch: true,
            searchEngineOverride: 'perplexity',
            openaiFallbackModel: premiumPlusOpenAiFallbackModel,
            forceOpenAiFallback: true,
            historyLimit: agentHistoryLimit,
          }
        )
      }

      try {
        return await invokePremiumPlusLegalAgent(
          messageForAgent,
          threadId,
          userId,
          effectiveConversationHistory,
          caseKeywords,
          {
            memoryContext: relatedThreadMemoryContext || undefined,
            autoDecideSearch: true,
            anthropicModel: premiumPlusAnthropicModel || undefined,
            anthropicFallbackModel: premiumPlusAnthropicFallbackModel || undefined,
            historyLimit: agentHistoryLimit,
          }
        )
      } catch (error) {
        console.error(`Premium+ Anthropic invocation failed; falling back to OpenAI ${premiumPlusOpenAiFallbackModel}.`, error)
        return invokePremiumPlusLegalAgent(
          messageForAgent,
          threadId,
          userId,
          effectiveConversationHistory,
          caseKeywords,
          {
            memoryContext: relatedThreadMemoryContext || undefined,
            autoDecideSearch: true,
            searchEngineOverride: 'perplexity',
            openaiFallbackModel: premiumPlusOpenAiFallbackModel,
            forceOpenAiFallback: true,
            historyLimit: agentHistoryLimit,
          }
        )
      }
    }

    const invokePremiumPlusStreamWithOpenAiFallback = async (
      onStatus: (status: string) => void,
      onToken: (chunk: string) => void
    ): Promise<AgentResponse> => {
      let emittedDelta = false
      const anthropicApiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
      if (!anthropicApiKey) {
        console.warn(`Premium+ Anthropic API key missing; using OpenAI ${premiumPlusOpenAiFallbackModel} stream fallback.`)
        return invokePremiumPlusLegalAgentStream(
          messageForAgent,
          threadId,
          userId,
          effectiveConversationHistory,
          caseKeywords,
          {
            memoryContext: relatedThreadMemoryContext || undefined,
            autoDecideSearch: true,
            searchEngineOverride: 'perplexity',
            openaiFallbackModel: premiumPlusOpenAiFallbackModel,
            forceOpenAiFallback: true,
            historyLimit: agentHistoryLimit,
            onStatus,
            onToken: (chunk) => {
              if (chunk) onToken(chunk)
            },
          }
        )
      }

      try {
        return await invokePremiumPlusLegalAgentStream(
          messageForAgent,
          threadId,
          userId,
          effectiveConversationHistory,
          caseKeywords,
          {
            memoryContext: relatedThreadMemoryContext || undefined,
            autoDecideSearch: true,
            searchEngineOverride: 'perplexity',
            anthropicModel: premiumPlusAnthropicModel || undefined,
            anthropicFallbackModel: premiumPlusAnthropicFallbackModel || undefined,
            historyLimit: agentHistoryLimit,
            onStatus,
            onToken: (chunk) => {
              if (!chunk) return
              emittedDelta = true
              onToken(chunk)
            },
          }
        )
      } catch (error) {
        if (emittedDelta) throw error
        console.error(`Premium+ Anthropic streaming failed; falling back to OpenAI ${premiumPlusOpenAiFallbackModel} stream.`, error)
        return invokePremiumPlusLegalAgentStream(
          messageForAgent,
          threadId,
          userId,
          effectiveConversationHistory,
          caseKeywords,
          {
            memoryContext: relatedThreadMemoryContext || undefined,
            autoDecideSearch: true,
            searchEngineOverride: 'perplexity',
            openaiFallbackModel: premiumPlusOpenAiFallbackModel,
            forceOpenAiFallback: true,
            historyLimit: agentHistoryLimit,
            onStatus,
            onToken: (chunk) => {
              if (chunk) onToken(chunk)
            },
          }
        )
      }
    }

    const finalizeAgentResponse = async (agentResponse: AgentResponse) => {
      const includeDebug = process.env.NODE_ENV !== 'production'
      const sourceCount = Array.isArray(agentResponse.sources) ? agentResponse.sources.length : 0
      const hasInlineCitationTags = /\[\d+\]/.test(agentResponse.response || '')

      if (!agentResponse.response || !agentResponse.response.trim()) {
        return buildAssistantResponsePayload('I had trouble generating a response. Please try again in a moment.', {
          emptyResponse: true,
        })
      }

      const caseLawSuggestionShouldOffer = shouldLookupCaseLawSuggestions
      const caseLawSoftNextStep = buildCaseLawSoftNextStep({
        shouldSuggest: caseLawSuggestionShouldOffer,
        suggestions: caseLawSuggestions,
        existingResponse: agentResponse.response || '',
      })
      const responseWithSoftStep = caseLawSoftNextStep
        ? `${agentResponse.response.trim()}\n\n${caseLawSoftNextStep}`
        : agentResponse.response
      const allowedAuthorityTokens = buildAllowedAuthorityTokens(
        vectorCaseLawRagItems,
        caseLawSuggestions,
        agentResponse.verifiedAuthorities || []
      )
      const scrubbedCaseLaw = premiumPlusActive
        ? scrubUnsupportedCaseLawClaims(responseWithSoftStep || '', allowedAuthorityTokens)
        : { text: responseWithSoftStep || '', removedCount: 0 }
      const finalAssistantResponse = neutralizeLegalAdviceTone(scrubbedCaseLaw.text || '')
      const removedUnsupportedAuthorityLines = scrubbedCaseLaw.removedCount
      const actionItems = extractActionItems(`${message}\n${finalAssistantResponse}`)
      if (actionItems.length > 0) {
        const rows = actionItems.map((item) => ({
          memory_key: memoryKey,
          user_id: authUserId || null,
          guest_id: guestId || null,
          case_id: resolvedCaseId || null,
          conversation_id: sessionInfo.conversationId || safeConversationId || null,
          title: item.title,
          due_date: item.dueDate,
          status: 'pending',
          source_text: truncateText(message, 400),
        }))
        await supabaseAdmin.from('chat_action_items').insert(rows)
      }

      const mergedFacts = mergeFacts(effectiveMemoryRow?.key_facts, initialFacts)
      await supabaseAdmin.from('chat_memory').upsert(
        {
          memory_key: memoryKey,
          user_id: authUserId || null,
          guest_id: guestId || null,
          case_id: resolvedCaseId || null,
          conversation_id: activeConversationId,
          memory_summary: truncateText(`User: ${message} | Assistant: ${finalAssistantResponse}`, 480),
          key_facts: mergedFacts,
          open_questions: [],
          last_intent: processingResult.task,
        },
        { onConflict: 'memory_key' }
      )

      if (chatManager.shouldPersistMessages()) {
        await chatManager.storeRawMessage(
          finalAssistantResponse,
          'assistant',
          stripAssistantPresentationMetadata({
            autoGenerated: true,
            type: 'legal_agent_response',
            caseId: processingResult.caseId || null,
            sources: agentResponse.sources || [],
            caseLawExplanationStyle: caseLawSuggestionDecision.explanationStyle,
            caseLawSoftNextStep,
            actionItems,
          }) || {},
          processingResult.caseId || sessionInfo.activeCaseId || null
        )
      }

      return buildAssistantResponsePayload(finalAssistantResponse, {
        guidanceProvided: agentResponse.guidance_provided,
        nextSteps: agentResponse.next_steps,
        sources: agentResponse.sources || [],
        caseLawExplanationStyle: caseLawSuggestionDecision.explanationStyle,
        caseLawSoftNextStep,
        caseProcessing: processingResult,
        activeCaseId: processingResult.caseId || sessionInfo.activeCaseId,
        pendingCalendarEntries: (processingResult as any).pendingCalendarEntries || null,
        task: processingResult.task,
        contextType: processingResult.contextType,
        urgency: processingResult.urgency,
        followUpQuestion,
        actionItems,
        ...(includeDebug
            ? {
              debug: {
                premiumFlow: !shouldUseBasicLegalAgent,
                basicPlanFlow: basicPlanActive,
                premiumPlanFlow: premiumPlanActive,
                premiumPlusFlow: premiumPlusActive,
                planAgent: shouldUseBasicLegalAgent
                  ? 'basic'
                  : (shouldUsePremiumPlusLegalAgent ? 'premium_plus' : 'premium'),
                planLabel: activePlanLabel || 'none',
                sourceCount,
                hasInlineCitationTags,
                citationMode: premiumPlusActive
                  ? (shouldUseSearchRetrieval ? 'search+citations' : 'direct-no-search')
                  : (premiumPlanActive
                      ? (shouldUseSearchRetrieval ? 'search-no-citations' : 'direct-no-search')
                      : 'basic-no-search'),
                retrievalEnabled: shouldUseSearchRetrieval,
                premiumSearchRoutingSource,
                premiumSearchRoutingUsed: premiumPlanActive && !premiumPlusActive,
                premiumSearchRoutingConfidence,
                premiumSearchRoutingReasons,
                premiumSearchModeApplied: premiumPlanActive && !premiumPlusActive ? 'web' : 'n/a',
                premiumSearchQuery: null,
                premiumPlusCaseLawRetrievalEnabled: shouldUsePremiumPlusCaseLawRetrieval,
                vectorCaseLawRagEnabled: usePremiumPlusVectorRag,
                vectorCaseLawRagCount: vectorCaseLawRagItems.length,
                caseLawSuggestionTriggered: shouldLookupCaseLawSuggestions,
                caseLawSuggestionCount: caseLawSuggestions.length,
                caseLawSuggestionScore: caseLawSuggestionDecision.score,
                caseLawSuggestionReasons: caseLawSuggestionDecision.reasons,
                caseLawSuggestionThreshold: CASELAW_SUGGESTION_MIN_TRIGGER_SCORE,
                caseLawRetrievalThreshold: CASELAW_RETRIEVAL_MIN_SCORE,
                caseLawExplanationStyle: caseLawSuggestionDecision.explanationStyle,
                retrievalFocus: retrievalFocusDecision.focus,
                retrievalFocusApplied,
                retrievalRoutingSource,
                premiumPlusTools: premiumPlusTools.map((item) => item.tool),
                premiumPlusSearchMode,
                premiumPlusWebQuery: generatedWebQuery || null,
                premiumPlusVectorQuery: generatedVectorQuery || null,
                retrievalOwnCaseNarrative: retrievalFocusDecision.ownCaseNarrative,
                retrievalPrecedentScore: retrievalFocusDecision.precedentScore,
                retrievalProcedureScore: retrievalFocusDecision.procedureScore,
                retrievalReasons: routingReasonsApplied,
                removedUnsupportedAuthorityLines,
                relatedThreadMemoryUsed,
                relatedThreadMemoryContextUsed: Boolean(relatedThreadMemoryContext),
                relatedThreadMemoryConversationCount: relatedThreadMemory?.conversationCount || 0,
                relatedThreadMemorySameCaseMatch: relatedThreadMemory?.sameCaseMatch || false,
                vectorFallbackToWeb,
              },
            }
          : {}),
      })
    }

    const shouldStreamResponse = request.headers.get('x-mymckenzie-stream') === '1'
    const shouldStreamPremium = premiumPlanActive && !premiumPlusActive && !shouldUseBasicLegalAgent && shouldStreamResponse
    const shouldStreamPremiumPlus =
      shouldUsePremiumPlusLegalAgent &&
      shouldStreamResponse

    if (shouldStreamPremium || shouldStreamPremiumPlus) {
      const encoder = new TextEncoder()
      const streamHeaders = new Headers({
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          const sendEvent = (event: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
          }

          try {
            sendEvent({ type: 'start' })
            const agentResponse = shouldStreamPremium
              ? await invokePremiumLegalAgentStream(
                  messageForAgent,
                  threadId,
                  userId,
                  effectiveConversationHistory,
                  caseKeywords,
                  {
                    memoryContext: relatedThreadMemoryContext || undefined,
                    autoDecideSearch: true,
                    searchEngineOverride: 'brave',
                    openaiModel: premiumOpenAiModel,
                    openaiFallbackModel: premiumOpenAiFallbackModel,
                    historyLimit: agentHistoryLimit,
                    onStatus: (status) => {
                      if (status) sendEvent({ type: 'status', message: status })
                    },
                    onToken: (chunk) => {
                      if (chunk) sendEvent({ type: 'delta', delta: chunk })
                    },
                  }
                )
              : await invokePremiumPlusStreamWithOpenAiFallback(
                  (status) => {
                    if (status) sendEvent({ type: 'status', message: status })
                  },
                  (chunk) => {
                    if (chunk) sendEvent({ type: 'delta', delta: chunk })
                  }
                )
            const payload = await finalizeAgentResponse(agentResponse)
            sendEvent({ type: 'done', payload })
          } catch (error: any) {
            console.error(shouldStreamPremium ? 'Premium streaming failed:' : 'Premium+ streaming failed:', error)
            sendEvent({
              type: 'error',
              message: sanitizeChatErrorMessage(error),
            })
          } finally {
            controller.close()
          }
        },
      })

      return new Response(stream, { status: 200, headers: streamHeaders })
    }

    const agentResponse: AgentResponse = shouldUseBasicLegalAgent
      ? await invokeBasicLegalAgent(messageForAgent, threadId, userId, effectiveConversationHistory, caseKeywords, {
          memoryContext: relatedThreadMemoryContext || undefined,
          historyLimit: agentHistoryLimit,
        })
      : shouldUsePremiumPlusLegalAgent
        ? await invokePremiumPlusWithOpenAiFallback()
        : await invokePremiumLegalAgent(messageForAgent, threadId, userId, effectiveConversationHistory, caseKeywords, {
            memoryContext: relatedThreadMemoryContext || undefined,
            autoDecideSearch: true,
            searchEngineOverride: 'brave',
            openaiModel: premiumOpenAiModel,
            openaiFallbackModel: premiumOpenAiFallbackModel,
            historyLimit: agentHistoryLimit,
          })

    const payload = await finalizeAgentResponse(agentResponse)

    return withCookie(
      NextResponse.json(payload, { status: 200 })
    )
  } catch (error: any) {
    await captureServerException(error, {
      component: 'chat',
      route: '/api/chat',
      method: request.method,
      userId: authUserId || null,
      url: request.url,
    })

    if (error?.message?.includes('rate limit') || error?.status === 429) {
      return NextResponse.json(
        buildAssistantResponsePayload("⚠️ I'm experiencing high demand right now. Please try again in a moment."),
        { status: 200 }
      )
    }

    return NextResponse.json(
      buildAssistantResponsePayload(
        sanitizeChatErrorMessage(error) === 'MyMcKenzieCS is unavailable to help right now. Please try again later.'
          ? 'I apologize, but I encountered an error. Please try again or rephrase your question.'
          : sanitizeChatErrorMessage(error),
        undefined,
        { message: sanitizeChatErrorMessage(error) || 'Chat failed' }
      ),
      { status: 500 }
    )
  }
}
