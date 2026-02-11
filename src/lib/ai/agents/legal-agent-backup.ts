
// Import Claude (Anthropic) client for all LLM calls
import claudeLegalClient from '../providers/claude-legal-client';
import { logClaudeUsage } from '@/lib/utils/claude-usage';
import { supabaseAdmin } from '../../database/supabase-server';
import { DocGeneratorTool } from '../tools/doc-generator-tool';
import { SearchTool } from '../tools/search-tool';
import { CaseContextExtractor, BackgroundCaseIntelligence, PrincipleExtractor, formatIntelligenceContext } from '../../search/case-matching-engine';

// Prompt template
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
// DECOMPOSE-SEARCH-SYNTHESIZE-FORMULATE ARCHITECTURE
// =====================================================

/**
 * STEP 1: DECOMPOSE
 * Break down user query into atomic facts needed for a complete answer
 */
async function decomposeQuery(
  input: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{
  factsNeeded: string[]
  queryType: RetrievalMode
  legalArea: string
  priority: string[]
}> {
  console.log('🔍 STEP 1: DECOMPOSE - Breaking down query into atomic facts')
  
  // Identify query type
  const isDefinition = isDefinitionQuery(input)
  const isDraft = wantsFormalDraft(input)
  const queryType: RetrievalMode = isDefinition ? 'education' : isDraft ? 'document_review' : classifyQueryMode(input)
  
  // Extract legal area from context
  const recentContext = history.slice(-5).map(h => h.content).join(' ')
  const legalArea = detectLegalArea(input + ' ' + recentContext)
  
  // Decompose into facts
  const factsNeeded = decomposeIntoFacts(input, legalArea)
  const priority = extractPriorityFacts(input)
  
  return { factsNeeded, queryType, legalArea, priority }
}

/**
 * STEP 2: SEARCH
 * Retrieve facts from authoritative UK law sources
 */
async function searchSources(
  decomposed: { factsNeeded: string[]; legalArea: string; priority: string[]; queryType?: RetrievalMode },
  searchTool: SearchTool,
  userQuery: string,
  caseKeywords?: string
): Promise<{
  packet: string
  sources: string[]
  retrieved: string[]
}> {
  console.log('🔎 STEP 2: SEARCH - Retrieving from authoritative sources')
  
  const searchQuery = buildSearchQuery([
    { role: 'user', content: decomposed.factsNeeded.join(' ') },
    { role: 'user', content: decomposed.priority.join(' ') }
  ], userQuery, caseKeywords)
  
  const retrievalMode: RetrievalMode = (decomposed.queryType as RetrievalMode) || 'general'
  const { packet, sources } = await runTieredRetrieval(searchTool, searchQuery, retrievalMode)
  const validSources = await filterReachableUrls(sources, userQuery)
  
  return { packet, sources: validSources, retrieved: decomposed.factsNeeded }
}

/**
 * STEP 3: SYNTHESIZE
 * Build answer directly from retrieved sources, cite everything
 */
async function synthesizeAnswer(
  retrieved: { packet: string; sources: string[] },
  decomposed: { factsNeeded: string[]; legalArea: string },
  userQuery: string,
  systemPrompt: string,
  model: string
): Promise<{
  answer: string
  citedSources: Array<{ number: number; title: string; url: string }>
  confidence: 'high' | 'medium' | 'low'
}> {
  console.log('🧠 STEP 3: SYNTHESIZE - Building answer from sources only')
  
  const sourceBlock = retrieved.sources.length > 0
    ? `Authoritative sources (cite these using [1], [2], [3]):\n${retrieved.sources.map((url, i) => `[${i+1}] ${url}`).join('\n')}\n\n`
    : 'No sources available. State this clearly.\n\n'
  
  const groundingPrompt = `
Retrieved facts needed: ${decomposed.factsNeeded.join(', ')}
Legal area: ${decomposed.legalArea}

Source material (ground your answer ONLY in this):
${retrieved.packet}

${sourceBlock}

User question: "${userQuery}"

IMPORTANT: NEVER answer from memory. Only cite what's in the sources above. If information isn't in sources, say "I don't have sources for that."

Answer:
`
  
  const rawAnswer = await callLLM(groundingPrompt, systemPrompt, model, 600)
  const citedSources = extractFormattedSources(rawAnswer, retrieved.sources) || []
  const confidence = retrieved.sources.length > 2 ? 'high' : retrieved.sources.length > 0 ? 'medium' : 'low'
  
  return { answer: rawAnswer, citedSources, confidence }
}

/**
 * STEP 4: FORMULATE
 * Conversationalize the synthesized answer for user
 */
async function formulateResponse(
  synthesized: { answer: string; citedSources: Array<{ number: number; title: string; url: string }>; confidence: 'high' | 'medium' | 'low' },
  userQuery: string,
  systemPrompt: string,
  model: string
): Promise<string> {
  console.log('💬 STEP 4: FORMULATE - Conversationalizing answer')
  
  // If confidence is low, add disclaimer
  const disclaimer = synthesized.confidence === 'low' 
    ? '\n\nNote: I have limited sources for this query. For critical decisions, please verify with official sources or professional advisors.'
    : ''
  
  // Clean and format the answer
  const cleaned = stripAsciiDiagrams(stripUrlsFromText(stripInlineSources(synthesized.answer)))
  const final = cleaned.trim() + disclaimer
  
  return final
}

// Helper functions for decomposition
function decomposeIntoFacts(query: string, legalArea: string): string[] {
  const facts: string[] = []
  
  if (query.match(/when|deadline|time/i)) facts.push('timeline')
  if (query.match(/how|process|procedure|step/i)) facts.push('procedure')
  if (query.match(/evidence|proof|document/i)) facts.push('evidence_requirements')
  if (query.match(/form|n\d+|application/i)) facts.push('forms_needed')
  if (query.match(/defense|defend|defendant/i)) facts.push('defense_rights')
  if (query.match(/notice|served|received/i)) facts.push('notice_validity')
  
  if (facts.length === 0) facts.push('general_guidance')
  return facts
}

function extractPriorityFacts(query: string): string[] {
  const priority: string[] = []
  
  if (query.match(/urgent|immediately|asap/i)) priority.push('URGENT')
  if (query.match(/deadline|expires|must/i)) priority.push('TIME_CRITICAL')
  if (query.match(/can i|am i|do i have/i)) priority.push('RIGHTS_CHECK')
  
  return priority
}

function detectLegalArea(text: string): string {
  const areas = {
    housing: /eviction|rent|lease|landlord|tenant|notice|possession|section\s*8|ground|assured/i,
    employment: /dismissal|employment|unfair|redundancy|wages|contract/i,
    family: /divorce|custody|children|maintenance|family|marital/i,
    civil: /claim|defendant|claimant|sued|damages|contract|negligence/i,
    criminal: /criminal|conviction|guilty|sentence|appeal|legal aid/i,
    procedure: /cpr|court|procedure|form|hearing|judgment|deadline/i
  }
  
  for (const [area, pattern] of Object.entries(areas)) {
    if (pattern.test(text)) return area
  }
  
  return 'general'
}

// =====================================================
// END ARCHITECTURE
// =====================================================

function stripInlineSources(text: string): string {
  if (!text) return ''
  const sourcesRegex = /(Reviewed\s+\d+\s+sources[\s\S]*$|SOURCES REVIEWED:[\s\S]*$)/i
  return text.replace(sourcesRegex, '').trim()
}

function stripUrlsFromText(text: string): string {
  if (!text) return ''
  const urlPattern = /https?:\/\/[^\s]+/g
  return text.replace(urlPattern, '').replace(/\n{3,}/g, '\n\n').trim()
}

function detectTopicHints(text: string): string[] {
  const lower = text.toLowerCase()
  const hints = new Set<string>()

  if (/cpr|civil procedure rules/.test(lower)) hints.add('CPR civil procedure rules')
  if (/practice direction|\bpd\b/.test(lower)) hints.add('practice directions')
  if (/case law|judgment|appeal|precedent/.test(lower)) hints.add('case law judgments')
  if (/statute|legislation|act\b|regulation|statutory/.test(lower)) hints.add('legislation and statutes')
  if (/parliament|bill|act of parliament/.test(lower)) hints.add('parliament bills and legislation')
  if (/supreme court/.test(lower)) hints.add('supreme court')
  if (/citizens advice|advicenow|lawworks|legal aid|legal advice/.test(lower)) hints.add('legal advice services')

  return Array.from(hints)
}

function buildSearchQuery(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  latestQuestion: string,
  caseKeywords?: string
): string {
  const recentUserMessages = history
    .filter((entry) => entry.role === 'user')
    .map((entry) => entry.content.trim())
    .filter(Boolean)
    .slice(-20)

  const combinedText = [...recentUserMessages, latestQuestion].filter(Boolean).join(' ')
  const topicHints = detectTopicHints(combinedText)
  const topicLabel = topicHints.length > 0 ? `Topic: ${topicHints.join(', ')}` : ''

  // Prepend case keywords if available for targeted search
  const caseContext = caseKeywords ? `Context: ${caseKeywords} | ` : ''

  // Extract key terms from latest question (prioritize specific legal terms)
  const keyTerms = extractKeyTermsForSearch(latestQuestion)
  const keyTermLabel = keyTerms.length > 0 ? `Keywords: ${keyTerms.join(', ')}` : ''

  const combined = [caseContext, keyTermLabel, topicLabel, ...recentUserMessages, latestQuestion.trim()]
    .filter(Boolean)
    .join(' | ')

  return combined.slice(0, 1200)
}

// Extract key legal terms and concepts from question for more targeted search
function extractKeyTermsForSearch(text: string): string[] {
  const terms: string[] = []
  
  // Legal forms
  const formMatches = text.match(/\b(form n\d+|n\d{1,4}|n244|n5|n242)\b/gi)
  if (formMatches) terms.push(...formMatches.map(m => m.toLowerCase()))
  
  // Key legal concepts
  const concepts = [
    'eviction', 'notice', 'defence', 'claim', 'deadline', 'hearing', 'witness statement',
    'evidence', 'damages', 'injunction', 'appeal', 'litigation', 'court', 'judge',
    'procedure', 'civil', 'criminal', 'family', 'employment', 'contract', 'lease'
  ]
  const foundConcepts = concepts.filter(concept => text.toLowerCase().includes(concept))
  terms.push(...foundConcepts)
  
  // Acts/Legislation mentioned
  const actMatches = text.match(/\b([A-Z][a-z\s&'.-]+Act\s+\d{4})\b/g)
  if (actMatches) terms.push(...actMatches)
  
  // UK court/authority references
  if (text.match(/\b(supreme court|court of appeal|high court|county court|tribunal)\b/i)) {
    const courtMatches = text.match(/\b(supreme court|court of appeal|high court|county court|tribunal)\b/i)
    if (courtMatches) terms.push(...courtMatches)
  }
  
  return Array.from(new Set(terms)).slice(0, 6) // Limit to 6 key terms
}

function shouldAttachSources(text: string): boolean {
  if (!text) return false
  const needle = text.toLowerCase()
  if (/\[\d+\]/.test(needle)) return true
  if (needle.includes('cpr') || needle.includes('practice direction')) return true
  if (needle.includes('case law') || needle.includes('judgment')) return true
  if (/\bv\.\b|\bv\b/.test(needle)) return true
  if (/\bsection\b|\bs\.\s*\d+|\bregulation\b|\bstatute\b|\bstatutory\b/.test(needle)) return true
  if (/\b(act|rule)\b/.test(needle)) return true
  if (/\bform\s+n\d+\b/.test(needle)) return true
  if (/\bn\d{1,4}\b/.test(needle)) return true
  return false
}

const hasBracketCitations = (text: string): boolean => /\[\d+\]/.test(text || '')

const extractCitationTokens = (text: string): string[] => {
  if (!text) return []
  const patterns = [
    /\bCPR\s*\d+(?:\.\d+)?/gi,
    /\bPractice Direction\s*[A-Z0-9\-]+/gi,
    /\bsection\s+\d+[A-Z0-9\-]*/gi,
    /\bregulation\s+\d+[A-Z0-9\-]*/gi,
    /\brule\s+\d+[A-Z0-9\-]*/gi,
    /\bform\s+N\d+\b/gi,
    /\bN\d{1,4}\b/gi,
    /\b[A-Z][A-Za-z&'.-]+(?:\s+[A-Z][A-Za-z&'.-]+)*\s+v\s+[A-Z][A-Za-z&'.-]+(?:\s+[A-Z][A-Za-z&'.-]+)*\b/g,
    /\b[A-Z][A-Za-z\s&]+ Act\s+\d{4}\b/g
  ]
  const tokens: string[] = []
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      if (match[0]) tokens.push(match[0].trim())
    }
  }
  return Array.from(new Set(tokens))
}

