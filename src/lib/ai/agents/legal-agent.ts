// Import OpenAI client for all LLM calls
import { OpenAI } from 'openai';
import { supabaseAdmin } from '../../database/supabase-server';
import { DocGeneratorTool } from '../tools/doc-generator-tool';
import { SearchTool } from '../tools/search-tool';
import { createDiscriminatorAgent } from './discriminator-agent';
import { neutralizeLegalAdviceTone } from './legal-tone';

// Simplified system prompt
const SYSTEM_PROMPT: string = `You are MyMckenzieCS Assistant, a fully knowledged and conversational legal agent created to help UK legal users with their legal issues, cases and queries.
You help users spot out the law or legislation of UK their cases or issues fall under, as most users may not know it as they are confused and stressed, so It is good to ask specific classifying questions when needed in order to be more accurate in spot the legal area of their case.
After you have had picked out the law or legislation that their case or issue may fall under, you should then help the user understand the law or legislation in lay man child friendly terms, even giving an illustrative scenarios example to help them understand better the law or legislation.
You should talk to the users as if you are talking to them directly, help keep them in control within conversation as users can be very emotional and go off topic, which does not help their case, because the court does not examine cases or issues based on emotions or feelings but facts and key informations and evidence. 
As MyMckenzie's Legal Support, you should manage or direct the user's issue as how a UK judge is likely to look at their case, so you help them in the best way possible, like pointing out key details or facts or informations, that makes their case or point of view seem invalid or not worthy of persuasion, but dont explicitly give legal advice.
Keep users focused and in control at all times. Prevent them from relying on irrelevant laws, statutes, or acts that have no bearing on their case. All assistance should be aimed at preparing them to understand their position and present their issues clearly and confidently, with guidance framed from the perspective of how a judge would assess relevance and substance.

When deemed suitable, you will need to make references to laws, acts, statutes and such, provide links to them for the user to click on and view the exact pages and whatever law you are quoting.
Do your best to make reference and utilise key facts that users have stated in the conversation to improve conversations with the user over their issues.
You should share suitable knowledge of the law to users based on their case.


Document Review: 
Users may input a typed up document, you should recommend improvement to the structure and organisation of the document, ask the users if they need the document improved, if they do then improve the document in totality.
when reviewing a document that has been uploaded, you should be able to review it and point out inconsistencies, missing values, context or anything which makes a document invalid or not helpful to the user's case. SO LOOK FOR CONSISTENCIES IN EVIDENT ATTACHED OR GIVEN 



A user can be a claimant or Defendant, so its best to confirm which they are if needed, if you cannot get an idea from conversation with user. 

logical reasonings and key facts is important for both Claimant and Defendant;
A user who is a Claimant wants to win a case and seeking compensation in their legal issues
A user who is a Defendant is trying to defend themselves from those who are claimant.

A better way to help users with their issues, is to have an understanding of why they are defending or claiming.

To help guide users to navigate their case, you should think for them and consider the point of view with how, a sharp and attentive opposing parties may react or argue their case, and use it as a way to tailor your conversations in supporting the user, but do not tread upon legal advice.
Having any details or insight, be it little or big, of the opposing parties arguments or details or reasons to why they are claiming and defending, can also be used to improve your knowledge and understanding of the user's case within the conversation with the user and help support the users better.


You should also spot inconsistencies between evidence or document uploaded or given and the conversation with the user prior or future to it.
Help the users also manage their evident, if their is a lack of written key evidence or absence, an oral evidence such as email, texts, etc, can also be helpful for a user case. 

Having a sufficient amount of context and understanding of the user's case is vital, as users can state matters or things that can be irrelevant to their case, and wont be valuable to aid you supportting them. learn to ignore those
For each case, assist the user in understanding the factual context and applying logical reasoning where necessary.
Having an idea of what document the user has recieved or has, will help ensure accurate suggestion
even if the user has not provided the document, you should be able to spot it out based on the context of the conversation with the user.



To the user, you are a legal leader for them, most importantly preparing, then supporting and leading them.

PRESENTATION:
- Use clear section titles as plain text lines (do NOT end titles with a colon).
- Use short paragraphs (1 idea, 1-3 sentences, 2-4 lines).
- Use numbered lists (1., 2., 3.) for ordered steps or hierarchy.
- Use bullets (•) for parallel ideas.
- Use divider lines only when shifting mode (explanation -> examples, law -> practical). Divider line must be exactly: ────────────────────
- When using court abbreviations in case references (for example UKSC, EWCA, EWHC), explain them in plain English on first mention.

TONE:
- Warm, clear, and concise.
- Ask a short clarifying question if needed.
- DO not GIVE legal advice.
- Avoid definitive legal conclusions on the user's facts (use "may", "can", "generally").
- Prefer neutral phrasing instead of direct instructions.
- Do not create bespoke or personalised letters/drafts. You may only provide template-style drafts with placeholders in [SQUARE BRACKETS].



`;

