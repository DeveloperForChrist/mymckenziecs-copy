// Import Claude (Anthropic) client for all LLM calls
import claudeLegalClient from '../providers/claude-legal-client';
import { logClaudeUsage } from '@/lib/utils/claude-usage';
import { supabaseAdmin } from '../../database/supabase-server';
import { DocGeneratorTool } from '../tools/doc-generator-tool';
import { SearchTool } from '../tools/search-tool';

// Simplified system prompt
const SYSTEM_PROMPT: string = `You are MymckenzieCS, a UK legal guide for people representing themselves in court.

CRITICAL:
- You are NOT a lawyer. You explain processes and procedures in plain English.
- ALWAYS ground your answer ONLY in the sources provided below.
- Cite sources using [1], [2], [3] format immediately after the relevant statement.
- Use plain text only: no markdown, no asterisks, no formatting.

TONE:
- Warm, reassuring, clear English.
- Use bullets (•) for lists.
- Break complex steps into manageable pieces.
- Ask clarifying questions rather than assume.

SOURCES:
If reliable sources are not available, say: "I don't have reliable sources for that. For critical decisions, check with official sources or a legal advisor."
`;

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-5-20251101'
const MAX_TOKENS = 550

// =====================================================
// SIMPLE HELPERS
// =====================================================

const AUTHORITATIVE_DOMAINS = [
  'legislation.gov.uk',
  'bailii.org',
  'gov.uk',
  'justice.gov.uk',
  'judiciary.uk',
  'nationalarchives.gov.uk'
]

const BLOCK_DOMAINS = [
  'reddit.com', 'old.reddit.com', 'forum', 'facebook.com', 'x.com',
  'twitter.com', 'tiktok.com', 'instagram.com', 'blog', 'medium.com'
]

type RetrievalMode = 'education' | 'general'

type SearchToolOutput = {
  sources: string[]
  packet: string
}

const safeJsonParse = <T,>(value: string): T | null => {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

// Check if domain is authoritative
function isDomainAuthoritative(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.replace('www.', '')
    return AUTHORITATIVE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith('.' + domain))
  } catch {
    return false
  }
}

// Filter to authoritative sources only
async function filterReachableUrls(urls: string[]): Promise<string[]> {
  if (!urls.length) return []
  return urls.filter((url) => isDomainAuthoritative(url))
}

// Simple search: one pass, no fallback
const simpleRetrieval = async (
  searchTool: SearchTool,
  query: string,
  mode: RetrievalMode,
): Promise<{ packet: string; sources: string[] }> => {
  const payload = JSON.stringify({ query, mode })
  const raw = await searchTool._call(payload)
  const parsed = safeJsonParse<SearchToolOutput>(raw)
  
  if (!parsed) return { packet: '', sources: [] }
  
  const sources = Array.isArray(parsed.sources) ? parsed.sources.filter((u) => typeof u === 'string') : []
  const packet = typeof parsed.packet === 'string' ? parsed.packet : ''
  
  return { packet, sources }
}

// Build search query from history
function buildSearchQuery(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  latestQuestion: string,
  caseKeywords?: string
): string {
  const recentMessages = history
    .filter(e => e.role === 'user')
    .map(e => e.content.trim())
    .filter(Boolean)
    .slice(-5)

  const caseContext = caseKeywords ? `Context: ${caseKeywords} | ` : ''
  const combined = [caseContext, ...recentMessages, latestQuestion.trim()]
    .filter(Boolean)
    .join(' | ')

  return combined.slice(0, 800)
}

// Sanitize history
function sanitizeConversationHistory(
  history: Array<{ role: string; content: string }> = [],
  limit: number = 40
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(history)) return []

  return history
    .filter(entry => entry && typeof entry.role === 'string' && typeof entry.content === 'string')
    .map(entry => ({
      role: (entry.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: entry.content.trim()
    }))
    .filter(entry => entry.content.length > 0)
    .slice(-limit)
}

// Build history context
function buildHistoryContext(history: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  if (!history || history.length === 0) return ''

  const lines = history.map(entry => `${entry.role === 'assistant' ? 'Assistant' : 'User'}: ${entry.content}`)
  return `Recent conversation:\n${lines.join('\n')}\n`
}