const applyCitationGuard = (
  text: string,
  retrievalPacket: string
): { text: string; verified: boolean } => {
  const tokens = extractCitationTokens(text)
  if (!tokens.length) {
    return { text, verified: false }
  }
  const packet = (retrievalPacket || '').toLowerCase()
  if (!packet) {
    return { text: stripCitationLines(text, tokens), verified: false }
  }
  const verifiedTokens = tokens.filter((token) => packet.includes(token.toLowerCase()))
  const missingTokens = tokens.filter((token) => !verifiedTokens.includes(token))
  if (!verifiedTokens.length) {
    return { text: stripCitationLines(text, tokens), verified: false }
  }
  if (missingTokens.length === 0) {
    return { text, verified: true }
  }
  return { text: stripCitationLines(text, missingTokens), verified: true }
}

const stripCitationLines = (text: string, tokens: string[]): string => {
  if (!text || !tokens.length) return text
  const loweredTokens = tokens.map((token) => token.toLowerCase())
  const lines = text.split('\n')
  const filtered = lines.filter((line) => {
    const lower = line.toLowerCase()
    return !loweredTokens.some((token) => lower.includes(token))
  })
  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Extract numbered citations from response and format sources for UI display
 */
function extractFormattedSources(responseText: string, verifiedSources: string[]): Array<{ number: number; title: string; url: string }> | undefined {
  if (!verifiedSources.length) return undefined
  
  // Find all [n] patterns in the response
  const citationPattern = /\[(\d+)\]/g
  const citationNumbers = new Set<number>()
  let match: RegExpExecArray | null
  
  while ((match = citationPattern.exec(responseText)) !== null) {
    citationNumbers.add(parseInt(match[1], 10))
  }
  
  if (citationNumbers.size === 0) return undefined
  
  // Create formatted sources for each cited number, mapped to verified sources by number (1-based)
  const formattedSources: Array<{ number: number; title: string; url: string }> = []
  const sortedNumbers = Array.from(citationNumbers).sort((a, b) => a - b)
  
  sortedNumbers.forEach((num) => {
    const sourceIndex = num - 1
    if (sourceIndex >= 0 && sourceIndex < verifiedSources.length) {
      const url = verifiedSources[sourceIndex]
      // Extract title from URL (domain name or path)
      let title = url
      try {
        const urlObj = new URL(url)
        title = urlObj.hostname.replace('www.', '') + (urlObj.pathname !== '/' ? urlObj.pathname.split('/').pop() || '' : '')
      } catch {
        // If URL parsing fails, use the URL as-is
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

const AUTHORITATIVE_DOMAINS = [
  'legislation.gov.uk',
  'bailii.org',
  'gov.uk',
  'justice.gov.uk',
  'judiciary.uk',
  'nationalarchives.gov.uk'
]

const BLOCK_DOMAINS = [
  'reddit.com',
  'old.reddit.com',
  'forum',
  'facebook.com',
  'x.com',
  'twitter.com',
  'tiktok.com',
  'instagram.com',
  'blog',
  'medium.com'
]

const SENTIMENT_ONLY_DOMAINS = [
  'reddit.com',
  'old.reddit.com'
]

const DOMAIN_TIER_RULES: Array<{ domain: string; tier: number }> = [
  { domain: 'legislation.gov.uk', tier: 1 },
  { domain: 'bailii.org', tier: 2 },
  { domain: 'gov.uk', tier: 3 },
  { domain: 'justice.gov.uk', tier: 4 },
  { domain: 'judiciary.uk', tier: 4 },
  { domain: 'nationalarchives.gov.uk', tier: 4 }
]

function getDomainTier(url: string): number | null {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.replace('www.', '')

    if (SENTIMENT_ONLY_DOMAINS.some((domain) => hostname === domain || hostname.endsWith('.' + domain))) {
      return 5
    }

    if (BLOCK_DOMAINS.some((domain) => hostname === domain || hostname.endsWith('.' + domain) || hostname.includes(domain))) {
      return null
    }

    const matched = DOMAIN_TIER_RULES.find((rule) => hostname === rule.domain || hostname.endsWith('.' + rule.domain))
    return matched ? matched.tier : null
  } catch {
    return null
  }
}

function isDomainAuthoritative(url: string): boolean {
  const tier = getDomainTier(url)
  return typeof tier === 'number' && tier >= 1 && tier <= 4
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was', 'were', 'have', 'has', 'had',
  'about', 'into', 'over', 'under', 'between', 'within', 'without', 'their', 'there', 'then', 'than', 'what', 'when',
  'where', 'which', 'who', 'whom', 'why', 'how', 'can', 'could', 'should', 'would', 'may', 'might', 'must', 'will',
  'not', 'but', 'also', 'more', 'most', 'some', 'any', 'each', 'other', 'same', 'such', 'only', 'very', 'case', 'law',
  'uk', 'england', 'wales'
])

function extractContextKeywords(text: string): string[] {
  if (!text) return []

  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const parts = cleaned.split(/\s+/).filter(Boolean)
  const keywords = parts.filter((word) => word.length > 3 && !STOPWORDS.has(word))
  return Array.from(new Set(keywords)).slice(0, 10)
}

function pageLooksLikeNoResult(normalized: string): boolean {
  return (
    normalized.includes('page not found') ||
    normalized.includes('not found') ||
    normalized.includes('no results') ||
    normalized.includes('0 results') ||
    normalized.includes('did not match any documents') ||
    normalized.includes('nothing found') ||
    normalized.includes('no matching results') ||
    normalized.includes('sorry, we couldn\'t find') ||
    normalized.includes('sorry, we could not find')
  )
}

async function isUrlValidForCitation(
  url: string,
  query?: string
): Promise<boolean> {
  try {
    if (!isDomainAuthoritative(url)) {
      return false
    }

    if (/\/search\b|\bsearch\?/.test(url)) {
      return false
    }

    const response = await fetch(url, { method: 'GET', redirect: 'follow' })
    if (!response.ok) return false

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/pdf')) {
      return true
    }

    if (contentType.includes('text/html') || contentType.includes('text/plain')) {
      const body = await response.text()
      const normalized = body.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized.length < 500) return false
      if (pageLooksLikeNoResult(normalized)) return false

      // Check for keyword relevance if query provided
      const keywords = extractContextKeywords(query || '')
      if (keywords.length > 0) {
        const matchedKeywords = keywords.filter((kw) => normalized.includes(kw))
        // Be more flexible: require at least 1 keyword match instead of all
        if (matchedKeywords.length === 0 && keywords.length > 3) {
          return false
        }
      }
      
      // Prefer content that mentions UK legal authority terms
      const authorityIndicators = ['statute', 'legislation', 'act', 'regulation', 'court', 'judge', 'legal', 'law', 'procedure', 'rule']
      const hasAuthorityIndicator = authorityIndicators.some(indicator => normalized.includes(indicator))
      
      return true // Content looks valid
    }

    return true
  } catch (error: unknown) {
    console.warn('Failed to validate citation URL:', url, error)
    return false
  }
}

async function filterReachableUrls(
  urls: string[],
  query?: string
): Promise<string[]> {
  if (!urls.length) return []

  const candidates = urls
    .filter((url) => isDomainAuthoritative(url))

  const checks = await Promise.all(
    candidates.map(async (url) => (await isUrlValidForCitation(url, query) ? url : null))
  )

  return checks.filter((value): value is string => Boolean(value))
}

type RetrievalMode = 'education' | 'procedure' | 'case_specific' | 'document_review' | 'general'

type SearchToolOutput = {
  query: string
  mode: RetrievalMode
  reviewedCount: number
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

const classifyQueryMode = (input: string): RetrievalMode => {
  const text = (input || '').toLowerCase().trim()
  if (!text) return 'general'

  // document review / document work
  if (/(review|check|proofread|edit|rewrite|improve|structure|format)\b/.test(text)) {
    return 'document_review'
  }
  if (/(witness statement|defence|defense|claim form|particulars of claim|draft|write|prepare|letter before action|n244|form n\d+)/.test(text)) {
    return 'document_review'
  }

  // procedure focused
  if (/(cpr|practice direction|pd\b|time limit|deadline|hearing|allocation|directions|service|served|filed|filing|track|small claims|fast track|multi track|set aside|strike out|summary judgment)/.test(text)) {
    return 'procedure'
  }

  // case-specific: parties, dates, evidence, story
  if (/(i\s+was|they\s+did|on\s+\d{1,2}\s|evidence|email|text message|invoice|contract|police|hospital|landlord|tenant|employer|dismissed|rent|deposit|accident)/.test(text)) {
    return 'case_specific'
  }

  // education/definitions
  if (isDefinitionQuery(text) || /(meaning|what does|explain|difference between)/.test(text)) {
    return 'education'
  }

  return 'general'
}

const runTieredRetrieval = async (
  searchTool: SearchTool,
  query: string,
  mode: RetrievalMode,
): Promise<{ packet: string; sources: string[] }> => {
  // First pass: Try targeted search
  const payload = JSON.stringify({ query, mode })
  const raw = await searchTool._call(payload)
  const parsed = safeJsonParse<SearchToolOutput>(raw)
  
  if (!parsed) {
    return { packet: '', sources: [] }
  }
  
  let sources = Array.isArray(parsed.sources) ? parsed.sources.filter((u) => typeof u === 'string') : []
  let packet = typeof parsed.packet === 'string' ? parsed.packet : ''
  
  // Fallback: If first search returns no results or minimal results, try broader search
  if (sources.length === 0 || (sources.length < 2 && packet.length < 500)) {
    console.log('📚 Search returned minimal results, trying broader search...')
    
    // Extract just the main question without context
    const questionMatch = query.match(/(?:^|\s)(User|Question):\s*(.+?)(?:\||$)/i)
    const mainQuestion = questionMatch ? questionMatch[2].trim() : query.split('|').pop()?.trim() || query
    
    if (mainQuestion && mainQuestion !== query) {
      const broaderPayload = JSON.stringify({ query: mainQuestion, mode: 'general' })
      const broaderRaw = await searchTool._call(broaderPayload)
      const broaderParsed = safeJsonParse<SearchToolOutput>(broaderRaw)
      
      if (broaderParsed) {
        const broaderSources = Array.isArray(broaderParsed.sources) ? broaderParsed.sources.filter((u) => typeof u === 'string') : []
        const broaderPacket = typeof broaderParsed.packet === 'string' ? broaderParsed.packet : ''
        
        // Use broader results if they're better
        if (broaderSources.length > sources.length || (broaderPacket.length > packet.length && broaderSources.length > 0)) {
          sources = broaderSources
          packet = broaderPacket
          console.log('📚 Using broader search results')
        }
      }
    }
  }
  
  return { packet, sources }
}

// Escape regex special characters in a string
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Remove markdown formatting and convert bullets to plain text
function stripMarkdown(text: string): string {
  return text
    .replace(/#+ /g, '') // Remove heading markers
    .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold **text**
    .replace(/\*(.+?)\*/g, '$1') // Remove italic *text*
    .replace(/_{1,2}(.+?)_{1,2}/g, '$1') // Remove underscores
    .replace(/`{1,3}(.+?)`{1,3}/g, '$1') // Remove backticks
    .replace(/^[\-\*]\s+/gm, '• ') // Convert list markers to bullets
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove link syntax
    .replace(/\*+/g, '') // Remove any remaining asterisks
    .replace(/_{2,}/g, ''); // Remove any remaining underscores
}

// Detect if the user is asking for a legal definition
function isDefinitionQuery(rawInput: string): boolean {
  if (!rawInput) {
    return false;
  }

  const input = rawInput.trim().toLowerCase();
  const normalized = input.replace(/[^a-z0-9\s\?]/g, '');
  const words = normalized.split(/\s+/).filter(Boolean);

  if (words.length === 0 || words.length > 18) {
    return false;
  }

  const triggers = [
    /^what\s+is\b/,
    /^whats\b/,
    /^what's\b/,
    /^define\b/,
    /^definition\b/,
    /^meaning\b/,
    /^meaning\s+of\b/,
    /^can\s+you\s+define\b/,
    /^can\s+you\s+explain\b/,
    /^explain\b/,
    /^tell\s+me\s+about\b/,
    /^is\s+there\s+anything\s+like\b/,
    /^give\s+me\s+the\s+definition\s+of\b/
  ];

  return triggers.some(pattern => pattern.test(input));
}

// Detect if the user input is just a basic greeting
function isBasicGreeting(rawInput: string): boolean {
  if (!rawInput) return false;
  const input = rawInput.trim().toLowerCase();
  if (!input) return false;
  const greetingPattern = /^(hi|hello|hey|hiya|yo|good\s+morning|good\s+afternoon|good\s+evening|greetings|howdy)([!.,\s]*)$/i;
  return greetingPattern.test(input);
}

// Detect if the user is explicitly requesting a formal draft document
function wantsFormalDraft(rawInput: string): boolean {
  if (!rawInput) {
    return false;
  }

  const input = rawInput.trim().toLowerCase();
  if (input.length === 0) {
    return false;
  }

  const explicitRequests = [
    /(?:can|could|would)\s+you\s+(?:please\s+)?(draft|write|prepare|create|generate|produce)/,
    /(?:^|[.!?]\s+)(?:please\s+)(?:draft|write|prepare|create|generate|produce)\b/,
    /\bhelp\s+me\s+(?:draft|write|prepare|create|generate|produce)\b/
  ];

  const hasExplicitRequest = explicitRequests.some((pattern) => pattern.test(input));
  if (!hasExplicitRequest) {
    return false;
  }

  const draftVerbs = ['draft', 'write', 'prepare', 'create', 'generate', 'produce', 'fill in', 'complete'];
  const docTargets = [
    'letter',
    'document',
    'witness statement',
    'statement',
    'skeleton argument',
    'defence',
    'defense',
    'application',
    'affidavit',
    'form',
    'order',
    'notice',
    'pleading'
  ];

  const verbPattern = draftVerbs
    .map(verb => escapeRegExp(verb).replace(/\s+/g, '\\s+'))
    .join('|');
  const pattern = new RegExp(
    `(?:${verbPattern})\\s+(?:a|an|the)?\\s*(?:detailed\\s+)?([a-z\\s]{1,80})`,
    'i'
  );
  const match = input.match(pattern);

  if (!match) {
    return false;
  }

  const target = match[1]?.trim() || '';
  return docTargets.some(term => target.includes(term));
}

// Clean and trim conversation history for context
function sanitizeConversationHistory(
  history: Array<{ role: string; content: string }> = [],
  limit: number = 10
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(history)) {
    return [];
  }

  const cleaned = history
    .filter(entry => entry && typeof entry.role === 'string' && typeof entry.content === 'string')
    .map(entry => {
      const role: 'assistant' | 'user' = entry.role === 'assistant' ? 'assistant' : 'user';
      return {
        role,
        content: entry.content.trim()
      };
    })
    .filter(entry => entry.content.length > 0);

  return cleaned.slice(-limit);
}

// Build a plain text context string from conversation history
function buildHistoryContext(history: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  if (!history || history.length === 0) {
    return '';
  }

  const lines = history.map(entry => `${entry.role === 'assistant' ? 'Assistant' : 'User'}: ${entry.content}`);
  const joined = lines.join('\n');
  return `Recent conversation:\n${joined}\n`;
}

// Check if a URL is reachable and not an empty/invalid page.
async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('text/plain')) {
      const body = await response.text();
      const normalized = body.trim().toLowerCase();
      if (normalized.length < 200) {
        return false;
      }
      if (normalized.includes('page not found') || normalized.includes('not found')) {
        return false;
      }
    }

    return true;
  } catch (error: unknown) {
    console.warn('Failed to reach URL:', url, error);
    return false;
  }
}