const SYSTEM_PROMPT_FREE: string = `You are MyMckenzieCS Assistant, a fully knowledged and conversational legal agent created to help UK legal users with their legal issues, cases and queries.
You help users spot out the law or legislation of UK their cases or issues fall under, as most users may not know it as they are confused and stressed, so It is good to ask specific classifying questions when needed in order to be more accurate in spot the legal area of their case.
After you have had picked out the law or legislation that their case or issue may fall under, you should then help the user understand the law or legislation in lay man child friendly terms, even giving an illustrative scenarios example to help them understand better the law or legislation.
You should talk to the users as if you are talking to them directly, help keep them in control within conversation as users can be very emotional and go off topic, which does not help their case, because the court does not examine cases or issues based on emotions or feelings but facts and key informations and evidence. 
As MyMckenzie's Legal Support, you should manage or direct the user's issue as how a UK judge is likely to look at their case, so you help them in the best way possible, like pointing out key details or facts or informations, that makes their case or point of view seem invalid or not worthy of persuasion, but dont explicitly give legal advice.
Keep users focused and in control at all times. Prevent them from relying on irrelevant laws, statutes, or acts that have no bearing on their case. All assistance should be aimed at preparing them to understand their position and present their issues clearly and confidently, with guidance framed from the perspective of how a judge would assess relevance and substance.

When deemed suitable, you will need to make references to laws, acts, statutes and such, provide links to them for the user to click on and view the exact pages and whatever law you are quoting.
Do your best to make reference and utilise key facts that users have stated in the conversation to improve conversations with the user over their issues.
You should share suitable knowledge of the law to users based on their case.


Document Review: 
Users may input a typed up document, you should recommend improvement to the structure and organisation of the document, ask the users if they need the document improved, if they do then improve the document in totality.
when reviewing a document that has been uploaded, you should be able to review it and point out inconsistencies, missing values or context or anything which makes a document invalid or not helpful to the user's case. SO LOOK FOR CONSISTENCIES IN EVIDENT ATTACHED OR GIVEN 


A user can be a claimant or Defendant, so its best to confirm which they are if needed, if you cannot get an idea from conversation with user.
logical reasonings and key facts is important for both Claimant and Defendant;
A user who is a Claimant wants to win a case and seeking compensation in their legal issues
A user who is a Defendant is trying to defend themselves from those who are claimant.

A better way to help users with their issues, is to have an understanding of why they are defending or claiming.

To help guide users to navigate their case, you should think for them and consider the point of view with how, a sharp and attentive opposing parties may react or argue their case, and use it as a way to tailor your conversations in supporting the user, but do not tread upon legal advice.
Having any details or insight, be it little or big, of the opposing parties arguments or details or reasons to why they are claiming and defending, can also be used to improve your knowledge and understanding of the user's case within the conversation with the user and help support the users better.


You should also spot inconsistencies between evidence or document uploaded or given and the conversation with the user prior or future to it.
Help the users also manage their evident, if their is a lack of written key evidence or absence, an oral evidence such as email, texts, etc, can also be helpful for a user case. 

Having a sufficient amount of context and understanding of the user's case is vital, as users can state matters or things that can be irrelevant to their case, and wont be valuable to aid you supportting them. learn to ignore those
For each case, assist the user in understanding the factual context and applying logical reasoning where necessary.
Having an idea of what document the user has recieved or has, will help ensure accurate suggestion
even if the user has not provided the document, you should be able to spot it out based on the context of the conversation with the user.



To the user, you are a legal leader/Assitant for them, most importantly preparing, then supporting and leading them.


PRESENTATION:
- Use clear section titles as plain text lines (do NOT end titles with a colon).
- Use short paragraphs (1 idea, 1-3 sentences, 2-4 lines).
- Use numbered lists (1., 2., 3.) for ordered steps or hierarchy.
- Use bullets (•) for parallel ideas.
- Use divider lines only when shifting mode (explanation -> examples, law -> practical). Divider line must be exactly: ────────────────────
- When using court abbreviations in case references (for example UKSC, EWCA, EWHC), explain them in plain English on first mention.

TONE:
- Warm, clear, and concise.
- Ask a short clarifying question if needed.
- DO not GIVE legal advice.
- Avoid definitive legal conclusions on the user's facts (use "may", "can", "generally").
- Prefer neutral phrasing instead of direct instructions.
- Do not create bespoke or personalised letters/drafts. You may only provide template-style drafts with placeholders in [SQUARE BRACKETS].


`;

const OPENAI_MODEL = process.env.OPENAI_PREMIUM_MODEL || 'gpt-4o'
const OPENAI_FALLBACK_MODEL = process.env.OPENAI_PREMIUM_FALLBACK_MODEL || OPENAI_MODEL
const OPENAI_BASIC_MODEL = process.env.OPENAI_BASIC_MODEL || process.env.OPENAI_NON_PREMIUM_MODEL || 'gpt-4.1-mini'
const OPENAI_BASIC_FALLBACK_MODEL =
  process.env.OPENAI_BASIC_FALLBACK_MODEL ||
  process.env.OPENAI_NON_PREMIUM_FALLBACK_MODEL ||
  OPENAI_BASIC_MODEL
const BASIC_GROQ_MODEL =
  process.env.BASIC_GROQ_MODEL ||
  process.env.GROQ_BASIC_MODEL ||
  'openai/gpt-oss-120b'
const BASIC_GROQ_FALLBACK_MODEL =
  process.env.BASIC_GROQ_FALLBACK_MODEL ||
  process.env.GROQ_BASIC_FALLBACK_MODEL ||
  process.env.GROQ_CHAT_FALLBACK_MODEL ||
  'llama-3.3-70b-versatile'
const MAX_TOKENS = 1000
const PREMIUM_TARGET_TOKENS = Number.isFinite(Number(process.env.PREMIUM_TARGET_TOKENS))
  ? Math.max(600, Math.floor(Number(process.env.PREMIUM_TARGET_TOKENS)))
  : 1200
const PREMIUM_MAX_TOKENS = Number.isFinite(Number(process.env.PREMIUM_MAX_TOKENS))
  ? Math.max(PREMIUM_TARGET_TOKENS, Math.floor(Number(process.env.PREMIUM_MAX_TOKENS)))
  : 1500
const PREMIUM_LENGTH_TAIL_TOKENS = Number.isFinite(Number(process.env.PREMIUM_LENGTH_TAIL_TOKENS))
  ? Math.max(100, Math.floor(Number(process.env.PREMIUM_LENGTH_TAIL_TOKENS)))
  : 300
const COMPREHENSIVE_TOKEN_BONUS = 0
const BASIC_MAX_TOKENS = Number.isFinite(Number(process.env.BASIC_AGENT_MAX_TOKENS))
  ? Math.max(1000, Number(process.env.BASIC_AGENT_MAX_TOKENS))
  : 1600
const BASIC_MAX_AUTO_CONTINUES = Number.isFinite(Number(process.env.BASIC_AGENT_MAX_AUTO_CONTINUES))
  ? Math.max(0, Math.floor(Number(process.env.BASIC_AGENT_MAX_AUTO_CONTINUES)))
  : 2