// Detect definition query
function isDefinitionQuery(rawInput: string): boolean {
  if (!rawInput) return false

  const input = rawInput.trim().toLowerCase()
  const normalized = input.replace(/[^a-z0-9\s\?]/g, '')
  const words = normalized.split(/\s+/).filter(Boolean)

  if (words.length === 0 || words.length > 18) return false

  const triggers = [
    /^what\s+is\b/, /^whats\b/, /^what's\b/, /^define\b/, /^definition\b/,
    /^meaning\b/, /^meaning\s+of\b/, /^can\s+you\s+define\b/, /^can\s+you\s+explain\b/,
    /^explain\b/, /^tell\s+me\s+about\b/, /^is\s+there\s+anything\s+like\b/,
    /^give\s+me\s+the\s+definition\s+of\b/
  ]

  return triggers.some(pattern => pattern.test(input))
}

// Detect greeting
function isBasicGreeting(rawInput: string): boolean {
  if (!rawInput) return false
  const input = rawInput.trim().toLowerCase()
  if (!input) return false
  const greetingPattern = /^(hi|hello|hey|hiya|yo|good\s+morning|good\s+afternoon|good\s+evening|greetings|howdy)([!.,\s]*)$/i
  return greetingPattern.test(input)
}

// Detect document request
function wantsFormalDraft(rawInput: string): boolean {
  if (!rawInput) return false

  const input = rawInput.trim().toLowerCase()
  if (input.length === 0) return false

  const hasExplicitRequest = [
    /(?:can|could|would)\s+you\s+(?:please\s+)?(draft|write|prepare|create|generate|produce)/,
    /(?:^|[.!?]\s+)(?:please\s+)(?:draft|write|prepare|create|generate|produce)\b/,
    /\bhelp\s+me\s+(?:draft|write|prepare|create|generate|produce)\b/
  ].some((pattern) => pattern.test(input))

  if (!hasExplicitRequest) return false

  const docTargets = [
    'letter', 'document', 'witness statement', 'statement', 'skeleton argument',
    'defence', 'defense', 'application', 'affidavit', 'form', 'order', 'notice', 'pleading'
  ]

  return docTargets.some(term => input.includes(term))
}

// Remove markdown
function stripMarkdown(text: string): string {
  return text
    .replace(/#+ /g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_{1,2}(.+?)_{1,2}/g, '$1')
    .replace(/`{1,3}(.+?)`{1,3}/g, '$1')
    .replace(/^[\-\*]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/\*+/g, '')
    .replace(/_{2,}/g, '')
}

// Strip URLs
function stripUrlsFromText(text: string): string {
  if (!text) return ''
  const urlPattern = /https?:\/\/[^\s]+/g
  return text.replace(urlPattern, '').replace(/\n{3,}/g, '\n\n').trim()
}

// Extract citations from response
function extractFormattedSources(responseText: string, verifiedSources: string[]): Array<{ number: number; title: string; url: string }> | undefined {
  if (!verifiedSources.length) return undefined
  
  const citationPattern = /\[(\d+)\]/g
  const citationNumbers = new Set<number>()
  let match: RegExpExecArray | null
  
  while ((match = citationPattern.exec(responseText)) !== null) {
    citationNumbers.add(parseInt(match[1], 10))
  }
  
  if (citationNumbers.size === 0) return undefined
  
  const formattedSources: Array<{ number: number; title: string; url: string }> = []
  const sortedNumbers = Array.from(citationNumbers).sort((a, b) => a - b)
  
  sortedNumbers.forEach((num) => {
    const sourceIndex = num - 1
    if (sourceIndex >= 0 && sourceIndex < verifiedSources.length) {
      const url = verifiedSources[sourceIndex]
      let title = url
      try {
        const urlObj = new URL(url)
        title = urlObj.hostname.replace('www.', '') + (urlObj.pathname !== '/' ? urlObj.pathname.split('/').pop() || '' : '')
      } catch {
        title = url
      }
      
      formattedSources.push({
        number: num,
        title: title.length > 50 ? title.substring(0, 50) + '...' : title,
        url
      })
    }
  })
  
  return formattedSources.length > 0 ? formattedSources : undefined
}

// Call Claude LLM
async function callLLM(
  prompt: string,
  systemPrompt: string = SYSTEM_PROMPT,
  model: string = MODEL,
  maxTokens: number = 550
): Promise<string> {
  const startedAt = Date.now()
  try {
    const completion = await claudeLegalClient.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ]
    })
    logClaudeUsage({
      model,
      usage: (completion as any)?.usage,
      success: true,
      latencyMs: Date.now() - startedAt,
      requestType: 'legal-agent',
    })

    const rawResponse = completion.content[0]?.type === 'text' ? completion.content[0].text : "I couldn't generate a response."
    return stripMarkdown(stripUrlsFromText(rawResponse))
  } catch (error: unknown) {
    logClaudeUsage({
      model,
      success: false,
      latencyMs: Date.now() - startedAt,
      requestType: 'legal-agent',
      error: error instanceof Error ? error.message : String(error),
    })
    console.error('Claude API Error:', error)
    return "I'm having a problem. Please try again later."
  }
}