// Replace unreachable URLs with a fallback gov.uk search link
async function ensureValidResourceLinks(text: string, fallbackQuery: string): Promise<string> {
  const normalizedText = ensureClickableLinks(text);
  const urlPattern = /https?:\/\/[^\s]+/g;
  const urls = normalizedText.match(urlPattern);

  if (!urls || urls.length === 0) {
    return normalizedText;
  }

  const fallbackUrlBase = 'https://www.gov.uk/search/all?keywords=';
  const safeQuery = encodeURIComponent(fallbackQuery && fallbackQuery.trim().length > 0 ? fallbackQuery : 'uk law guidance');
  const fallbackUrl = `${fallbackUrlBase}${safeQuery}`;

  let updatedText = normalizedText;

  for (const url of urls) {
    const reachable = await isUrlReachable(url);
    if (!reachable) {
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const replaceRegex = new RegExp(escapedUrl, 'g');
      updatedText = updatedText.replace(replaceRegex, fallbackUrl);
    }
  }

  return updatedText;
}

// Ensure all www. links are clickable (add https:// if missing)
function ensureClickableLinks(text: string): string {
  return text.replace(/(^|[\s(])((?:www\.)[^\s)]+)/gi, (fullMatch, prefix, url) => {
    const hasProtocol = /^https?:\/\//i.test(url);
    if (hasProtocol) {
      return `${prefix}${url}`;
    }
    return `${prefix}https://${url}`;
  });
}