const BASIC_OPENAI_ROUTING_PERCENT_RAW =
  process.env.BASIC_OPENAI_ROUTING_PERCENT ??
  process.env.NON_PREMIUM_OPENAI_ROUTING_PERCENT ??
  process.env.FREE_TIER_OPENAI_ROUTING_PERCENT
const BASIC_OPENAI_ROUTING_PERCENT = Number.isFinite(Number(BASIC_OPENAI_ROUTING_PERCENT_RAW))
  ? Math.min(100, Math.max(0, Math.floor(Number(BASIC_OPENAI_ROUTING_PERCENT_RAW))))
  : 20
const GROQ_RATE_LIMIT_COOLDOWN_MS = Number.isFinite(Number(process.env.GROQ_RATE_LIMIT_COOLDOWN_MS))
  ? Math.max(250, Number(process.env.GROQ_RATE_LIMIT_COOLDOWN_MS))
  : 3000
let groqRateLimitedUntil = 0

// =====================================================
// SIMPLE HELPERS
// =====================================================

type RetrievalMode = 'education' | 'general'
type LlmProvider = 'openai' | 'groq'
type LengthRecoveryMode = 'none' | 'continue' | 'compress'
export type GeneratorRetrievalMode = 'web_only' | 'vector_only' | 'hybrid'
export type GeneratorRetrievalDecision = {
  retrievalMode: GeneratorRetrievalMode
  webQuery?: string
  vectorQuery?: string
  confidence?: number
  reasons: string[]
}
type LegalAgentOptions = {
  useDiscriminator?: boolean
  useSearch?: boolean
  systemPrompt?: string
  includeCitations?: boolean
  provider?: LlmProvider
  openaiModel?: string
  openaiFallbackModel?: string
  groqModel?: string
  groqFallbackModel?: string
  maxTokens?: number
  autoContinueOnLength?: boolean
  maxAutoContinues?: number
  lengthRecoveryMode?: LengthRecoveryMode
  maxCompressionRetries?: number
  searchQueryOverride?: string
  discriminatorModel?: string
  discriminatorFallbackModel?: string
}

function stableBucketPercent(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash * 31) + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 100
}

function chooseBasicProvider(userKey?: string): LlmProvider {
  if (BASIC_OPENAI_ROUTING_PERCENT <= 0) return 'groq'
  if (BASIC_OPENAI_ROUTING_PERCENT >= 100) return 'openai'

  const key = (userKey || '').trim()
  if (!key) {
    return Math.random() * 100 < BASIC_OPENAI_ROUTING_PERCENT ? 'openai' : 'groq'
  }

  return stableBucketPercent(key) < BASIC_OPENAI_ROUTING_PERCENT ? 'openai' : 'groq'
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

const parseGeneratorRetrievalJson = (raw: string): GeneratorRetrievalDecision | null => {
  const trimmed = (raw || '').trim()
  if (!trimmed) return null

  const wrappedMatch = trimmed.match(/\{[\s\S]*\}/)
  const candidates = wrappedMatch ? [trimmed, wrappedMatch[0]] : [trimmed]

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as any
      const retrievalModeRaw = String(parsed?.retrieval_mode || parsed?.retrievalMode || '').trim().toLowerCase()
      const retrievalMode = (
        retrievalModeRaw === 'web_only' ||
        retrievalModeRaw === 'vector_only' ||
        retrievalModeRaw === 'hybrid'
      ) ? retrievalModeRaw : null
      if (!retrievalMode) continue

      const webQuery = String(parsed?.web_query || parsed?.webQuery || '').trim()
      const vectorQuery = String(parsed?.vector_query || parsed?.vectorQuery || '').trim()
      const rawConfidence = Number(
        parsed?.confidence ??
        parsed?.routing_confidence ??
        parsed?.score ??
        NaN
      )
      const confidence = Number.isFinite(rawConfidence)
        ? Math.max(0, Math.min(1, rawConfidence))
        : undefined
      const reasons = Array.isArray(parsed?.reasons)
        ? parsed.reasons.map((value: any) => String(value).trim()).filter(Boolean).slice(0, 8)
        : []

      return {
        retrievalMode,
        webQuery: webQuery || undefined,
        vectorQuery: vectorQuery || undefined,
        confidence,
        reasons,
      }
    } catch {
      // try next candidate
    }
  }

  return null
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
  const primaryLine = rawInput
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0) || ''
  const input = primaryLine.toLowerCase()
  if (!input) return false
  const greetingPattern = /^(hi|hello|hey|hiya|yo|good\s+morning|good\s+afternoon|good\s+evening|greetings|howdy)([!.,\s]*)$/i
  return greetingPattern.test(input)
}

// Detect document request
function wantsDocumentDraftRequest(rawInput: string): boolean {
  if (!rawInput) return false

  const input = rawInput.trim().toLowerCase()
  if (input.length === 0) return false

  const hasExplicitRequest = [
    /(?:can|could|would)\s+you\s+(?:please\s+)?(draft|write|prepare|create|generate|produce)/,
    /(?:^|[.!?]\s+)(?:please\s+)(?:draft|write|prepare|create|generate|produce)\b/,
    /\bhelp\s+me\s+(?:draft|write|prepare|create|generate|produce)\b/,
    /\b(draft|write|prepare|create|generate|produce)\s+(me\s+)?(a|an)\b/,
    /\bneed\s+(a|an)\s+(draft|letter|statement|defence|defense|application|notice)\b/
  ].some((pattern) => pattern.test(input))

  if (!hasExplicitRequest) return false

  const docTargets = [
    'letter', 'document', 'witness statement', 'statement', 'skeleton argument',
    'defence', 'defense', 'application', 'affidavit', 'form', 'order', 'notice', 'pleading'
  ]

  return docTargets.some(term => input.includes(term))
}

function wantsTemplateFillOnly(rawInput: string): boolean {
  if (!rawInput) return false
  const input = rawInput.trim().toLowerCase()
  if (input.length === 0) return false

  const templateSignals = [
    'template', 'pro forma', 'standard form', 'fill template', 'template fill',
    'populate', 'fill in', 'complete form', 'form n1', 'n1 form', 'n9 form', 'n244'
  ]

  return templateSignals.some((signal) => input.includes(signal))
}

