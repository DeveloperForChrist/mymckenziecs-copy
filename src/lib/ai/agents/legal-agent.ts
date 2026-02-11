// Import OpenAI client for all LLM calls
import { OpenAI } from 'openai';
import { supabaseAdmin } from '../../database/supabase-server';
import { DocGeneratorTool } from '../tools/doc-generator-tool';
import { SearchTool } from '../tools/search-tool';
import { createDiscriminatorAgent } from './discriminator-agent';

// Simplified system prompt
const SYSTEM_PROMPT: string = `You are MyMcKenzie Assistant, a UK support assistant for people representing themselves in the UK court, also known as litigant in Person.

CRITICAL:
- You SUPPORT, GUIDANCE AND HELP Users with their legal questions and issues.
- Use plain text only: no markdown, no asterisks, no hashes, no underlining.

PRESENTATION:
- Use clear section titles as plain text lines (do NOT end titles with a colon).
- Use headings only when the topic branches, and make them specific (tell the reader what they gain).
- Use short paragraphs (1 idea, 1-3 sentences, 2-4 lines) with blank lines between sections.
- Use numbered lists (1., 2., 3.) for ordered steps or hierarchy.
- Use bullets (•) for parallel ideas.
- Do not output tables.
- Use divider lines only when shifting mode (e.g., explanation → examples, law → practical). Divider line must be exactly: ---
- Always end with a one-sentence compression line starting with "In short:".
- No inline styling symbols.

TONE:
- Warm, reassuring, clear English.
- Use bullets (•) for lists.
- Break complex steps into manageable pieces.
- Ask clarifying questions rather than assume.

`;

const SYSTEM_PROMPT_FREE: string = `You are MyMcKenzie Assistant, a UK support assistant for people representing themselves in the UK court, also known as litigant in Person.

CRITICAL:
- Provide general legal information only. Do not give legal advice or recommendations.
- Use plain text only: no markdown, no asterisks, no hashes, no underlining.

PRESENTATION:
- Use clear section titles as plain text lines (do NOT end titles with a colon).
- Use short paragraphs (1 idea, 1-3 sentences, 2-4 lines).
- Use numbered lists (1., 2., 3.) for ordered steps or hierarchy.
- Use bullets (•) for parallel ideas.
- Do not output tables.
- Always end with a one-sentence compression line starting with "In short:".

TONE:
- Warm, clear, and concise.
- Ask a short clarifying question if needed.

`;

const MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o'
const MAX_TOKENS = 1000

// =====================================================
// SIMPLE HELPERS
// =====================================================

type RetrievalMode = 'education' | 'general'

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

// Call OpenAI LLM
async function callLLM(
  prompt: string,
  systemPrompt: string = SYSTEM_PROMPT,
  model: string = MODEL,
  maxTokens: number = MAX_TOKENS
): Promise<string> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in the environment')
    }

    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    })

    const rawResponse = completion.choices[0]?.message?.content || "I couldn't generate a response."
    return stripMarkdown(stripUrlsFromText(rawResponse))
  } catch (error: unknown) {
    console.error('OpenAI API Error:', error)
    return "I'm having a problem. Please try again later."
  }
}

// =====================================================
// MAIN AGENT
// =====================================================

