import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { createRequire } from 'module'
import { invokeBasicLegalAgent, invokeLegalAgent } from '@/lib/ai/agents/legal-agent'
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
import { searchByText } from '@/lib/vector/milvus'
import { getUserPlanData } from '@/lib/payments/user-plan'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

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

const nodeRequire = createRequire(import.meta.url)
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const getPremiumPlusOpenAiModel = (): string | null => {
  const model = (process.env.OPENAI_PREMIUM_PLUS_MODEL || '').trim()
  return model.length > 0 ? model : null
}

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

const getExtension = (name?: string) => {
  if (!name) return ''
  const ext = name.split('.').pop()?.toLowerCase()
  return ext || ''
}

const extractTextFromBuffer = async (buffer: Buffer, name?: string, mimeType?: string | null) => {
  const ext = getExtension(name)
  const typeHint = mimeType?.toLowerCase() || ''

  if (typeHint.includes('pdf') || ext === 'pdf') {
    try {
      const pdfParseModule = nodeRequire('pdf-parse')
      const parse = pdfParseModule?.default ?? pdfParseModule
      const parsed = await parse(buffer)
      return parsed.text || ''
    } catch {
      return ''
    }
  }

  if (typeHint.includes('word') || ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value || ''
  }

  if (typeHint.startsWith('text/') || ['txt', 'md', 'rtf'].includes(ext)) {
    return buffer.toString('utf-8')
  }

  return ''
}

const buildAttachmentContext = async (attachments: ChatAttachment[], baseUrl: string, cookieHeader?: string | null) => {
  if (!attachments.length) return ''
  const sections: string[] = []
  let totalLength = 0

  for (const attachment of attachments) {
    const name = attachment.name || 'Untitled document'
    if (!attachment.downloadURL) {
      sections.push(`Document: ${name}\n(No file content available)`)
      continue
    }

    try {
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
      const arrayBuffer = await response.arrayBuffer()
      const text = await extractTextFromBuffer(Buffer.from(arrayBuffer), name, attachment.mimeType)
      const cleaned = text.replace(/\s+/g, ' ').trim()
      const excerpt = cleaned ? cleaned.slice(0, 2500) : '(No extractable text)'
      const section = `Document: ${name}\n${excerpt}`
      sections.push(section)
      totalLength += section.length
      if (totalLength >= 3500) break
    } catch {
      sections.push(`Document: ${name}\n(Failed to read file content)`)
    }
  }

  if (!sections.length) return ''
  return `\n\nAttachment excerpts:\n${sections.join('\n\n')}`
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
const CASELAW_VECTOR_RETRIEVAL_TOPK = Math.max(
  8,
  Number.parseInt(process.env.CASELAW_VECTOR_RETRIEVAL_TOPK || '', 10) || 24
)
const CASELAW_SUGGESTION_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.CASELAW_SUGGESTION_LIMIT || '', 10) || 3
)
const CASELAW_RAG_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.CASELAW_RAG_LIMIT || '', 10) || 4
)
const CASELAW_MIN_LEXICAL_SCORE = Math.max(
  0,
  Math.min(1, Number.parseFloat(process.env.CASELAW_MIN_LEXICAL_SCORE || '0.08'))
)
const CASELAW_MIN_COMBINED_SCORE = Math.max(
  0,
  Math.min(1, Number.parseFloat(process.env.CASELAW_MIN_COMBINED_SCORE || '0.24'))
)
const CASELAW_MIN_SIMILARITY = Number.parseFloat(process.env.CASELAW_MIN_SIMILARITY || '-1')

const CASELAW_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'what', 'when', 'where', 'which', 'about',
  'into', 'under', 'over', 'your', 'their', 'them', 'they', 'were', 'been', 'will', 'would', 'could',
  'should', 'there', 'here', 'then', 'than', 'because', 'while', 'also', 'just', 'does', 'did', 'dont',
  'cant', 'onto', 'between', 'after', 'before', 'against', 'through', 'about', 'case', 'court'
])