// =====================================================
// MAIN AGENT
// =====================================================

export async function createLegalAgent(
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  caseId?: string
) {
  let fullHistory = conversationHistory

  // Fetch case history if caseId provided
  if (caseId) {
    try {
      const { data: messagesData, error: messagesError } = await supabaseAdmin
        .from('messages')
        .select('role, content, timestamp')
        .eq('case_id', caseId)
        .order('timestamp', { ascending: true })
      
      if (!messagesError && Array.isArray(messagesData)) {
        fullHistory = messagesData.map((msg: any) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content || ''
        }))
      }
    } catch (err) {
      // fallback to provided conversationHistory
    }
  }

  const trimmedHistory = sanitizeConversationHistory(fullHistory, 40)
  const tools = [new DocGeneratorTool(), new SearchTool()]
  const systemPrompt = SYSTEM_PROMPT

  return {
    tools,
    systemPrompt,
    /**
     * Simple handler: greeting → document → search+answer
     */
    async invoke({ input }: { input: string }): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; sources?: Array<{ number: number; title: string; url: string }> }> {
      try {
        const latestQuestion = (input || '').trim()

        // 1. Check greeting
        if (isBasicGreeting(latestQuestion)) {
          return {
            response: "Hello! I'm MymckenzieCS. How can I help with your legal question?",
            document_generated: false,
            guidance_provided: true,
            sources: undefined
          }
        }

        // 2. Check document request
        if (wantsFormalDraft(latestQuestion)) {
          const contextForTools = buildHistoryContext(trimmedHistory) + latestQuestion
          const docResult = await tools[0]._call(contextForTools)
          return {
            response: stripMarkdown(docResult).trim(),
            document_generated: true,
            guidance_provided: false,
            sources: undefined
          }
        }

        // 3. Standard Q&A
        const isDefinition = isDefinitionQuery(latestQuestion)
        const mode: RetrievalMode = isDefinition ? 'education' : 'general'
        const searchQuery = buildSearchQuery(trimmedHistory, latestQuestion, caseKeywords)

        // Search
        const retrieval = await simpleRetrieval(tools[1], searchQuery, mode)
        const filteredSources = await filterReachableUrls(retrieval.sources)

        // Build LLM prompt
        const sourceBlock = filteredSources.length > 0
          ? `Sources to cite:\n${filteredSources.map((url, i) => `[${i + 1}] ${url}`).join('\n')}`
          : 'No sources available.'

        const llmPrompt = `${sourceBlock}\n\nRetrieved information:\n${retrieval.packet}\n\nUser question: "${latestQuestion}"\n\nGround your answer ONLY in the sources above. Cite using [1], [2], etc.`

        // Call LLM
        const rawResponse = await callLLM(llmPrompt, systemPrompt, MODEL, 550)
        const responseText = stripMarkdown(stripUrlsFromText(rawResponse)).trim()

        // Extract citations
        const citedSources = extractFormattedSources(responseText, filteredSources)
        return {
          response: responseText,
          document_generated: false,
          guidance_provided: true,
          sources: citedSources
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : ''
        const status = (typeof error === 'object' && error !== null && 'status' in error)
          ? ((error as { status?: unknown }).status as number | undefined)
          : undefined

        if (message.includes('rate limit') || status === 429) {
          return {
            response: "I'm experiencing high demand. Please try again in a moment.",
            document_generated: false,
            guidance_provided: false,
            sources: undefined
          }
        }
        throw error
      }
    }
  }
}

/**
 * Helper to invoke the agent
 */
export async function invokeLegalAgent(
  message: string,
  threadId: string,
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const agent = await createLegalAgent(conversationHistory, caseKeywords)
  const response = await agent.invoke({ input: message })
  return {
    response: response.response,
    document_generated: response.document_generated,
    guidance_provided: response.guidance_provided,
    next_steps: [],
    sources: response.sources
  }
}