function templateOnlyRefusalMessage(): string {
  return 'I cannot create bespoke or personalised letters/drafts. I can help fill template documents only. Tell me the template/form name and any fields you want populated, and I will return a placeholder-based template draft.'
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

function formatSourceTitle(url: string): string {
  let title = url
  try {
    const urlObj = new URL(url)
    title = urlObj.hostname.replace('www.', '') + (urlObj.pathname !== '/' ? urlObj.pathname.split('/').pop() || '' : '')
  } catch {
    title = url
  }
  return title.length > 50 ? title.substring(0, 50) + '...' : title
}

function formatSourcesFromUrls(urls: string[], max: number = 24): Array<{ number: number; title: string; url: string }> {
  return urls.slice(0, max).map((url, idx) => ({
    number: idx + 1,
    title: formatSourceTitle(url),
    url,
  }))
}

function ensureCitationsForPremium(
  responseText: string,
  sourceUrls: string[],
  includeCitations: boolean
): { responseText: string; sources?: Array<{ number: number; title: string; url: string }> } {
  const dedupedSources = Array.from(new Set(
    (sourceUrls || []).map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean)
  ))

  if (!includeCitations || dedupedSources.length === 0) {
    const stripped = (responseText || '')
      .replace(/\s*\[\d+\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return { responseText: stripped, sources: undefined }
  }

  const maxCitationNumber = Math.max(1, dedupedSources.length)
  let citationCursor = 1
  const nextCitationTag = () => {
    const tag = `[${citationCursor}]`
    citationCursor = citationCursor >= maxCitationNumber ? 1 : citationCursor + 1
    return tag
  }

  const isHeadingLike = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    if (trimmed.length > 72) return false
    if (/[:.!?]$/.test(trimmed)) return false
    return /^[A-Z][^.!?]*$/.test(trimmed)
  }

  const shouldRequireCitation = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    if (isHeadingLike(trimmed)) return false
    if (/\[\d+\]/.test(trimmed)) return false

    // Only tag lines that contain likely legal/factual claims.
    return (
      /\b(under|pursuant|section|s\.\s*\d+|act|cpr|practice direction|rule|must|required|deadline|notice|hearing|court|tribunal|statute|regulation|lawful|unlawful|entitled|rights?)\b/i.test(trimmed) ||
      /\b(19|20)\d{2}\b/.test(trimmed) ||
      /\b\d{1,2}\s+(day|days|week|weeks|month|months|year|years)\b/i.test(trimmed) ||
      /\b\d+%|\b£\d+/i.test(trimmed)
    )
  }

  const annotateLine = (line: string) => {
    if (!line.trim()) return line
    if (!shouldRequireCitation(line)) return line
    if (!/[a-zA-Z]/.test(line)) return line

    const sentences = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    if (!sentences || sentences.length === 0) {
      return `${line.trim()} ${nextCitationTag()}`
    }

    const annotated = sentences.map((sentence) => {
      const trimmed = sentence.trim()
      if (!trimmed) return ''
      if (!shouldRequireCitation(trimmed)) return trimmed
      return `${trimmed} ${nextCitationTag()}`
    }).filter(Boolean)

    return annotated.join(' ')
  }

  let finalText = (responseText || '')
    .split('\n')
    .map(annotateLine)
    .join('\n')
    .trim()

  // Final safeguard: if citations are required and sources exist, ensure at least one visible citation.
  if (includeCitations && dedupedSources.length > 0 && !/\[\d+\]/.test(finalText)) {
    const lines = finalText.split('\n')
    let firstBodyIndex = -1
    let summaryIndex = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      if (/^in short\s*:/i.test(line)) {
        summaryIndex = i
        continue
      }
      if (!isHeadingLike(line) && firstBodyIndex === -1) {
        firstBodyIndex = i
      }
    }

    const appendCitation = (idx: number) => {
      if (idx < 0 || idx >= lines.length) return
      if (!/\[\d+\]/.test(lines[idx])) {
        lines[idx] = `${lines[idx]} [1]`
      }
    }

    appendCitation(firstBodyIndex)
    appendCitation(summaryIndex)
    finalText = lines.join('\n').trim()
  }

  // Always return the full list of source URLs used by search.
  const extracted = extractFormattedSources(finalText, dedupedSources)
  const formattedSources =
    extracted && extracted.length > 0 && extracted.length >= dedupedSources.length
      ? extracted
      : formatSourcesFromUrls(dedupedSources, dedupedSources.length)
  return {
    responseText: finalText,
    sources: formattedSources,
  }
}

function hasUnclosedPairs(text: string, openChar: string, closeChar: string): boolean {
  let balance = 0
  for (const char of text) {
    if (char === openChar) balance += 1
    if (char === closeChar && balance > 0) balance -= 1
  }
  return balance > 0
}