// Strip ASCII diagram lines and boxes that Claude sometimes generates despite instructions
function stripAsciiDiagrams(text: string): string {
  if (!text) return text;
  return text
    .replace(/\|[\-\s|]+\|/g, '') // Remove ASCII boxes like |----|
    .replace(/^\s*[\-]{4,}\s*$/gm, '') // Remove standalone dash lines
    .replace(/^\s*[=]{4,}\s*$/gm, '') // Remove standalone equals lines
    .replace(/^\s*[*]{4,}\s*$/gm, '') // Remove standalone asterisk lines
    .replace(/\n{3,}/g, '\n\n') // Clean up multiple newlines
    .trim();
}

// Heuristic: does the text look truncated (unfinished)?
function looksTruncated(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/[.?!]$/.test(trimmed)) return false;
  if (/[)\]"}']$/.test(trimmed)) return false;
  if (/\b(and|or|but|because|so|to|with|without|by|for|as)\b$/i.test(trimmed)) return true;
  return true;
}

// If the LLM response is truncated, ask for a continuation
async function continueIfTruncated(
  text: string,
  systemPrompt: string = SYSTEM_PROMPT,
  model: string = MODEL
): Promise<string> {
  if (!looksTruncated(text)) return text;

  const startedAt = Date.now();
  try {
    const completion = await claudeLegalClient.messages.create({
      model,
      max_tokens: 220,
      temperature: 0.4,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Continue the response below from where it stopped. Do not repeat any text. Plain text only.\n\nResponse:\n${text}`
        }
      ]
    });
    logClaudeUsage({
      model,
      usage: (completion as any)?.usage,
      success: true,
      latencyMs: Date.now() - startedAt,
      requestType: 'continue',
    });

    const continuation = completion.content[0]?.type === 'text' ? completion.content[0].text : '';
    if (!continuation.trim()) return text;
    const separator = text.endsWith('\n') ? '' : ' ';
    return `${text}${separator}${continuation.trimStart()}`;
  } catch (error: unknown) {
    logClaudeUsage({
      model,
      success: false,
      latencyMs: Date.now() - startedAt,
      requestType: 'continue',
      error: error instanceof Error ? error.message : String(error),
    });
    console.warn('Failed to continue truncated response:', error);
    return text;
  }
}

// Call the OpenAI LLM for general legal guidance
async function callLLM(
  prompt: string,
  systemPrompt: string = SYSTEM_PROMPT,
  model: string = MODEL,
  maxTokens: number = 500
): Promise<string> {
  const startedAt = Date.now();
  try {
    const completion = await claudeLegalClient.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ]
    });
    logClaudeUsage({
      model,
      usage: (completion as any)?.usage,
      success: true,
      latencyMs: Date.now() - startedAt,
      requestType: 'legal-agent',
    });

    const rawResponse = completion.content[0]?.type === 'text' ? completion.content[0].text : "I apologize, I couldn't generate a response.";
    const cleaned = ensureClickableLinks(stripMarkdown(rawResponse));
    return await continueIfTruncated(cleaned, systemPrompt, model);
  } catch (error: unknown) {
    logClaudeUsage({
      model,
      success: false,
      latencyMs: Date.now() - startedAt,
      requestType: 'legal-agent',
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('Claude API Error:', error);
    return "Hello! I'm MymckenzieCS, but I am currently having a problem. Please try again later.";
  }
}

/**
 * LegalAgent provides procedural guidance, document support, and plain-English
 * explanations for UK litigants in person. It uses LLMs and specialized tools to
 * answer questions, generate drafts, and explain legal processes without giving legal advice.
 *
 * Usage:
 *   - Use createLegalAgent(conversationHistory, caseKeywords).invoke({ input }) for guidance or document generation.
 *   - Integrates with DocGeneratorTool and SearchTool for specialized tasks.
 *   - Ensures all responses are plain text and user-friendly.
 */
export async function createLegalAgent(
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  caseId?: string
) {
  // Prepare tools and context for the agent
  let fullHistory = conversationHistory;

  // If a caseId is provided, fetch all messages for the case from Supabase
  if (caseId) {
    try {
      const { data: messagesData, error: messagesError } = await supabaseAdmin
        .from('messages')
        .select('role, content, timestamp')
        .eq('case_id', caseId)
        .order('timestamp', { ascending: true });
      if (!messagesError && Array.isArray(messagesData)) {
        fullHistory = messagesData.map((msg: any) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content || ''
        }));
      }
    } catch (err) {
      // fallback to provided conversationHistory
    }
  }

  const trimmedHistory = sanitizeConversationHistory(fullHistory, 40); // Use more history for context
  const tools = [
    new DocGeneratorTool(),
    new SearchTool()
  ];

  const systemPrompt = SYSTEM_PROMPT;
  const maxTokensForResponse = MAX_TOKENS;

  return {
    tools,
    systemPrompt,
    /**
     * Main entry point: handles user input, selects tool or LLM, and returns response.
     */
    async invoke({ input }: { input: string }): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; sources?: Array<{ number: number; title: string; url: string }> }> {
      console.log(`\n🤖 Processing legal query: "${input}"\n`);

      try {
        const latestQuestion = (input || '').trim();

        const historyContext = buildHistoryContext(trimmedHistory);
        const modelForRequest = MODEL;
        const contextForTools = historyContext
          ? `${historyContext}\nLatest user request: ${latestQuestion}`
          : latestQuestion;
        const searchQuery = buildSearchQuery(trimmedHistory, latestQuestion, caseKeywords);

        const isGreeting = isBasicGreeting(latestQuestion)
        if (isGreeting) {
          return {
            response: "Hello! I'm MymckenzieCS. How can I help with your legal question today?",
            document_generated: false,
            guidance_provided: true,
            sources: undefined
          };
        }

        const isDefinition = isDefinitionQuery(latestQuestion)
        const wantsDraft = wantsFormalDraft(latestQuestion)
        const retrievalMode: RetrievalMode = isDefinition ? 'education' : classifyQueryMode(latestQuestion)

        // Always perform retrieval first to ground answers, even with no prior history
        const retrieval = await runTieredRetrieval(tools[1], searchQuery, retrievalMode)
        const verifiedSources = await filterReachableUrls(retrieval.sources, searchQuery)

        if (isDefinition) {
          console.log('📘 Detected definition intent, generating concise explanation...');

          const verifiedSourcesBlock = verifiedSources.length > 0
            ? `Verified sources (MUST cite these using [1], [2], [3] format):\n${verifiedSources
                .map((url, index) => `[${index + 1}] ${url}`)
                .join('\n')}\n\n`
            : 'No verified sources available. State clearly that you\'re providing general guidance without specific source citations.\n\n'
          const userPrompt = `${historyContext ? historyContext + '\n' : ''}Contextual research (internal):\n${retrieval.packet}\n\n${verifiedSourcesBlock}IMPORTANT: You MUST include citation numbers [1], [2], [3] etc. when referring to specific laws, statutes, or legal principles. Place them immediately after the relevant statement.\n\nGive the user a concise UK legal definition in a clean, organized format:

Term Name

One or two sentences explaining what it is in simple, adult-friendly language.

Key Points
• Bullet point 1 explaining a key fact
• Bullet point 2 explaining another key aspect
• Bullet point 3 if relevant

For more information, refer to [source citation if applicable]

Guidelines: Use plain text only (no markdown). Left-indent bullet points. Use "• " for bullets. Keep it clear and scannable. No URLs in the body, only numbered citations.

Question: "${latestQuestion}"`;

          const definitionStartedAt = Date.now();
          let definitionCompletion;
          try {
            definitionCompletion = await claudeLegalClient.messages.create({
              model: modelForRequest,
              max_tokens: 260,
              temperature: 0.25,
              system: systemPrompt,
              messages: [
                { role: 'user', content: userPrompt }
              ]
            });
            logClaudeUsage({
              model: modelForRequest,
              usage: (definitionCompletion as any)?.usage,
              success: true,
              latencyMs: Date.now() - definitionStartedAt,
              requestType: 'definition',
            });
          } catch (error: any) {
            logClaudeUsage({
              model: modelForRequest,
              success: false,
              latencyMs: Date.now() - definitionStartedAt,
              requestType: 'definition',
              error: error?.message || String(error),
            });
            throw error;
          }

          const conciseAnswer = definitionCompletion.content[0]?.type === 'text' ? definitionCompletion.content[0].text : '';
          const cleanedAnswer = stripMarkdown(conciseAnswer).trim();
          const validatedAnswer = (await ensureValidResourceLinks(cleanedAnswer, latestQuestion)).trim();
          const continuedAnswer = await continueIfTruncated(validatedAnswer, systemPrompt, modelForRequest);

          const cleanedText = stripAsciiDiagrams(stripUrlsFromText(stripInlineSources(continuedAnswer)))
          const guarded = applyCitationGuard(cleanedText, retrieval.packet)
          const responseText = guarded.text.trim()
          
          const shouldAttach = (shouldAttachSources(responseText) || hasBracketCitations(responseText)) && verifiedSources.length > 0
          return {
            response: responseText,
            document_generated: false,
            guidance_provided: true,
            sources: shouldAttach
              ? extractFormattedSources(responseText, verifiedSources)
              : undefined
          };
        }

        if (wantsDraft) {
          console.log('📄 Using document generator...');
          const docResult = await tools[0]._call(contextForTools);
          const continuedDoc = await continueIfTruncated(docResult, systemPrompt, modelForRequest);
          const finalDoc = ensureClickableLinks(stripMarkdown(continuedDoc))
          const text = finalDoc
          return {
            response: text,
            document_generated: true,
            guidance_provided: false,
            sources: undefined,
          };
        }

        console.log('💬 Having friendly conversation...');
        console.log('━'.repeat(60));
        console.log('🚀 STARTING DECOMPOSE-SEARCH-SYNTHESIZE-FORMULATE PIPELINE');
        console.log('━'.repeat(60));

        // STEP 1: DECOMPOSE
        const decomposed = await decomposeQuery(latestQuestion, trimmedHistory)
        console.log(`✓ Decomposed into ${decomposed.factsNeeded.length} atomic facts`)
        console.log(`  Legal area: ${decomposed.legalArea}, Type: ${decomposed.queryType}`)

        // STEP 2: SEARCH
        const retrieved = await searchSources(decomposed, tools[1], latestQuestion, caseKeywords)
        console.log(`✓ Retrieved ${retrieved.sources.length} authoritative sources`)
        console.log(`  Packet size: ${retrieved.packet.length} characters`)

        // STEP 3: SYNTHESIZE
        const synthesized = await synthesizeAnswer(retrieved, decomposed, latestQuestion, systemPrompt, MODEL)
        console.log(`✓ Synthesized answer with ${synthesized.citedSources.length} citations`)
        console.log(`  Confidence: ${synthesized.confidence}`)

        // STEP 4: FORMULATE
        const responseText = await formulateResponse(synthesized, latestQuestion, systemPrompt, MODEL)
        console.log(`✓ Formulated conversational response`)
        console.log('━'.repeat(60));

        const shouldAttach = (shouldAttachSources(responseText) || hasBracketCitations(responseText)) && retrieved.sources.length > 0
        return {
          response: responseText,
          document_generated: false,
          guidance_provided: true,
          sources: shouldAttach ? synthesized.citedSources : undefined
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '';
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? ((): number | undefined => {
                const statusValue = (error as { status?: unknown }).status;
                return typeof statusValue === 'number' ? statusValue : undefined;
              })()
            : undefined;

        if (message.includes('rate limit') || status === 429) {
          return {
            response: "⚠️ I'm experiencing high demand right now. Please try again in a moment.",
            document_generated: false,
            guidance_provided: false,
            sources: undefined
          };
        }
        throw error;
      }
    }
  };
}


/**
 * Helper to invoke the LegalAgent for a single message, returning a structured result.
 */
export async function invokeLegalAgent(
  message: string,
  threadId: string,
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const agent = await createLegalAgent(conversationHistory, caseKeywords);
  const response = await agent.invoke({ input: message });
  return {
    response: response.response,
    document_generated: response.document_generated,
    guidance_provided: response.guidance_provided,
    next_steps: [],
    sources: response.sources
  };
}