const tokenizeCaseLawText = (value: string): string[] => {
  return normalizeCompactText((value || '').toLowerCase())
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !CASELAW_STOPWORDS.has(token))
}

const lexicalOverlapScore = (queryTokens: Set<string>, candidateText: string): number => {
  if (!queryTokens.size) return 0
  const candidateTokens = new Set(tokenizeCaseLawText(candidateText))
  if (!candidateTokens.size) return 0

  let overlap = 0
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) overlap += 1
  }

  const denominator = Math.max(1, Math.min(queryTokens.size, 10))
  return overlap / denominator
}

const normalizeSimilarityScore = (raw: number): number => {
  if (!Number.isFinite(raw)) return 0
  if (raw <= 0) return 0
  if (raw <= 1) return raw
  // Handle high-magnitude ranking scores without overpowering lexical signal.
  return Math.min(1, raw / 100)
}

type RankedCaseLawItem = {
  citation: string
  title: string
  summary?: string
  extracts?: string
  url?: string
  similarity?: number
}

const rankCaseLawCandidates = <T extends RankedCaseLawItem>(query: string, items: T[], limit: number): T[] => {
  if (!items.length) return []
  const queryTokens = new Set(tokenizeCaseLawText(query))
  const explicitAuthorityRequest =
    /\b(case law|precedent|authority|citation|neutral citation|judgment|court of appeal|supreme court|uksc|ewca|ewhc|cpr part|civil procedure rules|practice direction|section\s+\d+|article\s+\d+|act\s+\d{4})\b/i.test(
      query
    )

  const ranked = items
    .slice()
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .map((item, index, arr) => {
      const lexical = lexicalOverlapScore(
        queryTokens,
        `${item.title} ${item.citation} ${item.summary || ''} ${item.extracts || ''}`.trim()
      )
      const rankScore = 1 - index / Math.max(1, arr.length)
      const similarityScore = normalizeSimilarityScore(Number(item.similarity || 0))
      const combinedScore = lexical * 0.6 + rankScore * 0.25 + similarityScore * 0.15
      return { item, lexical, combinedScore }
    })

  const combinedThreshold = explicitAuthorityRequest
    ? CASELAW_MIN_COMBINED_SCORE * 0.7
    : CASELAW_MIN_COMBINED_SCORE

  const filtered = ranked.filter((entry) => {
    const similarityPass =
      !Number.isFinite(CASELAW_MIN_SIMILARITY) ||
      Number(entry.item.similarity || 0) >= CASELAW_MIN_SIMILARITY
    if (!similarityPass) return false
    if (entry.combinedScore < combinedThreshold) return false
    if (entry.lexical < CASELAW_MIN_LEXICAL_SCORE && !explicitAuthorityRequest) return false
    return true
  })

  const picked = (filtered.length > 0 ? filtered : ranked.slice(0, Math.min(limit, 2)))
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, limit)
    .map((entry) => entry.item)

  return picked
}