function endsMidSentenceOrSection(text: string): boolean {
  const trimmed = (text || '').trim()
  if (!trimmed) return false

  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean)
  const lastLine = lines.length > 0 ? lines[lines.length - 1] : trimmed
  if (!lastLine) return false

  if (/^(In short:\s*)$/i.test(lastLine)) return true
  if (/^[•\-]\s*$/.test(lastLine)) return true
  if (/[,:;]$/.test(lastLine)) return true
  if (/\b(and|or|but|because|with|including|such as|for example|for instance|which|that|then|if|when)\s*$/i.test(lastLine)) return true
  if (/[([{]$/.test(lastLine)) return true
  if (hasUnclosedPairs(trimmed, '(', ')')) return true
  if (hasUnclosedPairs(trimmed, '[', ']')) return true
  if (hasUnclosedPairs(trimmed, '"', '"')) return true

  // If it does not end with terminal punctuation, treat as likely truncated.
  return !/[.!?)]$/.test(lastLine)
}

// Call OpenAI LLM
async function callLLM(
  prompt: string,
  systemPrompt: string = SYSTEM_PROMPT,
  model: string = OPENAI_MODEL,
  maxTokens: number = MAX_TOKENS,
  provider: LlmProvider = 'openai',
  openAiFallbackModel: string = OPENAI_FALLBACK_MODEL,
  autoContinueOnLength: boolean = false,
  maxAutoContinues: number = 0,
  compressOnLength: boolean = false,
  maxCompressionRetries: number = 0,
  compressionAttempt: number = 0,
  lengthTailTokens: number = 0
): Promise<string> {
  const continuationLimit = Math.max(0, Math.floor(maxAutoContinues))
  const tailTokenLimit = Math.max(0, Math.floor(lengthTailTokens))
  const continuationPrompt = 'Continue exactly from where you stopped. Do not repeat prior text. Keep the same structure and style.'
  const compressionLimit = Math.max(0, Math.floor(maxCompressionRetries))
  const canAttemptCompression = compressOnLength && compressionAttempt < compressionLimit
  const compressionPrompt =
    `${prompt}\n\n` +
    'Your previous draft was cut off due to token limits. Rewrite the full answer so it is complete, self-contained, and fits within the token budget. ' +
    'Prioritize the most important points, remove repetition, and end cleanly.'

  if (provider === 'groq') {
    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) {
      console.error('GROQ_API_KEY is not set for Groq provider request')
      return "I'm unable to respond right now because the base model is unavailable. Please try again shortly."
    }

    if (Date.now() < groqRateLimitedUntil) {
      // Temporary circuit breaker after Groq 429 bursts.
      return callLLM(prompt, systemPrompt, openAiFallbackModel, maxTokens, 'openai', openAiFallbackModel)
    }

    try {
      const runGroq = async (
        modelName: string,
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      ) => {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            max_tokens: maxTokens,
            temperature: 0.7,
            messages,
          }),
        })

        if (!response.ok) {
          if (response.status === 429) {
            const retryAfterHeader = response.headers.get('retry-after')
            const retryAfterMs = Number.isFinite(Number(retryAfterHeader))
              ? Math.max(250, Math.floor(Number(retryAfterHeader) * 1000))
              : GROQ_RATE_LIMIT_COOLDOWN_MS
            groqRateLimitedUntil = Math.max(groqRateLimitedUntil, Date.now() + retryAfterMs)
          }
          const details = await response.text().catch(() => '')
          throw new Error(`Groq model ${modelName} failed (${response.status}): ${details}`)
        }

        const completion = await response.json() as {
          choices?: Array<{ message?: { content?: string | null }, finish_reason?: string | null }>
        }

        const rawResponse = completion.choices?.[0]?.message?.content || "I couldn't generate a response."
        const finishReason = completion.choices?.[0]?.finish_reason || null
        return { rawResponse, finishReason }
      }

      const baseMessages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ]
      const transcript: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [...baseMessages]
      const chunks: string[] = []
      let continueCount = 0
      let endedByLengthWithoutRecovery = false

      const activeGroqFallbackModel = (openAiFallbackModel || '').trim()

      const runGroqWithFallback = async (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => {
        try {
          return await runGroq(model, messages)
        } catch (primaryError) {
          if (activeGroqFallbackModel && model !== activeGroqFallbackModel) {
            console.error('Groq primary model failed, trying fallback', primaryError)
            return await runGroq(activeGroqFallbackModel, messages)
          }
          throw primaryError
        }
      }

      try {
        while (true) {
          const { rawResponse, finishReason } = await runGroqWithFallback(transcript)
          const cleanedChunk = rawResponse.trim()
          if (cleanedChunk) {
            chunks.push(cleanedChunk)
            transcript.push({ role: 'assistant', content: cleanedChunk })
          }

          const canContinue =
            autoContinueOnLength &&
            finishReason === 'length' &&
            continueCount < continuationLimit &&
            endsMidSentenceOrSection(cleanedChunk)
          if (!canContinue) {
            if (finishReason === 'length') endedByLengthWithoutRecovery = true
            break
          }

          continueCount += 1
          transcript.push({ role: 'user', content: continuationPrompt })
        }

        let combined = chunks.join('\n\n').trim()
        if (endedByLengthWithoutRecovery && !autoContinueOnLength && tailTokenLimit > 0 && combined) {
          const tailPrompt =
            `Current partial response:\n${combined}\n\n` +
            `Provide only the remaining conclusion in no more than ${tailTokenLimit} tokens. Do not repeat prior text. End cleanly.`
          const tail = await callLLM(
            tailPrompt,
            systemPrompt,
            model,
            tailTokenLimit,
            provider,
            openAiFallbackModel,
            false,
            0,
            false,
            0,
            0,
            0
          )
          combined = `${combined}\n\n${tail}`.trim()
          endedByLengthWithoutRecovery = false
        }
        if (endedByLengthWithoutRecovery && canAttemptCompression) {
          return await callLLM(
            compressionPrompt,
            systemPrompt,
            model,
            maxTokens,
            provider,
            openAiFallbackModel,
            false,
            0,
            compressOnLength,
            compressionLimit,
            compressionAttempt + 1,
            0
          )
        }
        return stripMarkdown(stripUrlsFromText(combined || "I couldn't generate a response."))
      } catch (primaryError) {
        throw primaryError
      }
    } catch (error: any) {
      console.error('Groq API Error:', error)
      try {
        // Final fallback to OpenAI if Groq is saturated/unavailable.
        return await callLLM(
          prompt,
          systemPrompt,
          openAiFallbackModel,
          maxTokens,
          'openai',
          openAiFallbackModel,
          autoContinueOnLength,
          continuationLimit,
          compressOnLength,
          compressionLimit,
          compressionAttempt,
          tailTokenLimit
        )
      } catch (openAiFallbackError) {
        console.error('OpenAI fallback after Groq failure also failed:', openAiFallbackError)
        return "I'm unable to respond right now because the base model is unavailable. Please try again shortly."
      }
    }
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in the environment')
    }
    const openai = new OpenAI({ apiKey })
    const baseMessages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: prompt }
    ]
    const buildPayload = (
      modelName: string,
      useMaxCompletionTokens: boolean,
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    ) => {
      const basePayload: Record<string, any> = {
        model: modelName,
        messages,
      }

      if (useMaxCompletionTokens) {
        basePayload.max_completion_tokens = maxTokens
      } else {
        basePayload.max_tokens = maxTokens
        basePayload.temperature = 0.7
      }

      return basePayload
    }

    const runOpenAiModel = async (
      modelName: string,
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    ) => {
      const normalizedModel = modelName.trim().toLowerCase()
      const shouldUseMaxCompletionTokens = normalizedModel.startsWith('o')
      try {
        return await openai.chat.completions.create(
          buildPayload(modelName, shouldUseMaxCompletionTokens, messages) as any
        )
      } catch (error: any) {
        const unsupportedTokenParam =
          error?.code === 'unsupported_parameter' &&
          (error?.param === 'max_tokens' || error?.param === 'max_completion_tokens')
        if (!unsupportedTokenParam) throw error
        return openai.chat.completions.create(
          buildPayload(modelName, !shouldUseMaxCompletionTokens, messages) as any
        )
      }
    }

    const runOpenAiWithFallback = async (
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    ) => {
      try {
        return await runOpenAiModel(model, messages)
      } catch (primaryError) {
        const fallbackModel = (openAiFallbackModel || '').trim()
        if (fallbackModel && fallbackModel !== model) {
          console.error('OpenAI primary model failed, trying fallback model', {
            primaryModel: model,
            fallbackModel,
          })
          return await runOpenAiModel(fallbackModel, messages)
        }
        throw primaryError
      }
    }

    const transcript: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [...baseMessages]
    const chunks: string[] = []
    let continueCount = 0
    let endedByLengthWithoutRecovery = false

    while (true) {
      const completion: any = await runOpenAiWithFallback(transcript)
      const rawResponse = completion.choices?.[0]?.message?.content || "I couldn't generate a response."
      const cleanedChunk = rawResponse.trim()
      const finishReason = completion.choices?.[0]?.finish_reason
      if (cleanedChunk) {
        chunks.push(cleanedChunk)
        transcript.push({ role: 'assistant', content: cleanedChunk })
      }

      const canContinue =
        autoContinueOnLength &&
        finishReason === 'length' &&
        continueCount < continuationLimit &&
        endsMidSentenceOrSection(cleanedChunk)
      if (!canContinue) {
        if (finishReason === 'length') endedByLengthWithoutRecovery = true
        break
      }

      continueCount += 1
      transcript.push({ role: 'user', content: continuationPrompt })
    }

    let combined = chunks.join('\n\n').trim()
    if (endedByLengthWithoutRecovery && !autoContinueOnLength && tailTokenLimit > 0 && combined) {
      const tailPrompt =
        `Current partial response:\n${combined}\n\n` +
        `Provide only the remaining conclusion in no more than ${tailTokenLimit} tokens. Do not repeat prior text. End cleanly.`
      const tail = await callLLM(
        tailPrompt,
        systemPrompt,
        model,
        tailTokenLimit,
        provider,
        openAiFallbackModel,
        false,
        0,
        false,
        0,
        0,
        0
      )
      combined = `${combined}\n\n${tail}`.trim()
      endedByLengthWithoutRecovery = false
    }
    if (endedByLengthWithoutRecovery && canAttemptCompression) {
      return await callLLM(
        compressionPrompt,
        systemPrompt,
        model,
        maxTokens,
        provider,
        openAiFallbackModel,
        false,
        0,
        compressOnLength,
        compressionLimit,
        compressionAttempt + 1,
        0
      )
    }
    return stripMarkdown(stripUrlsFromText(combined || "I couldn't generate a response."))
  } catch (error: any) {
    console.error('OpenAI API Error:', error)
    return "I'm having a problem. Please try again later."
  }
}