export async function createLegalAgent(
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  caseId?: string,
  options?: { useDiscriminator?: boolean; useSearch?: boolean; systemPrompt?: string; includeCitations?: boolean }
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
  const tools = [new DocGeneratorTool()]
  const systemPrompt = options?.systemPrompt || SYSTEM_PROMPT
  const useDiscriminator = options?.useDiscriminator !== false
  const useSearch = options?.useSearch !== false
  const includeCitations = options?.includeCitations === true
  return {
    tools,
    systemPrompt,
    /**
     * Flow: greeting → document → SEARCH + ANSWER → DISCRIMINATOR REVIEW + IMPROVE
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

        // 3. LEGAL AGENT: Direct answer (no search, no discriminator)
        if (!useSearch) {
          const historyContext = buildHistoryContext(trimmedHistory)
          const caseContext = caseKeywords ? `Case context: ${caseKeywords}\n` : ''
          const directPrompt = `${historyContext}${caseContext}User question: "${latestQuestion}"\n\nProvide a clear, helpful answer based on your general knowledge. Output must be plain text only. Follow the presentation rules.`
          const directAnswer = await callLLM(directPrompt, systemPrompt, MODEL, MAX_TOKENS)
          return {
            response: directAnswer,
            document_generated: false,
            guidance_provided: true,
            sources: undefined
          }
        }

        // 4. LEGAL AGENT: Comprehensive web search and answer generation
        const isDefinition = isDefinitionQuery(latestQuestion)
        const mode: RetrievalMode = isDefinition ? 'education' : 'general'
        
        // Build search query with case context if available
        let searchQuery = latestQuestion
        if (caseKeywords && caseKeywords.trim()) {
          searchQuery = `${latestQuestion} | Case context: ${caseKeywords}`
        }
        
        // Perform comprehensive search for all relevant information
        const searchTool = new SearchTool()
        const searchPayload = JSON.stringify({ query: searchQuery, mode })
        const searchResult = await searchTool._call(searchPayload)
        
        let sources: string[] = []
        let searchedInfo = ''
        try {
          const parsed = JSON.parse(searchResult) as { sources?: unknown[]; packet?: string }
          sources = Array.isArray(parsed.sources) ? parsed.sources.filter((u: unknown): u is string => typeof u === 'string') : []
          searchedInfo = typeof parsed.packet === 'string' ? parsed.packet : ''
        } catch {
          searchedInfo = searchResult
        }

        // Generate comprehensive answer using ALL sources
        const sourceBlock = sources.length > 0
          ? `All available sources to reference:\n${sources.map((url, i) => `[${i + 1}] ${url}`).join('\n')}`
          : 'No sources available.'

        const citationInstruction = includeCitations
          ? 'Include inline citations in square brackets that match the sources list above, like [1] or [2]. Use citations on factual statements.'
          : 'Do not include any source citations.'
        const comprehensivePrompt = `${sourceBlock}\n\nComprehensive legal information retrieved:\n${searchedInfo}\n\nUser question: "${latestQuestion}"\n\nGenerate a thorough, detailed answer that comprehensively covers this topic using ALL relevant information from the sources. ${citationInstruction} Create a complete answer that covers all aspects and angles of the question. Output must be plain text only. No markdown. Use clear section titles as plain text lines ending with a colon (e.g., "Summary:"). Use short paragraphs and bullets (•) where needed.`
        
        const comprehensiveAnswer = await callLLM(comprehensivePrompt, systemPrompt, MODEL, MAX_TOKENS + 400)

        // 5. DISCRIMINATOR: Critic/revise/verify the comprehensive answer for the user
        if (useDiscriminator) {
          const discriminatorAgent = await createDiscriminatorAgent(trimmedHistory, caseKeywords, includeCitations)
          const streamlined = await discriminatorAgent.invoke({
            input: latestQuestion,
            comprehensiveAnswer: comprehensiveAnswer,
            allSources: sources
          })

          const finalResponse = streamlined.streamlinedAnswer
          const citedSources = streamlined.citedSources

          return {
            response: finalResponse,
            document_generated: false,
            guidance_provided: true,
            sources: citedSources
          }
        }

        return {
          response: comprehensiveAnswer,
          document_generated: false,
          guidance_provided: true,
          sources: undefined
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
  caseKeywords?: string,
  options?: { useDiscriminator?: boolean; useSearch?: boolean; includeCitations?: boolean }
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const agent = await createLegalAgent(conversationHistory, caseKeywords, undefined, options)
  const response = await agent.invoke({ input: message })
  return {
    response: response.response,
    document_generated: response.document_generated,
    guidance_provided: response.guidance_provided,
    next_steps: [],
    sources: response.sources
  }
}

export async function invokeFreeLegalAgent(
  message: string,
  threadId: string,
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const agent = await createLegalAgent(conversationHistory, caseKeywords, undefined, {
    useDiscriminator: false,
    useSearch: false,
    systemPrompt: SYSTEM_PROMPT_FREE
  })
  const response = await agent.invoke({ input: message })
  return {
    response: response.response,
    document_generated: response.document_generated,
    guidance_provided: response.guidance_provided,
    next_steps: [],
    sources: response.sources
  }
}