const shouldUseCaseLawRetrieval = ({
  message,
  intent,
  hasAttachments,
  premiumFlow,
  suggestionDecision,
}: {
  message: string
  intent?: string
  hasAttachments?: boolean
  premiumFlow: boolean
  suggestionDecision: { shouldSuggest: boolean; shouldRetrieve?: boolean }
}) => {
  if (!premiumFlow) return false
  if (hasAttachments) return false

  const text = normalizeCompactText(message.toLowerCase())
  if (!text) return false

  const explicitlyNonRetrievalIntents = new Set(['billing', 'calendar', 'document_review'])
  if (intent && explicitlyNonRetrievalIntents.has(intent)) {
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
  intent,
  hasAttachments,
}: {
  message: string
  history: Array<{ role: string; content: string }>
  intent?: string
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

  if (hasAttachments && intent === 'document_review') {
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

  const intentAllowList = new Set([
    'procedure',
    'case_law',
    'appeal',
    'enforcement',
    'evidence',
    'jurisdiction',
    'case_status',
    'negotiation',
  ])
  if (intent && intentAllowList.has(intent)) {
    score += 2
    reasons.push(`intent:${intent}`)
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

const mapCaseLawSuggestion = (row: any, index: number): CaseLawSuggestion | null => {
  if (!row || typeof row !== 'object') return null

  const title = firstDefinedString(row.title, row.case_name, row.name)
  if (!title) return null

  const citation = firstDefinedString(row.citation, row.neutralCitation, row.neutral_citation) || `Case ${index + 1}`
  const similarityRaw = Number(row.score ?? row.similarity_score ?? row.similarity ?? 0)
  const similarity = Number.isFinite(similarityRaw) ? similarityRaw : 0
  const url = firstDefinedString(row.url, row.link) || undefined
  const summary = firstDefinedString(row.summary, row.snippet, row.excerpt)
  const id =
    firstDefinedString(row.id) ||
    `${citation}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)

  return {
    id,
    citation,
    title,
    url,
    summary: summary || undefined,
    similarity,
  }
}

const fetchCaseLawSuggestions = async (query: string, limit: number = 3): Promise<CaseLawSuggestion[]> => {
  if (!query.trim()) return []
  if (!process.env.MILVUS_HOST) return []

  try {
    const rawResults = await searchByText(query, Math.max(CASELAW_VECTOR_RETRIEVAL_TOPK, limit * 3))
    if (!Array.isArray(rawResults) || rawResults.length === 0) return []

    const mapped = rawResults
      .map((row, index) => mapCaseLawSuggestion(row, index))
      .filter((row): row is CaseLawSuggestion => Boolean(row))

    if (mapped.length === 0) return []

    const deduped = new Map<string, CaseLawSuggestion>()
    for (const suggestion of mapped) {
      const key = `${suggestion.citation}|${suggestion.title}`.toLowerCase()
      const existing = deduped.get(key)
      if (!existing || (suggestion.similarity || 0) > (existing.similarity || 0)) {
        deduped.set(key, suggestion)
      }
    }

    return rankCaseLawCandidates(query, Array.from(deduped.values()), limit)
  } catch (error) {
    console.warn('Case law suggestion lookup failed:', error)
    return []
  }
}

const normalizeRagText = (value: any, maxLen: number): string => {
  if (typeof value !== 'string') return ''
  const compact = normalizeCompactText(value)
  if (!compact) return ''
  return compact.length > maxLen ? `${compact.slice(0, maxLen - 1)}…` : compact
}

const mapVectorCaseLawRagItem = (row: any): VectorCaseLawRagItem | null => {
  if (!row || typeof row !== 'object') return null

  const title = firstDefinedString(row.title, row.case_name, row.name)
  if (!title) return null

  const citation = firstDefinedString(row.citation, row.neutralCitation, row.neutral_citation) || 'Authority'
  const summary = normalizeRagText(row.summary, 420) || undefined
  const extracts = normalizeRagText(row.extracts, 900) || undefined
  const url = firstDefinedString(row.url, row.link) || undefined
  const similarityRaw = Number(row.score ?? row.similarity_score ?? row.similarity ?? 0)
  const similarity = Number.isFinite(similarityRaw) ? similarityRaw : undefined

  return { citation, title, summary, extracts, url, similarity }
}

const fetchPremiumPlusVectorCaseLawRag = async (query: string, limit: number = 4): Promise<VectorCaseLawRagItem[]> => {
  if (!query.trim()) return []
  if (!process.env.MILVUS_HOST) return []

  try {
    const rawResults = await searchByText(query, Math.max(CASELAW_VECTOR_RETRIEVAL_TOPK, limit * 3))
    if (!Array.isArray(rawResults) || rawResults.length === 0) return []

    const mapped = rawResults
      .map((row) => mapVectorCaseLawRagItem(row))
      .filter((row): row is VectorCaseLawRagItem => Boolean(row))

    if (mapped.length === 0) return []

    const deduped = new Map<string, VectorCaseLawRagItem>()
    for (const item of mapped) {
      const key = `${item.citation}|${item.title}`.toLowerCase()
      const existing = deduped.get(key)
      if (!existing || (item.similarity || 0) > (existing.similarity || 0)) {
        deduped.set(key, item)
      }
    }

    return rankCaseLawCandidates(query, Array.from(deduped.values()), limit)
  } catch (error) {
    console.warn('Premium+ vector case law RAG lookup failed:', error)
    return []
  }
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

const inferFollowUpQuestion = (intent: string, message: string) => {
  const text = message.toLowerCase()
  const hasDate = /\b\d{1,2}[/\-]\d{1,2}([/\-]\d{2,4})?\b|\b(today|tomorrow|next week|next month|monday|tuesday|wednesday|thursday|friday)\b/i.test(message)

  if (intent === 'calendar' && !hasDate) {
    return 'Could you share the exact deadline or hearing date so I can give guidance in the right order and timing?'
  }
  if (intent === 'evidence' && !/\b(document|email|letter|photo|screenshot|witness|statement)\b/.test(text)) {
    return 'What evidence do you currently have (for example emails, letters, screenshots, or witnesses)?'
  }
  if (intent === 'procedure' && !/\b(claim form|defence|hearing|judgment|order|appeal|n244|cpr)\b/.test(text)) {
    return 'Which stage are you at right now (for example pre-claim, claim filed, defence filed, or hearing listed)?'
  }
  return null
}

const shouldBypassLegalAgentForSupport = (intent: string, message: string): boolean => {
  const text = normalizeCompactText((message || '').toLowerCase())
  if (!text) return false

  if (intent === 'billing') return true

  return /\b(account|billing|invoice|subscription|plan|payment|card|refund|charge|login|log in|sign in|password|reset|support|help desk|technical issue|bug|error code|contact support)\b/.test(text)
}

const buildSupportIntentResponse = (isSignedIn: boolean): string => {
  if (isSignedIn) {
    return 'This looks like an account or billing request. Please use Settings for billing and account actions: /settings. For general help, use /help or /contact.'
  }
  return 'This looks like an account or billing request. Please sign in first at /auth/signin, then manage billing in /settings. You can also view plans at /pricing or get help at /help.'
}

const buildMemoryContext = (memory: any) => {
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
  return `\n\nConversation memory:\n${lines.join('\n')}`
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
        {
          response: 'Please sign in and choose a paid plan to use chat.',
          metadata: {
            signInRequired: true,
            upgradeRequired: true,
          },
        },
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

    const chatManager = new ChatManager(userId, activeCaseId, conversationId, authData?.user?.email || null)

    const sanitizedHistory = Array.isArray(history)
      ? history
          .filter((entry: any) => entry && typeof entry.role === 'string' && typeof entry.content === 'string')
          .map((entry: any) => ({
            role: entry.role === 'assistant' ? 'assistant' : 'user',
            content: truncateText(entry.content, 600),
          }))
          .slice(-6)
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
            {
              response: 'A paid plan is required to use chat. Please choose a plan to continue.',
              metadata: {
                upgradeRequired: true,
                activePlan: activePlanLabel || 'none',
                planStatus: String(planData?.planStatus || 'inactive').toLowerCase(),
              },
            },
            { status: 403 }
          )
        )
      }

    }

    const sessionInfo = await chatManager.initializeSession()
    if (sessionInfo.requiresCaseSelection) {
      return withCookie(
        NextResponse.json({
          requiresCaseSelection: true,
          cases: sessionInfo.cases,
          response:
            'I see you have multiple cases. Which case would you like to discuss?\n\n' +
            sessionInfo.cases
              .map((c: any, i: number) => `${i + 1}. ${c.caseType || 'Case'} - ${c.caseNumber || c.id}`)
              .join('\n'),
        })
      )
    }

    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const proto = request.headers.get('x-forwarded-proto') || 'http'
    const baseUrl = host ? `${proto}://${host}` : ''

    const hasAttachments = Array.isArray(attachments) && attachments.length > 0
    const cookieHeader = request.headers.get('cookie')
    const attachmentContext = hasAttachments && baseUrl ? await buildAttachmentContext(attachments, baseUrl, cookieHeader) : ''
    const attachmentMetadata = hasAttachments && !attachmentContext ? buildAttachmentMetadata(attachments) : ''

    const processingResult = await chatManager.processMessage(message, hasAttachments, {
      userAgent: request.headers.get('user-agent'),
      sessionMessageCount: typeof sessionMessageCount === 'number' ? sessionMessageCount : null,
      sessionStartedAt: typeof sessionStartedAt === 'string' ? sessionStartedAt : null,
    })

    if (shouldBypassLegalAgentForSupport(processingResult.intent, message)) {
      const supportResponse = buildSupportIntentResponse(Boolean(authUserId))
      const supportMetadata = {
        supportIntent: true,
        intent: processingResult.intent,
        activeCaseId: processingResult.caseId || sessionInfo.activeCaseId || null,
      }

      if (chatManager.shouldPersistMessages()) {
        await chatManager.storeRawMessage(
          supportResponse,
          'assistant',
          {
            autoGenerated: true,
            type: 'support_intent_response',
            supportIntent: true,
            intent: processingResult.intent,
          },
          processingResult.caseId || sessionInfo.activeCaseId || null
        )
      }

      return withCookie(
        NextResponse.json(
          {
            response: supportResponse,
            metadata: supportMetadata,
          },
          { status: 200 }
        )
      )
    }

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

    const memoryKey = buildMemoryKey(authUserId, guestId, resolvedCaseId || null, sessionInfo.conversationId || conversationId || null)
    const { data: memoryRow } = await supabaseAdmin
      .from('chat_memory')
      .select('memory_summary,key_facts,open_questions')
      .eq('memory_key', memoryKey)
      .maybeSingle()

    const followUpQuestion = inferFollowUpQuestion(processingResult.intent, message)
    const shouldShortCircuitToQuestion = Boolean(followUpQuestion && !hasAttachments && sanitizedHistory.length <= 1)

    if (shouldShortCircuitToQuestion) {
      const facts = extractKeyFactsFromMessage(message)
      const mergedFacts = mergeFacts(memoryRow?.key_facts, facts)
      await supabaseAdmin.from('chat_memory').upsert(
        {
          memory_key: memoryKey,
          user_id: authUserId || null,
          guest_id: guestId || null,
          case_id: resolvedCaseId || null,
          conversation_id: sessionInfo.conversationId || conversationId || null,
          memory_summary: truncateText(`User asked: ${message}`, 320),
          key_facts: mergedFacts,
          open_questions: [followUpQuestion],
          last_intent: processingResult.intent,
        },
        { onConflict: 'memory_key' }
      )

      return withCookie(
        NextResponse.json(
          {
            response: followUpQuestion,
            metadata: {
              followUpQuestion,
              requiresClarification: true,
              caseProcessing: processingResult,
              activeCaseId: resolvedCaseId,
            },
          },
          { status: 200 }
        )
      )
    }

    const caseContext = caseContextData ? buildCaseContext(caseContextData) : ''
    const caseKeywords = caseContextData ? extractCaseKeywords(caseContextData) : ''
    const memoryContext = buildMemoryContext(memoryRow)
    const caseLawSuggestionDecision = evaluateCaseLawSuggestionNeed({
      message,
      history: sanitizedHistory,
      intent: processingResult.intent,
      hasAttachments,
    })
    const shouldUsePremiumPlusCaseLawRetrieval = shouldUseCaseLawRetrieval({
      message,
      intent: processingResult.intent,
      hasAttachments,
      premiumFlow: premiumPlusActive,
      suggestionDecision: caseLawSuggestionDecision,
    })
    const shouldUseSearchRetrieval = premiumPlusActive || premiumPlanActive
    const usePremiumPlusVectorRag =
      premiumPlusActive &&
      shouldUsePremiumPlusCaseLawRetrieval &&
      !hasAttachments
    const shouldLookupCaseLawSuggestions =
      premiumPlusActive &&
      shouldUsePremiumPlusCaseLawRetrieval &&
      caseLawSuggestionDecision.shouldSuggest

    const caseLawQuery = buildCaseLawSuggestionQuery({
      message,
      history: sanitizedHistory,
      caseContextData,
      memoryRow,
    })

    const caseLawSuggestionPromise = shouldLookupCaseLawSuggestions
      ? fetchCaseLawSuggestions(caseLawQuery, CASELAW_SUGGESTION_LIMIT)
      : Promise.resolve([] as CaseLawSuggestion[])

    const vectorCaseLawRagPromise = usePremiumPlusVectorRag
      ? fetchPremiumPlusVectorCaseLawRag(caseLawQuery, CASELAW_RAG_LIMIT)
      : Promise.resolve([] as VectorCaseLawRagItem[])

    const vectorCaseLawRagItems = await vectorCaseLawRagPromise
    const vectorCaseLawRagContext = buildVectorCaseLawRagContext(vectorCaseLawRagItems)
    const caseLawStyleInstruction = premiumPlusActive
      ? shouldUsePremiumPlusCaseLawRetrieval
        ? '\n\nExplanation policy (Premium+): Start with a short plain-English answer first. Then add an "Authorities and interpretation" section with no more than 3 authorities, and explain each authority in one sentence.'
        : '\n\nExplanation policy (Premium+): Keep this response plain-English and practical. Do not add case authorities unless the user explicitly asks for authority or precedent.'
      : ''

    const rawMessageForAgent = attachmentContext
      ? `${message}\n\nThe user uploaded documents. Use the excerpts below in your analysis.${caseContext}${memoryContext}${vectorCaseLawRagContext}${caseLawStyleInstruction}\n${attachmentContext}`
      : `${message}${caseContext}${memoryContext}${vectorCaseLawRagContext}${caseLawStyleInstruction}${attachmentMetadata}`

    const messageForAgent = truncateText(rawMessageForAgent, 12000)
    const threadId = `thread_${Date.now()}_${userId}`

    const shouldUseBasicLegalAgent = basicPlanActive
    const premiumPlusOpenAiModel = premiumPlusActive ? getPremiumPlusOpenAiModel() : null
    if (premiumPlusActive && !premiumPlusOpenAiModel) {
      console.error('OPENAI_PREMIUM_PLUS_MODEL is missing for a Premium+ chat request')
      return withCookie(
        NextResponse.json(
          { response: 'Premium+ chat is temporarily unavailable. Please try again shortly.' },
          { status: 503 }
        )
      )
    }
    const agentResponse = shouldUseBasicLegalAgent
      ? await invokeBasicLegalAgent(messageForAgent, threadId, userId, sanitizedHistory, caseKeywords)
      : await invokeLegalAgent(messageForAgent, threadId, userId, sanitizedHistory, caseKeywords, {
          useDiscriminator: premiumPlusActive,
          useSearch: shouldUseSearchRetrieval,
          includeCitations: premiumPlusActive,
          openaiModel: premiumPlusOpenAiModel || undefined,
        })

    const includeDebug = process.env.NODE_ENV !== 'production'
    const sourceCount = Array.isArray(agentResponse.sources) ? agentResponse.sources.length : 0
    const hasInlineCitationTags = /\[\d+\]/.test(agentResponse.response || '')

    if (!agentResponse.response || !agentResponse.response.trim()) {
      return withCookie(
        NextResponse.json(
          {
            response: 'I had trouble generating a response. Please try again in a moment.',
            metadata: { emptyResponse: true },
          },
          { status: 200 }
        )
      )
    }

    const caseLawSuggestions = await caseLawSuggestionPromise
    const caseLawSoftNextStep = buildCaseLawSoftNextStep({
      shouldSuggest: caseLawSuggestionDecision.shouldSuggest,
      suggestions: caseLawSuggestions,
      existingResponse: agentResponse.response || '',
    })
    const finalAssistantResponse = caseLawSoftNextStep
      ? `${agentResponse.response.trim()}\n\n${caseLawSoftNextStep}`
      : agentResponse.response
    const actionItems = extractActionItems(`${message}\n${agentResponse.response}`)
    if (actionItems.length > 0) {
      const rows = actionItems.map((item) => ({
        memory_key: memoryKey,
        user_id: authUserId || null,
        guest_id: guestId || null,
        case_id: resolvedCaseId || null,
        conversation_id: sessionInfo.conversationId || conversationId || null,
        title: item.title,
        due_date: item.dueDate,
        status: 'pending',
        source_text: truncateText(message, 400),
      }))
      await supabaseAdmin.from('chat_action_items').insert(rows)
    }

    const incomingFacts = extractKeyFactsFromMessage(message)
    const mergedFacts = mergeFacts(memoryRow?.key_facts, incomingFacts)
    await supabaseAdmin.from('chat_memory').upsert(
      {
        memory_key: memoryKey,
        user_id: authUserId || null,
        guest_id: guestId || null,
        case_id: resolvedCaseId || null,
        conversation_id: sessionInfo.conversationId || conversationId || null,
        memory_summary: truncateText(`User: ${message} | Assistant: ${finalAssistantResponse}`, 480),
        key_facts: mergedFacts,
        open_questions: [],
        last_intent: processingResult.intent,
      },
      { onConflict: 'memory_key' }
    )

    if (chatManager.shouldPersistMessages()) {
      await chatManager.storeRawMessage(
        finalAssistantResponse,
        'assistant',
        {
          autoGenerated: true,
          type: 'legal_agent_response',
          caseId: processingResult.caseId || null,
          sources: agentResponse.sources || [],
          caseLawExplanationStyle: caseLawSuggestionDecision.explanationStyle,
          caseLawSoftNextStep,
          actionItems,
        },
        processingResult.caseId || sessionInfo.activeCaseId || null
      )
    }

    return withCookie(
      NextResponse.json(
        {
          response: finalAssistantResponse,
          metadata: {
            guidanceProvided: agentResponse.guidance_provided,
            nextSteps: agentResponse.next_steps,
            sources: agentResponse.sources || [],
            caseLawExplanationStyle: caseLawSuggestionDecision.explanationStyle,
            caseLawSoftNextStep,
            caseProcessing: processingResult,
            activeCaseId: processingResult.caseId || sessionInfo.activeCaseId,
            pendingCalendarEntries: (processingResult as any).pendingCalendarEntries || null,
            followUpQuestion,
            actionItems,
            ...(includeDebug
                ? {
                  debug: {
                    premiumFlow: !shouldUseBasicLegalAgent,
                    basicPlanFlow: basicPlanActive,
                    premiumPlanFlow: premiumPlanActive,
                    premiumPlusFlow: premiumPlusActive,
                    planLabel: activePlanLabel || 'none',
                    sourceCount,
                    hasInlineCitationTags,
                    citationMode: premiumPlusActive ? 'search+citations' : (premiumPlanActive ? 'search-no-citations' : 'basic-no-search'),
                    retrievalEnabled: shouldUseSearchRetrieval,
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
                  },
                }
              : {}),
          },
        },
        { status: 200 }
      )
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
        { response: "⚠️ I'm experiencing high demand right now. Please try again in a moment." },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        message: error?.message || 'Chat failed',
        response: 'I apologize, but I encountered an error. Please try again or rephrase your question.',
      },
      { status: 500 }
    )
  }
}