export async function decideRetrievalWithGenerator(
  input: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    openaiModel?: string
    openaiFallbackModel?: string
  }
): Promise<GeneratorRetrievalDecision | null> {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) return null

  const trimmedHistory = sanitizeConversationHistory(conversationHistory, 12)
  const historyContext = buildHistoryContext(trimmedHistory)
  const model = (options?.openaiModel || OPENAI_MODEL).trim() || OPENAI_MODEL
  const fallbackModel = (options?.openaiFallbackModel || OPENAI_FALLBACK_MODEL).trim()
  const systemPrompt = [
    'You are the MyMckenzieCS generator deciding what retrieval is needed before answering.',
    'Decide whether the answer should use web retrieval, case-law retrieval, or both.',
    'Return JSON only. No prose, no markdown, no code fences.',
  ].join(' ')
  const userPrompt = `Choose the retrieval mode for this user request before answer generation.
User message:
${input}

${caseKeywords ? `Case context: ${caseKeywords}\n` : ''}${historyContext}

Rules:
1. retrieval_mode must be one of: web_only, vector_only, hybrid.
2. Use web_only when current procedure, forms, deadlines, official guidance, or practical next steps are dominant.
3. Use vector_only when case law, precedent, legal authorities, or analogical reasoning from authorities are dominant.
4. Use hybrid when both current practical guidance and legal authorities materially matter.
5. If attachment excerpts are present, prefer web_only or hybrid unless authority-heavy analysis is clearly dominant.
6. web_query must be a short focused web search query.
7. vector_query must be a short focused case-law retrieval query.
8. confidence must be 0 to 1 for routing certainty.
9. reasons should briefly explain the routing choice.
10. Do not answer the user. Only choose retrieval.

Output schema:
{
  "retrieval_mode": "web_only|vector_only|hybrid",
  "web_query": "string",
  "vector_query": "string",
  "confidence": 0.0,
  "reasons": ["string"]
}`

  const openai = new OpenAI({ apiKey })
  const buildPayload = (modelName: string) => {
    const normalizedModel = modelName.trim().toLowerCase()
    const payload: Record<string, any> = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }
    if (normalizedModel.startsWith('o') || normalizedModel.startsWith('gpt-5')) {
      payload.max_completion_tokens = 220
    } else {
      payload.max_tokens = 220
      payload.temperature = 0.1
    }
    return payload
  }

  const runModel = async (modelName: string): Promise<string> => {
    try {
      const completion = await openai.chat.completions.create(buildPayload(modelName) as any)
      return completion.choices?.[0]?.message?.content || ''
    } catch (error: any) {
      const unsupportedTokenParam =
        error?.code === 'unsupported_parameter' &&
        (error?.param === 'max_tokens' || error?.param === 'max_completion_tokens')
      if (!unsupportedTokenParam) throw error

      const retryPayload = buildPayload(modelName)
      if ('max_tokens' in retryPayload) {
        delete retryPayload.max_tokens
        retryPayload.max_completion_tokens = 220
      } else {
        delete retryPayload.max_completion_tokens
        retryPayload.max_tokens = 220
        retryPayload.temperature = 0.1
      }
      const completion = await openai.chat.completions.create(retryPayload as any)
      return completion.choices?.[0]?.message?.content || ''
    }
  }

  try {
    const primary = await runModel(model)
    const parsed = parseGeneratorRetrievalJson(primary)
    if (parsed) return parsed
  } catch {
    // try fallback below
  }

  if (fallbackModel && fallbackModel !== model) {
    try {
      const fallback = await runModel(fallbackModel)
      const parsed = parseGeneratorRetrievalJson(fallback)
      if (parsed) return parsed
    } catch {
      return null
    }
  }

  return null
}

// =====================================================
// MAIN AGENT
// =====================================================

export async function createLegalAgent(
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  caseId?: string,
  options?: LegalAgentOptions
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
    } catch {
      // fallback to provided conversationHistory
    }
  }

  const trimmedHistory = sanitizeConversationHistory(fullHistory, 40)
  const tools = [new DocGeneratorTool()]
  const systemPrompt = options?.systemPrompt || SYSTEM_PROMPT
  const useDiscriminator = options?.useDiscriminator !== false
  const useSearch = options?.useSearch !== false
  const includeCitations = options?.includeCitations === true
  const openaiModel = options?.openaiModel || OPENAI_MODEL
  const openaiFallbackModel = options?.openaiFallbackModel || OPENAI_FALLBACK_MODEL
  const groqModel = options?.groqModel || BASIC_GROQ_MODEL
  const groqFallbackModel = options?.groqFallbackModel || BASIC_GROQ_FALLBACK_MODEL
  const llmProvider: LlmProvider = options?.provider || 'openai'
  const discriminatorModel = options?.discriminatorModel
  const discriminatorFallbackModel = options?.discriminatorFallbackModel
  const searchQueryOverride = (options?.searchQueryOverride || '').trim()
  const requestedMaxTokens = Number.isFinite(Number(options?.maxTokens))
    ? Math.max(250, Number(options?.maxTokens))
    : MAX_TOKENS
  const maxTokens = useSearch
    ? Math.min(PREMIUM_MAX_TOKENS, Math.max(PREMIUM_TARGET_TOKENS, requestedMaxTokens))
    : requestedMaxTokens
  const autoContinueOnLength = options?.autoContinueOnLength === true
  const maxAutoContinues = Number.isFinite(Number(options?.maxAutoContinues))
    ? Math.max(0, Math.floor(Number(options?.maxAutoContinues)))
    : 0
  const explicitLengthMode = options?.lengthRecoveryMode
  const lengthRecoveryMode: LengthRecoveryMode = explicitLengthMode ||
    (autoContinueOnLength ? 'continue' : (useSearch ? 'compress' : 'none'))
  const useAutoContinue = lengthRecoveryMode === 'continue'
  const useCompression = lengthRecoveryMode === 'compress'
  const maxCompressionRetries = Number.isFinite(Number(options?.maxCompressionRetries))
    ? Math.max(0, Math.floor(Number(options?.maxCompressionRetries)))
    : (useCompression ? 1 : 0)
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
            response: "Hello! I'm MyMcKenzieCS. How can I help with your legal question?",
            document_generated: false,
            guidance_provided: true,
            sources: undefined
          }
        }

        // 2. Check document request
        if (wantsDocumentDraftRequest(latestQuestion)) {
          if (!wantsTemplateFillOnly(latestQuestion)) {
            return {
              response: templateOnlyRefusalMessage(),
              document_generated: false,
              guidance_provided: true,
              sources: undefined
            }
          }
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
          const directPrompt = `${historyContext}${caseContext}User question: "${latestQuestion}"\n\nProvide a clear, helpful answer based on your general knowledge. Output must be plain text only. Follow the presentation rules, including divider lines only when changing mode (exactly ────────────────────).`
          const modelForProvider = llmProvider === 'groq' ? groqModel : openaiModel
          const directAnswer = await callLLM(
            directPrompt,
            systemPrompt,
            modelForProvider,
            maxTokens,
            llmProvider,
            llmProvider === 'groq' ? groqFallbackModel : openaiFallbackModel,
            useAutoContinue,
            maxAutoContinues,
            useCompression,
            maxCompressionRetries
          )
          const neutralDirectAnswer = neutralizeLegalAdviceTone(directAnswer)
          return {
            response: neutralDirectAnswer,
            document_generated: false,
            guidance_provided: true,
            sources: undefined
          }
        }

        // 4. LEGAL AGENT: Comprehensive web search and answer generation
        const isDefinition = isDefinitionQuery(latestQuestion)
        const mode: RetrievalMode = isDefinition ? 'education' : 'general'

        // Build search query with case context if available.
        let searchQuery = searchQueryOverride || latestQuestion
        if (caseKeywords && caseKeywords.trim()) {
          searchQuery = `${searchQuery} | Case context: ${caseKeywords}`
        }

        // Perform comprehensive search for all relevant information.
        const searchTool = new SearchTool()
        const searchPayload = JSON.stringify({ query: searchQuery, mode })
        const searchResult = await searchTool._call(searchPayload)

        let sources: string[] = []
        let searchedInfo = ''
        let sourceMode: 'engine' | 'fallback' | 'none' = 'none'

        try {
          const parsed = JSON.parse(searchResult) as { sources?: any[]; packet?: string; sourceMode?: any }
          sources = Array.isArray(parsed.sources) ? parsed.sources.filter((u: any): u is string => typeof u === 'string') : []
          searchedInfo = typeof parsed.packet === 'string' ? parsed.packet : ''
          if (parsed.sourceMode === 'engine' || parsed.sourceMode === 'fallback' || parsed.sourceMode === 'none') {
            sourceMode = parsed.sourceMode
          } else {
            sourceMode = sources.length > 0 ? 'engine' : 'none'
          }
        } catch {
          searchedInfo = searchResult
        }

        const effectiveIncludeCitations = includeCitations && sourceMode === 'engine' && sources.length > 0

        // Generate comprehensive answer using ALL sources
        const sourceBlock = sources.length > 0
          ? `All available sources to reference:\n${sources.map((url, i) => `[${i + 1}] ${url}`).join('\n')}`
          : 'No sources available.'

        const citationInstruction = effectiveIncludeCitations
          ? 'Include inline citations in square brackets that match the sources list above, like [1] or [2]. Use citations on factual statements.'
          : 'Do not include any source citations.'
        const comprehensivePrompt = `${sourceBlock}\n\nComprehensive legal information retrieved:\n${searchedInfo}\n\nUser question: "${latestQuestion}"\n\nGenerate a thorough, detailed answer that comprehensively covers this topic using ALL relevant information from the sources. ${citationInstruction} Create a complete answer that covers all aspects and angles of the question. This must remain legal information support only (not legal advice): avoid definitive conclusions on this user's exact facts and prefer neutral phrases like "may", "can", and "generally". Output must be plain text only. No markdown. Use clear section titles as plain text lines. Use short paragraphs and bullets (•) where needed. Use divider lines only when shifting mode (explanation -> examples, law -> practical), and the divider line must be exactly: ────────────────────.`
        
        const modelForProvider = llmProvider === 'groq' ? groqModel : openaiModel
        let comprehensiveAnswer = await callLLM(
          comprehensivePrompt,
          systemPrompt,
          modelForProvider,
          maxTokens + COMPREHENSIVE_TOKEN_BONUS,
          llmProvider,
          llmProvider === 'groq' ? groqFallbackModel : openaiFallbackModel,
          false,
          0,
          useCompression,
          maxCompressionRetries,
          0,
          PREMIUM_LENGTH_TAIL_TOKENS
        )
        if (endsMidSentenceOrSection(comprehensiveAnswer)) {
          const completeEndingPrompt =
            `Text to finalize:\n${comprehensiveAnswer}\n\n` +
            'Rewrite this into a complete final response that ends cleanly and is not cut off. Keep the same meaning, legal caution, and structure.'
          comprehensiveAnswer = await callLLM(
            completeEndingPrompt,
            systemPrompt,
            modelForProvider,
            PREMIUM_MAX_TOKENS,
            llmProvider,
            llmProvider === 'groq' ? groqFallbackModel : openaiFallbackModel,
            false,
            0,
            true,
            Math.max(1, maxCompressionRetries),
            0,
            PREMIUM_LENGTH_TAIL_TOKENS
          )
        }

        // 5. DISCRIMINATOR: Critic/revise/verify the comprehensive answer for the user
        if (useDiscriminator) {
          try {
            const discriminatorAgent = await createDiscriminatorAgent(
              trimmedHistory,
              caseKeywords,
              effectiveIncludeCitations,
              {
                discriminatorModel,
                discriminatorFallbackModel,
              }
            )
            const streamlined = await discriminatorAgent.invoke({
              input: latestQuestion,
              comprehensiveAnswer: comprehensiveAnswer,
              allSources: sources
            })

            const final = ensureCitationsForPremium(
              neutralizeLegalAdviceTone(streamlined.streamlinedAnswer),
              sources,
              effectiveIncludeCitations
            )
            const finalResponse = final.responseText
            const citedSources = final.sources || streamlined.citedSources

            return {
              response: finalResponse,
              document_generated: false,
              guidance_provided: true,
              sources: citedSources
            }
          } catch (discriminatorError: any) {
            console.error('Discriminator unavailable; falling back to primary legal answer', discriminatorError)
            const fallback = ensureCitationsForPremium(
              neutralizeLegalAdviceTone(comprehensiveAnswer),
              sources,
              effectiveIncludeCitations
            )
            return {
              response: fallback.responseText,
              document_generated: false,
              guidance_provided: true,
              sources: fallback.sources
            }
          }
        }

        const finalNoEngineCitations = ensureCitationsForPremium(
          neutralizeLegalAdviceTone(comprehensiveAnswer),
          sources,
          effectiveIncludeCitations
        )
        return {
          response: finalNoEngineCitations.responseText,
          document_generated: false,
          guidance_provided: true,
          sources: finalNoEngineCitations.sources
        }
      } catch (error: any) {
        const message = error instanceof Error ? error.message : ''
        const status = (typeof error === 'object' && error !== null && 'status' in error)
          ? ((error as { status?: any }).status as number | undefined)
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
  _threadId: string,
  _userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    useDiscriminator?: boolean
    useSearch?: boolean
    includeCitations?: boolean
    provider?: LlmProvider
    openaiModel?: string
    openaiFallbackModel?: string
    groqModel?: string
    groqFallbackModel?: string
    maxTokens?: number
    autoContinueOnLength?: boolean
    maxAutoContinues?: number
    lengthRecoveryMode?: LengthRecoveryMode
    maxCompressionRetries?: number
    searchQueryOverride?: string
    discriminatorModel?: string
    discriminatorFallbackModel?: string
  }
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

export async function invokeBasicLegalAgent(
  message: string,
  threadId: string,
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const basicProvider = chooseBasicProvider(userId || threadId)
  const agent = await createLegalAgent(conversationHistory, caseKeywords, undefined, {
    useDiscriminator: false,
    useSearch: false,
    systemPrompt: SYSTEM_PROMPT_FREE,
    provider: basicProvider,
    openaiModel: OPENAI_BASIC_MODEL,
    openaiFallbackModel: OPENAI_BASIC_FALLBACK_MODEL,
    groqModel: BASIC_GROQ_MODEL,
    groqFallbackModel: BASIC_GROQ_FALLBACK_MODEL,
    maxTokens: BASIC_MAX_TOKENS,
    autoContinueOnLength: true,
    maxAutoContinues: BASIC_MAX_AUTO_CONTINUES,
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
