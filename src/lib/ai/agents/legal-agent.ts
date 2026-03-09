// Provider clients used by the active agent paths
import Anthropic from '@anthropic-ai/sdk';
import { OpenAI } from 'openai';
import { supabaseAdmin } from '../../database/supabase-server';
import { DocGeneratorTool } from '../tools/doc-generator-tool';
import { SearchTool, type SearchEngine, type SearchToolOutput } from '../tools/search-tool';
import { neutralizeLegalAdviceTone } from './legal-tone';
import { searchByText } from '@/lib/vector/milvus';
import { logClaudeUsage } from '@/lib/utils/claude-usage';

// Simplified system prompt
const SYSTEM_PROMPT: string = `You are MyMckenzieCS Assistant, a highly knowledgeable and conversational legal assistant and Mckenzie friend created to help UK legal users with their legal issues, cases and queries.
You help users spot out the law or legislation of UK their cases or issues fall under, as most users may not know it as they are confused and stressed, so It is good to ask specific classifying questions when needed in order to be more accurate in spot the legal area of their case.
After you have had picked out the law or legislation that their case or issue may fall under, you should then help the user understand the law or legislation in lay man child friendly terms, even giving an illustrative scenarios example to help them understand better the law or legislation.
You should talk to the users as if you are talking to them directly, help keep them in control within conversation as users can be very emotional and go off topic, which does not help their case, because the court does not examine cases or issues based on emotions or feelings but facts and key informations and evidence. 
As MyMckenzie's Legal Support, you should manage or direct the user's issue as how a UK judge is likely to look at their case, so you help them in the best way possible, like pointing out key details or facts or informations, that makes their case or point of view seem invalid or not worthy of persuasion, but dont explicitly give legal advice.
Keep users focused and in control at all times. Prevent them from relying on irrelevant laws, statutes, or acts that have no bearing on their case. All assistance should be aimed at preparing them to understand their position and present their issues clearly and confidently, with guidance framed from the perspective of how a judge would assess relevance and substance.

When deemed suitable, you MAY need to make references to laws, acts, statutes and such.
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
Use plain text only.

FORMAT RULES:
- Use a short standalone plain-text line for a main section title when the topic changes materially.
- Use a short standalone plain-text line for a subheading only when a smaller branch is needed inside a section.
- Use numbered lists for ordered steps, sequence, hierarchy, priority, or court process.
- Use bullet points for parallel facts, examples, evidence, options, or warnings.
- Use the divider line only when changing mode, for example law -> practical, explanation -> example, or issue -> next steps.
- Do not use ALL CAPS headings.
- Do not end headings with a colon.
- Do not use tables.
- Do not use markdown headings like #, ##, or ###.
- Do not use markdown bold, italics, or markdown links.
- Use short paragraphs only, with 1 idea and no more than 3 sentences.
- Use a list only when it genuinely improves clarity.
- End with a one-sentence compression line starting with "In short:" when a summary would help.
- When using court abbreviations in case references (for example UKSC, EWCA, EWHC), explain them in plain English on first mention.



TONE:
- Warm, clear, and concise.
- Ask a short clarifying question if needed.
- DO not GIVE legal advice.
- Avoid definitive legal conclusions on the user's facts.
- Prefer hedged language such as "may", "might", "could", "can", "likely", "in general", "it may help to", "you may wish to", or "some judges may".
- Prefer neutral phrasing instead of direct instructions.
- Do not say "you should", "you must", "you need to", "the court will", "the judge will", "you will win", or "you will lose" unless directly quoting a rule or source. Rephrase those into neutral support language.
- Do not create bespoke or personalised letters/drafts. You may only provide template-style drafts with placeholders in [SQUARE BRACKETS].
- Do not say you chose, called, used, or had access to tools yourself. If search or authority context is present, treat it as context already provided to you.

`;

const SYSTEM_PROMPT_FREE: string = `You are MyMckenzieCS Assistant, a highly knowledgeable and conversational legal assistant and Mckenzie friend created to help UK legal users with their legal issues, cases and queries.
You help users spot out the law or legislation of UK their cases or issues fall under, as most users may not know it as they are confused and stressed, so It is good to ask specific classifying questions when needed in order to be more accurate in spot the legal area of their case.
After you have had picked out the law or legislation that their case or issue may fall under, you should then help the user understand the law or legislation in lay man child friendly terms, even giving an illustrative scenarios example to help them understand better the law or legislation.
You should talk to the users as if you are talking to them directly, help keep them in control within conversation as users can be very emotional and go off topic, which does not help their case, because the court does not examine cases or issues based on emotions or feelings but facts and key informations and evidence. 
As MyMckenzie's Legal Support, you should manage or direct the user's issue as how a UK judge is likely to look at their case, so you help them in the best way possible, like pointing out key details or facts or informations, that makes their case or point of view seem invalid or not worthy of persuasion, but dont explicitly give legal advice.
Keep users focused and in control at all times. Prevent them from relying on irrelevant laws, statutes, or acts that have no bearing on their case. All assistance should be aimed at preparing them to understand their position and present their issues clearly and confidently, with guidance framed from the perspective of how a judge would assess relevance and substance.

When deemed suitable, you will need to make references to laws, acts, statutes and such.
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



To the user, you are a legal leader/Assistant for them, most importantly preparing, then supporting and leading them.


PRESENTATION:
Use plain text only.

FORMAT RULES:
- Use a short standalone plain-text line for a main section title when the topic changes materially.
- Use a short standalone plain-text line for a subheading only when a smaller branch is needed inside a section.
- Use numbered lists for ordered steps, sequence, hierarchy, priority, or court process.
- Use bullet points for parallel facts, examples, evidence, options, or warnings.
- Use the divider line only when changing mode, for example law -> practical, explanation -> example, or issue -> next steps.
- Do not use ALL CAPS headings.
- Do not end headings with a colon.
- Do not use tables.
- Do not use markdown headings like #, ##, or ###.
- Do not use markdown bold, italics, or markdown links.
- Use short paragraphs only, with 1 idea and no more than 3 sentences.
- Use a list only when it genuinely improves clarity.
- End with a one-sentence compression line starting with "In short:" when a summary would help.
- When using court abbreviations in case references (for example UKSC, EWCA, EWHC), explain them in plain English on first mention.


TONE:
- Warm, clear, and concise.
- Ask a short clarifying question if needed.
- DO not GIVE legal advice.
- Avoid definitive legal conclusions on the user's facts.
- Prefer hedged language such as "may", "might", "could", "can", "likely", "in general", "it may help to", "you may wish to", or "some judges may".
- Prefer neutral phrasing instead of direct instructions.
- Do not say "you should", "you must", "you need to", "the court will", "the judge will", "you will win", or "you will lose" unless directly quoting a rule or source. Rephrase those into neutral support language.
- Do not create bespoke or personalised letters/drafts. You may only provide template-style drafts with placeholders in [SQUARE BRACKETS].
- Do not say you chose, called, used, or had access to tools yourself. If search or authority context is present, treat it as context already provided to you.


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
const PREMIUM_PLUS_ANTHROPIC_MODEL =
  process.env.PREMIUM_PLUS_ANTHROPIC_MODEL ||
  'claude-opus-4-6'
const PREMIUM_PLUS_ANTHROPIC_FALLBACK_MODEL =
  process.env.PREMIUM_PLUS_ANTHROPIC_FALLBACK_MODEL ||
  'claude-sonnet-4-6'
const MAX_TOKENS = 1000
const PREMIUM_TARGET_TOKENS = Number.isFinite(Number(process.env.PREMIUM_TARGET_TOKENS))
  ? Math.max(600, Math.floor(Number(process.env.PREMIUM_TARGET_TOKENS)))
  : 1200
const PREMIUM_MAX_TOKENS = Number.isFinite(Number(process.env.PREMIUM_MAX_TOKENS))
  ? Math.max(PREMIUM_TARGET_TOKENS, Math.floor(Number(process.env.PREMIUM_MAX_TOKENS)))
  : 1500
const PREMIUM_PLUS_CONCISE_TARGET_TOKENS = Number.isFinite(Number(process.env.PREMIUM_PLUS_CONCISE_TARGET_TOKENS))
  ? Math.max(450, Math.floor(Number(process.env.PREMIUM_PLUS_CONCISE_TARGET_TOKENS)))
  : 900
const PREMIUM_PLUS_CONCISE_MAX_TOKENS = Number.isFinite(Number(process.env.PREMIUM_PLUS_CONCISE_MAX_TOKENS))
  ? Math.max(PREMIUM_PLUS_CONCISE_TARGET_TOKENS, Math.floor(Number(process.env.PREMIUM_PLUS_CONCISE_MAX_TOKENS)))
  : 1200
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

export type LegalSearchMode = 'education' | 'procedure' | 'case_specific' | 'document_review' | 'general'
type LlmProvider = 'openai' | 'groq'
type LengthRecoveryMode = 'none' | 'continue' | 'compress'
export type PremiumPlusToolName =
  | 'direct_knowledge'
  | 'web_search_education'
  | 'web_search_procedure'
  | 'web_search_case_specific'
  | 'web_search_document_review'
  | 'web_search_general'
  | 'case_law_suggestions'
  | 'case_law_rag'

const buildLengthInstruction = (_question: string): string => {
  return 'Keep the answer disciplined and useful: usually about 220 to 450 words, with no more than 5 short sections or 6 bullets unless genuinely necessary.'
}
export type PremiumPlusToolSelection = {
  tool: PremiumPlusToolName
  query?: string
  rationale?: string
}
type LegalAgentOptions = {
  useSearch?: boolean
  autoDecideSearch?: boolean
  caseAccessUserId?: string
  systemPrompt?: string
  includeCitations?: boolean
  memoryContext?: string
  historyLimit?: number
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
  searchModeOverride?: LegalSearchMode
  searchEngineOverride?: SearchEngine
  targetTokensFloor?: number
  maxTokensCap?: number
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

const resolveConversationHistoryLimit = (limit?: number) =>
  Number.isFinite(Number(limit))
    ? Math.max(1, Math.floor(Number(limit)))
    : 40

// Build history context
function buildHistoryContext(history: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  if (!history || history.length === 0) return ''

  const lines = history.map(entry => `${entry.role === 'assistant' ? 'Assistant' : 'User'}: ${entry.content}`)
  return `Recent conversation:\n${lines.join('\n')}\n`
}

const normalizeLegalSearchMode = (value: any): LegalSearchMode | null => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  switch (normalized) {
    case 'education':
      return 'education'
    case 'procedure':
      return 'procedure'
    case 'case_specific':
    case 'case':
      return 'case_specific'
    case 'document_review':
    case 'documents':
      return 'document_review'
    case 'general':
      return 'general'
    default:
      return null
  }
}

type PremiumSearchDecision = {
  useSearch: boolean
  searchMode: LegalSearchMode
  searchQuery: string
  confidence: number | null
  reasons: string[]
}

const buildSearchQueryWithCaseContext = (query: string, caseKeywords?: string) => {
  const baseQuery = String(query || '').trim()
  if (!baseQuery) return ''
  if (/\|\s*case context:/i.test(baseQuery)) return baseQuery
  return caseKeywords && caseKeywords.trim()
    ? `${baseQuery} | Case context: ${caseKeywords.trim()}`
    : baseQuery
}

const extractJsonObject = (raw: string) => {
  const text = String(raw || '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return text
  return text.slice(start, end + 1)
}

const parsePremiumSearchDecision = (
  raw: string,
  fallback: PremiumSearchDecision
): PremiumSearchDecision => {
  try {
    const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, any>
    const retrievalMode = String(parsed?.retrieval_mode || '').trim().toLowerCase()
    const explicitUseSearch = typeof parsed?.use_search === 'boolean'
      ? parsed.use_search
      : retrievalMode
        ? retrievalMode !== 'direct'
        : null
    const searchMode =
      normalizeLegalSearchMode(parsed?.search_mode) ||
      normalizeLegalSearchMode(parsed?.mode) ||
      fallback.searchMode
    const searchQuery = String(parsed?.search_query || parsed?.web_query || parsed?.webQuery || '').trim()
    const confidence = Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : fallback.confidence
    const reasons = Array.isArray(parsed?.reasons)
      ? parsed.reasons.map((item) => String(item || '').trim()).filter(Boolean)
      : fallback.reasons

    return {
      useSearch: explicitUseSearch ?? fallback.useSearch,
      searchMode,
      searchQuery: searchQuery || fallback.searchQuery,
      confidence,
      reasons: reasons.length > 0 ? reasons : fallback.reasons,
    }
  } catch {
    return fallback
  }
}

const decidePremiumSearch = async (options: {
  latestQuestion: string
  systemPrompt: string
  provider: LlmProvider
  model: string
  fallbackModel: string
  memoryContext?: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  caseKeywords?: string
  searchModeOverride?: LegalSearchMode
  searchQueryOverride?: string
}): Promise<PremiumSearchDecision> => {
  if (isDefinitionQuery(options.latestQuestion) && !options.searchQueryOverride && !options.searchModeOverride) {
    return {
      useSearch: false,
      searchMode: 'education',
      searchQuery: '',
      confidence: 0.9,
      reasons: ['stable-definition-direct-answer'],
    }
  }

  const fallback: PremiumSearchDecision = {
    useSearch: true,
    searchMode: options.searchModeOverride || (isDefinitionQuery(options.latestQuestion) ? 'education' : 'general'),
    searchQuery: buildSearchQueryWithCaseContext(
      options.searchQueryOverride || options.latestQuestion,
      options.caseKeywords
    ),
    confidence: null,
    reasons: ['fallback-search-default'],
  }

  const memoryContext = typeof options.memoryContext === 'string' && options.memoryContext.trim()
    ? `${options.memoryContext.trim()}\n\n`
    : ''
  const historyContext = buildHistoryContext(options.history)
  const caseContext = options.caseKeywords ? `Case context: ${options.caseKeywords}\n` : ''
  const routingPrompt =
    `${memoryContext}${historyContext}${caseContext}` +
    `Latest user question: "${options.latestQuestion}"\n\n` +
    'Choose the retrieval mode for this user request before answer generation.\n' +
    'Return JSON only.\n' +
    'Prefer a direct answer with no web search when the question is simple, stable, definitional, explanatory, or answerable from general legal knowledge.\n' +
    'Use web search when current official guidance, procedure, forms, deadlines, or practical process verification would materially improve accuracy.\n' +
    'Use this JSON schema:\n' +
    '{"use_search": boolean, "search_mode": "education|procedure|case_specific|document_review|general", "search_query": string, "confidence": number, "reasons": string[]}\n' +
    'Compatibility note: if you use older keys like retrieval_mode or web_query, keep them equivalent to the schema above.'

  const rawDecision = await callLLM(
    routingPrompt,
    options.systemPrompt,
    options.model,
    220,
    options.provider,
    options.fallbackModel
  )

  return parsePremiumSearchDecision(rawDecision, fallback)
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
    /^what\s+does\b.*\bmean\b/,
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
    .replace(/^#{1,6}\s+/gm, '')
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
  fallbackModel: string = OPENAI_FALLBACK_MODEL,
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
      return callLLM(prompt, systemPrompt, fallbackModel, maxTokens, 'openai', fallbackModel)
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

      const activeGroqFallbackModel = (fallbackModel || '').trim()

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
            fallbackModel,
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
            fallbackModel,
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
          fallbackModel,
          maxTokens,
          'openai',
          fallbackModel,
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
        const activeFallbackModel = (fallbackModel || '').trim()
        if (activeFallbackModel && activeFallbackModel !== model) {
          console.error('OpenAI primary model failed, trying fallback model', {
            primaryModel: model,
            fallbackModel: activeFallbackModel,
          })
          return await runOpenAiModel(activeFallbackModel, messages)
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
        fallbackModel,
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
        fallbackModel,
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
    console.error('LLM API Error:', error)
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
  options?: LegalAgentOptions
) {
  let fullHistory = conversationHistory
  const caseAccessUserId =
    typeof options?.caseAccessUserId === 'string' && options.caseAccessUserId.trim()
      ? options.caseAccessUserId.trim()
      : ''

  // Only hydrate case-scoped history when the caller proves the case belongs to this user.
  if (caseId && caseAccessUserId) {
    try {
      const { data: caseRow, error: caseError } = await supabaseAdmin
        .from('cases')
        .select('id')
        .eq('id', caseId)
        .eq('user_id', caseAccessUserId)
        .is('deleted_at', null)
        .maybeSingle()

      if (!caseError && caseRow?.id) {
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
      }
    } catch {
      // fallback to provided conversationHistory
    }
  }

  const trimmedHistory = sanitizeConversationHistory(fullHistory, resolveConversationHistoryLimit(options?.historyLimit))
  const tools = [new DocGeneratorTool()]
  const systemPrompt = options?.systemPrompt || SYSTEM_PROMPT
  const memoryContext = typeof options?.memoryContext === 'string' && options.memoryContext.trim()
    ? `${options.memoryContext.trim()}\n\n`
    : ''
  const explicitUseSearch = typeof options?.useSearch === 'boolean' ? options.useSearch : undefined
  const autoDecideSearch = options?.autoDecideSearch === true && explicitUseSearch === undefined
  const includeCitations = options?.includeCitations === true
  const openaiModel = options?.openaiModel || OPENAI_MODEL
  const openaiFallbackModel = options?.openaiFallbackModel || OPENAI_FALLBACK_MODEL
  const groqModel = options?.groqModel || BASIC_GROQ_MODEL
  const groqFallbackModel = options?.groqFallbackModel || BASIC_GROQ_FALLBACK_MODEL
  const llmProvider: LlmProvider = options?.provider || 'openai'
  const searchQueryOverride = (options?.searchQueryOverride || '').trim()
  const searchModeOverride = options?.searchModeOverride
  const searchEngineOverride = options?.searchEngineOverride || 'auto'
  const requestedMaxTokens = Number.isFinite(Number(options?.maxTokens))
    ? Math.max(250, Number(options?.maxTokens))
    : MAX_TOKENS
  const targetTokensFloor = Number.isFinite(Number(options?.targetTokensFloor))
    ? Math.max(250, Number(options?.targetTokensFloor))
    : PREMIUM_TARGET_TOKENS
  const maxTokensCap = Number.isFinite(Number(options?.maxTokensCap))
    ? Math.max(targetTokensFloor, Number(options?.maxTokensCap))
    : PREMIUM_MAX_TOKENS
  const directMaxTokens = requestedMaxTokens
  const searchMaxTokens = Math.min(maxTokensCap, Math.max(targetTokensFloor, requestedMaxTokens))
  const autoContinueOnLength = options?.autoContinueOnLength === true
  const maxAutoContinues = Number.isFinite(Number(options?.maxAutoContinues))
    ? Math.max(0, Math.floor(Number(options?.maxAutoContinues)))
    : 0
  const explicitLengthMode = options?.lengthRecoveryMode
  const assumedSearchForLengthRecovery = explicitUseSearch === true || autoDecideSearch
  const lengthRecoveryMode: LengthRecoveryMode = explicitLengthMode ||
    (autoContinueOnLength ? 'continue' : (assumedSearchForLengthRecovery ? 'compress' : 'none'))
  const useAutoContinue = lengthRecoveryMode === 'continue'
  const useCompression = lengthRecoveryMode === 'compress'
  const maxCompressionRetries = Number.isFinite(Number(options?.maxCompressionRetries))
    ? Math.max(0, Math.floor(Number(options?.maxCompressionRetries)))
    : (useCompression ? 1 : 0)
  return {
    tools,
    systemPrompt,
    /**
     * Flow: greeting → document → answer
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
          const contextForTools = `${memoryContext}${buildHistoryContext(trimmedHistory)}${latestQuestion}`
          const docResult = await tools[0]._call(contextForTools)
          return {
            response: stripMarkdown(docResult).trim(),
            document_generated: true,
            guidance_provided: false,
            sources: undefined
          }
        }

        const historyContext = buildHistoryContext(trimmedHistory)
        const caseContext = caseKeywords ? `Case context: ${caseKeywords}\n` : ''
        const fallbackSearchMode: LegalSearchMode = searchModeOverride || (isDefinitionQuery(latestQuestion) ? 'education' : 'general')
        let shouldUseSearch = explicitUseSearch ?? true
        let resolvedSearchMode = fallbackSearchMode
        let resolvedSearchQuery = buildSearchQueryWithCaseContext(
          searchQueryOverride || latestQuestion,
          caseKeywords
        )

        if (autoDecideSearch) {
          const modelForProvider =
            llmProvider === 'groq'
              ? groqModel
              : openaiModel
          const fallbackModelForProvider =
            llmProvider === 'groq'
              ? groqFallbackModel
              : openaiFallbackModel
          const premiumSearchDecision = await decidePremiumSearch({
            latestQuestion,
            systemPrompt,
            provider: llmProvider,
            model: modelForProvider,
            fallbackModel: fallbackModelForProvider,
            memoryContext: options?.memoryContext,
            history: trimmedHistory,
            caseKeywords,
            searchModeOverride,
            searchQueryOverride,
          })
          shouldUseSearch = premiumSearchDecision.useSearch
          resolvedSearchMode = searchModeOverride || premiumSearchDecision.searchMode
          resolvedSearchQuery = buildSearchQueryWithCaseContext(
            searchQueryOverride || premiumSearchDecision.searchQuery || latestQuestion,
            caseKeywords
          )
        }

        // 3. LEGAL AGENT: Direct answer (no search)
        if (!shouldUseSearch) {
          const lengthInstruction = buildLengthInstruction(latestQuestion)
          const directPrompt = `${memoryContext}${historyContext}${caseContext}User question: "${latestQuestion}"\n\nProvide a clear, helpful answer based on your general knowledge. ${lengthInstruction} Output must be plain text only. Follow the presentation rules. Use standalone heading lines instead of markdown headings, and do not use tables, markdown bold, italics, or markdown links.`
          const modelForProvider =
            llmProvider === 'groq'
              ? groqModel
              : openaiModel
          const fallbackModelForProvider =
            llmProvider === 'groq'
              ? groqFallbackModel
              : openaiFallbackModel
          const directAnswer = await callLLM(
            directPrompt,
            systemPrompt,
            modelForProvider,
            directMaxTokens,
            llmProvider,
            fallbackModelForProvider,
            useAutoContinue,
            maxAutoContinues,
            useCompression,
            maxCompressionRetries
          )
          const finalDirectAnswer = neutralizeLegalAdviceTone(directAnswer)
          return {
            response: finalDirectAnswer,
            document_generated: false,
            guidance_provided: true,
            sources: undefined
          }
        }

        // 4. LEGAL AGENT: Comprehensive web search and answer generation
        const mode: LegalSearchMode = resolvedSearchMode

        // Perform comprehensive search for all relevant information.
        const searchTool = new SearchTool({ engine: searchEngineOverride })
        const searchPayload = JSON.stringify({ query: resolvedSearchQuery, mode, engine: searchEngineOverride })
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
        const lengthInstruction = buildLengthInstruction(latestQuestion)
        const comprehensivePrompt = `${sourceBlock}\n\nComprehensive legal information retrieved:\n${searchedInfo}\n\n${memoryContext}${buildHistoryContext(trimmedHistory)}${caseContext}User question: "${latestQuestion}"\n\nGenerate a clear answer that covers the user's actual question using the retrieved information. ${lengthInstruction} ${citationInstruction} This must remain legal information support only (not legal advice): avoid definitive conclusions on this user's exact facts and prefer neutral phrases like "may", "can", and "generally". Output must be plain text only. Follow the presentation rules. Use standalone heading lines instead of markdown headings, and do not use tables, markdown bold, italics, or markdown links.`
        
        const modelForProvider =
          llmProvider === 'groq'
            ? groqModel
            : openaiModel
        const fallbackModelForProvider =
          llmProvider === 'groq'
            ? groqFallbackModel
            : openaiFallbackModel
        let comprehensiveAnswer = await callLLM(
          comprehensivePrompt,
          systemPrompt,
          modelForProvider,
          searchMaxTokens + COMPREHENSIVE_TOKEN_BONUS,
          llmProvider,
          fallbackModelForProvider,
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
            fallbackModelForProvider,
            false,
            0,
            true,
            Math.max(1, maxCompressionRetries),
            0,
            PREMIUM_LENGTH_TAIL_TOKENS
          )
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
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: LegalAgentOptions
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const agent = await createLegalAgent(conversationHistory, caseKeywords, undefined, {
    ...options,
    caseAccessUserId: options?.caseAccessUserId || userId,
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

export async function invokePremiumLegalAgent(
  message: string,
  threadId: string,
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    useSearch?: boolean
    autoDecideSearch?: boolean
    memoryContext?: string
    historyLimit?: number
    searchQueryOverride?: string
    searchModeOverride?: LegalSearchMode
    searchEngineOverride?: SearchEngine
    openaiModel?: string
    openaiFallbackModel?: string
    maxTokens?: number
    maxCompressionRetries?: number
  }
  ): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  return invokeLegalAgent(message, threadId, userId, conversationHistory, caseKeywords, {
    useSearch: options?.useSearch,
    autoDecideSearch: options?.autoDecideSearch ?? options?.useSearch === undefined,
    includeCitations: false,
    memoryContext: options?.memoryContext,
    historyLimit: options?.historyLimit,
    provider: 'openai',
    openaiModel: options?.openaiModel || OPENAI_MODEL,
    openaiFallbackModel: options?.openaiFallbackModel || OPENAI_FALLBACK_MODEL,
    maxTokens: options?.maxTokens,
    autoContinueOnLength: true,
    maxAutoContinues: 1,
    maxCompressionRetries: options?.maxCompressionRetries,
    searchQueryOverride: options?.searchQueryOverride,
    searchModeOverride: options?.searchModeOverride,
    searchEngineOverride: options?.searchEngineOverride || 'brave',
  })
}

export async function invokePremiumLegalAgentStream(
  message: string,
  _threadId: string,
  _userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    useSearch?: boolean
    autoDecideSearch?: boolean
    memoryContext?: string
    historyLimit?: number
    searchQueryOverride?: string
    searchModeOverride?: LegalSearchMode
    searchEngineOverride?: SearchEngine
    openaiModel?: string
    openaiFallbackModel?: string
    maxTokens?: number
    maxCompressionRetries?: number
    onStatus?: (status: string) => void
    onToken?: (chunk: string) => void
  }
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) {
    return {
      response: "I'm unable to respond right now because the Premium model is unavailable. Please try again shortly.",
      document_generated: false,
      guidance_provided: false,
      next_steps: [],
      sources: undefined,
    }
  }

  const trimmedHistory = sanitizeConversationHistory(conversationHistory, resolveConversationHistoryLimit(options?.historyLimit))
  const systemPrompt = SYSTEM_PROMPT
  const memoryContext = typeof options?.memoryContext === 'string' && options.memoryContext.trim()
    ? `${options.memoryContext.trim()}\n\n`
    : ''
  const explicitUseSearch = typeof options?.useSearch === 'boolean' ? options.useSearch : undefined
  const autoDecideSearch = (options?.autoDecideSearch ?? true) && explicitUseSearch === undefined
  const openaiModel = options?.openaiModel || OPENAI_MODEL
  const openaiFallbackModel = options?.openaiFallbackModel || OPENAI_FALLBACK_MODEL
  const searchQueryOverride = (options?.searchQueryOverride || '').trim()
  const searchModeOverride = options?.searchModeOverride
  const searchEngineOverride = options?.searchEngineOverride || 'brave'
  const requestedMaxTokens = Number.isFinite(Number(options?.maxTokens))
    ? Math.max(250, Number(options?.maxTokens))
    : MAX_TOKENS
  const directMaxTokens = requestedMaxTokens
  const searchMaxTokens = Math.min(PREMIUM_MAX_TOKENS, Math.max(PREMIUM_TARGET_TOKENS, requestedMaxTokens))
  let lastStatus = ''
  const emitStatus = (status: string) => {
    const normalizedStatus = String(status || '').trim()
    if (!normalizedStatus || normalizedStatus === lastStatus) return
    lastStatus = normalizedStatus
    options?.onStatus?.(normalizedStatus)
  }

  const openai = new OpenAI({ apiKey })
  const continuationPrompt = 'Continue exactly from where you stopped. Do not repeat prior text. Keep the same structure and style.'
  const continuationLimit = 1

  const streamOpenAiText = async (prompt: string, tokenLimit: number): Promise<string> => {
    const transcript: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ]
    const chunks: string[] = []
    let continueCount = 0

    const buildPayload = (
      modelName: string,
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    ) => {
      const normalizedModel = modelName.trim().toLowerCase()
      const payload: Record<string, any> = {
        model: modelName,
        messages,
        stream: true,
      }
      if (normalizedModel.startsWith('o') || normalizedModel.startsWith('gpt-5')) {
        payload.max_completion_tokens = tokenLimit
      } else {
        payload.max_tokens = tokenLimit
        payload.temperature = 0.7
      }
      return payload
    }

    const runModel = async (
      modelName: string,
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    ) => {
      let streamedText = ''
      let finishReason: string | null = null
      try {
        const stream = await openai.chat.completions.create(buildPayload(modelName, messages) as any)
        for await (const chunk of stream as unknown as AsyncIterable<any>) {
          const delta = chunk?.choices?.[0]?.delta?.content || ''
          if (delta) {
            streamedText += delta
            options?.onToken?.(delta)
          }
          const candidateFinish = chunk?.choices?.[0]?.finish_reason
          if (candidateFinish) finishReason = candidateFinish
        }
        return {
          rawResponse: streamedText || "I couldn't generate a response.",
          finishReason,
        }
      } catch (error: any) {
        const unsupportedTokenParam =
          error?.code === 'unsupported_parameter' &&
          (error?.param === 'max_tokens' || error?.param === 'max_completion_tokens')
        if (!unsupportedTokenParam) throw error

        const retryPayload = buildPayload(modelName, messages)
        if ('max_tokens' in retryPayload) {
          delete retryPayload.max_tokens
          retryPayload.max_completion_tokens = tokenLimit
        } else {
          delete retryPayload.max_completion_tokens
          retryPayload.max_tokens = tokenLimit
          retryPayload.temperature = 0.7
        }

        const retryStream = await openai.chat.completions.create(retryPayload as any)
        streamedText = ''
        finishReason = null
        for await (const chunk of retryStream as unknown as AsyncIterable<any>) {
          const delta = chunk?.choices?.[0]?.delta?.content || ''
          if (delta) {
            streamedText += delta
            options?.onToken?.(delta)
          }
          const candidateFinish = chunk?.choices?.[0]?.finish_reason
          if (candidateFinish) finishReason = candidateFinish
        }
        return {
          rawResponse: streamedText || "I couldn't generate a response.",
          finishReason,
        }
      }
    }

    const runWithFallback = async (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => {
      try {
        return await runModel(openaiModel, messages)
      } catch (primaryError) {
        if (openaiFallbackModel && openaiFallbackModel !== openaiModel) {
          console.error('OpenAI streaming primary model failed, trying fallback model', {
            primaryModel: openaiModel,
            fallbackModel: openaiFallbackModel,
          })
          return await runModel(openaiFallbackModel, messages)
        }
        throw primaryError
      }
    }

    while (true) {
      const { rawResponse, finishReason } = await runWithFallback(transcript)
      const cleanedChunk = rawResponse.trim()
      if (cleanedChunk) {
        chunks.push(cleanedChunk)
        transcript.push({ role: 'assistant', content: cleanedChunk })
      }

      const canContinue =
        finishReason === 'length' &&
        continueCount < continuationLimit &&
        endsMidSentenceOrSection(cleanedChunk)
      if (!canContinue) break

      continueCount += 1
      transcript.push({ role: 'user', content: continuationPrompt })
    }

    return stripMarkdown(stripUrlsFromText(chunks.join('\n\n').trim() || "I couldn't generate a response."))
  }

  const latestQuestion = (message || '').trim()

  if (isBasicGreeting(latestQuestion)) {
    return {
      response: "Hello! I'm MyMcKenzieCS. How can I help with your legal question?",
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: undefined,
    }
  }

  if (wantsDocumentDraftRequest(latestQuestion)) {
    if (!wantsTemplateFillOnly(latestQuestion)) {
      return {
        response: templateOnlyRefusalMessage(),
        document_generated: false,
        guidance_provided: true,
        next_steps: [],
        sources: undefined,
      }
    }
    const contextForTools = `${memoryContext}${buildHistoryContext(trimmedHistory)}${latestQuestion}`
    const docResult = await new DocGeneratorTool()._call(contextForTools)
    return {
      response: stripMarkdown(docResult).trim(),
      document_generated: true,
      guidance_provided: false,
      next_steps: [],
      sources: undefined,
    }
  }

  const historyContext = buildHistoryContext(trimmedHistory)
  const caseContext = caseKeywords ? `Case context: ${caseKeywords}\n` : ''
  const fallbackSearchMode: LegalSearchMode = searchModeOverride || (isDefinitionQuery(latestQuestion) ? 'education' : 'general')
  let shouldUseSearch = explicitUseSearch ?? true
  let resolvedSearchMode = fallbackSearchMode
  let resolvedSearchQuery = buildSearchQueryWithCaseContext(
    searchQueryOverride || latestQuestion,
    caseKeywords
  )

  emitStatus('Thinking...')
  if (autoDecideSearch) {
    const premiumSearchDecision = await decidePremiumSearch({
      latestQuestion,
      systemPrompt,
      provider: 'openai',
      model: openaiModel,
      fallbackModel: openaiFallbackModel,
      memoryContext: options?.memoryContext,
      history: trimmedHistory,
      caseKeywords,
      searchModeOverride,
      searchQueryOverride,
    })
    shouldUseSearch = premiumSearchDecision.useSearch
    resolvedSearchMode = searchModeOverride || premiumSearchDecision.searchMode
    resolvedSearchQuery = buildSearchQueryWithCaseContext(
      searchQueryOverride || premiumSearchDecision.searchQuery || latestQuestion,
      caseKeywords
    )
  }

  if (!shouldUseSearch) {
    const lengthInstruction = buildLengthInstruction(latestQuestion)
    const directPrompt = `${memoryContext}${historyContext}${caseContext}User question: "${latestQuestion}"\n\nProvide a clear, helpful answer based on your general knowledge. ${lengthInstruction} Output must be plain text only. Follow the presentation rules. Use standalone heading lines instead of markdown headings, and do not use tables, markdown bold, italics, or markdown links.`
    emitStatus('Drafting answer...')
    return {
      response: neutralizeLegalAdviceTone(await streamOpenAiText(directPrompt, directMaxTokens)),
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: undefined,
    }
  }

  const mode: LegalSearchMode = resolvedSearchMode

  const searchTool = new SearchTool({ engine: searchEngineOverride })
  const searchPayload = JSON.stringify({ query: resolvedSearchQuery, mode, engine: searchEngineOverride })
  emitStatus('Checking web sources...')
  const searchResult = await searchTool._call(searchPayload)

  let sources: string[] = []
  let searchedInfo = ''
  try {
    const parsed = JSON.parse(searchResult) as { sources?: any[]; packet?: string }
    sources = Array.isArray(parsed.sources) ? parsed.sources.filter((u: any): u is string => typeof u === 'string') : []
    searchedInfo = typeof parsed.packet === 'string' ? parsed.packet : ''
  } catch {
    searchedInfo = searchResult
  }

  const sourceBlock = sources.length > 0
    ? `All available sources to reference:\n${sources.map((url, i) => `[${i + 1}] ${url}`).join('\n')}`
    : 'No sources available.'
  const lengthInstruction = buildLengthInstruction(latestQuestion)
  const comprehensivePrompt = `${sourceBlock}\n\nComprehensive legal information retrieved:\n${searchedInfo}\n\n${memoryContext}${buildHistoryContext(trimmedHistory)}${caseContext}User question: "${latestQuestion}"\n\nGenerate a clear answer that covers the user's actual question using the retrieved information. ${lengthInstruction} Do not include any source citations. This must remain legal information support only (not legal advice): avoid definitive conclusions on this user's exact facts and prefer neutral phrases like "may", "can", and "generally". Output must be plain text only. Follow the presentation rules. Use standalone heading lines instead of markdown headings, and do not use tables, markdown bold, italics, or markdown links.`

  emitStatus('Drafting answer...')
  return {
    response: neutralizeLegalAdviceTone(await streamOpenAiText(comprehensivePrompt, searchMaxTokens)),
    document_generated: false,
    guidance_provided: true,
    next_steps: [],
    sources: undefined,
  }
}

type PremiumPlusToolExecutionResult = {
  content: string
  sources?: string[]
}

type PremiumPlusToolLoopState = {
  messages: PremiumPlusAnthropicMessage[]
  sources: string[]
  directResponse: string
  toolsUsed: string[]
  systemPrompt: string
}

const PREMIUM_PLUS_TOOL_LOOP_LIMIT = 4
const PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS = 700
const PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHING_BETA = 'prompt-caching-2024-07-31'
const PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHE_TTL = '5m'

const PREMIUM_PLUS_TOOL_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

TOOL EXECUTION
- You have access to web_search and case_law_search.
- You may answer directly when the question is simple enough to answer or based on previous conversation facts.
- Use web_search to gather any external information required to provide a better and complete answer, especially official government guidance, current court forms, procedural deadlines, or news on legislative changes.
- Use web_search to find practical "real-world" context from relevant sources to help you answer the user.
- You may call both tools when both materially help
- you may use both tools whenever a user's query will require both information from the web and a "real-life" example from case laws.
- Use case_law_search to find specific legal authorities, precedents, and detailed accounts of how parties acted in past cases to use as an examples.
- If it helps a user to understand how their own actions or cases might be viewed by a judge, prefer case_law_search to provide an illustrative scenario of a similar person or case.
- Prefer using a tool whenever it improves the accuracy, depth, freshness, or educational value of your support.
- If you are unsure whether retrieval would help, prefer the tool that best verifies the uncertain point.
- After tool results are returned, answer the user directly in plain text.
- Do not mention tools, tool calls, internal routing, or function names to the user.
- Treat tool outputs as context already provided to you.
- If a tool returns a complex legal ruling, translate it into child-friendly terms before presenting to the user.`

const PREMIUM_PLUS_ANTHROPIC_TOOLS = [
  {
    name: 'web_search',
    description: 'Search current web sources for external knowledge, legal guidance, procedure, forms, deadlines, practical or useful context.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        mode: {
          type: 'string',
          enum: ['education', 'procedure', 'case_specific', 'document_review', 'general'],
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'case_law_search',
    description: 'Retrieve case-law authorities, summaries, and extracts relevant to the user conversation or query.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        scope: {
          type: 'string',
          enum: ['suggestions', 'analysis', 'both'],
        },
        limit: { type: 'integer', minimum: 1, maximum: 5 },
      },
      required: ['query'],
    },
  },
] as const

type PremiumPlusAnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | Array<Record<string, any>>
}

const premiumPlusCompact = (value: string) => value.replace(/\s+/g, ' ').trim()
const premiumPlusTruncate = (value: string, maxChars: number) =>
  value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 1))}…`
const premiumPlusFirstDefinedString = (...values: any[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const createPremiumPlusAnthropic = () => {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set for Premium+ tool calling')
  }
  return new Anthropic({ apiKey })
}

const premiumPlusPromptCachingEnabled = () =>
  (process.env.PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHING || 'true').trim().toLowerCase() !== 'false'

const buildPremiumPlusAnthropicSystemBlocks = (systemPrompt: string, promptCachingEnabled: boolean) =>
  promptCachingEnabled
    ? [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: {
            type: 'ephemeral',
            ttl: PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHE_TTL,
          },
        },
      ]
    : systemPrompt

const buildPremiumPlusAnthropicTools = (promptCachingEnabled: boolean) =>
  PREMIUM_PLUS_ANTHROPIC_TOOLS.map((tool, index) =>
    promptCachingEnabled && index === PREMIUM_PLUS_ANTHROPIC_TOOLS.length - 1
      ? {
          ...tool,
          cache_control: {
            type: 'ephemeral',
            ttl: PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHE_TTL,
          },
        }
      : { ...tool }
  )

const isPremiumPlusPromptCachingUnsupportedError = (error: any) => {
  const details = [
    typeof error?.message === 'string' ? error.message : '',
    typeof error?.error?.message === 'string' ? error.error.message : '',
    typeof error?.response?.data?.error?.message === 'string' ? error.response.data.error.message : '',
  ]
    .join(' ')
    .toLowerCase()

  return (
    details.includes('prompt-caching') ||
    details.includes('cache_control') ||
    details.includes('anthropic-beta') ||
    details.includes('unsupported beta') ||
    details.includes('invalid beta')
  )
}

const buildPremiumPlusAnthropicSystemPrompt = (contextLines: string[] = []) =>
  contextLines.length > 0
    ? `${PREMIUM_PLUS_TOOL_SYSTEM_PROMPT}\n\nContext\n${contextLines.join('\n\n')}`
    : PREMIUM_PLUS_TOOL_SYSTEM_PROMPT

const buildPremiumPlusContextLines = (options: {
  conversationHistory?: Array<{ role: string; content: string }>
  caseKeywords?: string
  memoryContext?: string
  historyLimit?: number
}) => {
  const trimmedHistory = sanitizeConversationHistory(
    options.conversationHistory,
    resolveConversationHistoryLimit(options.historyLimit)
  )
  const historyContext = buildHistoryContext(trimmedHistory)
  const contextLines: string[] = []

  if (options.caseKeywords?.trim()) {
    contextLines.push(`Case context: ${options.caseKeywords.trim()}`)
  }
  if (options.memoryContext?.trim()) {
    contextLines.push(options.memoryContext.trim())
  }
  if (historyContext) {
    contextLines.push(historyContext.trim())
  }

  return contextLines
}

const buildPremiumPlusDirectSystemPrompt = (options: {
  conversationHistory?: Array<{ role: string; content: string }>
  caseKeywords?: string
  memoryContext?: string
  historyLimit?: number
}) => {
  const contextLines = buildPremiumPlusContextLines(options)
  return contextLines.length > 0
    ? `${SYSTEM_PROMPT}\n\nContext\n${contextLines.join('\n\n')}`
    : SYSTEM_PROMPT
}

const shouldPreferPremiumPlusDirectAnswer = (rawQuestion: string) => {
  const latestQuestion = premiumPlusCompact(rawQuestion.toLowerCase())
  if (!latestQuestion || !isDefinitionQuery(rawQuestion)) return false

  const retrievalSignals = [
    /\bcase law\b/,
    /\bprecedent\b/,
    /\bauthorit(?:y|ies)\b/,
    /\bcurrent\b/,
    /\blatest\b/,
    /\btoday\b/,
    /\bdeadline\b/,
    /\bprocedure\b/,
    /\bform\b/,
    /\bcitation\b/,
    /\bsource\b/,
    /\bverify\b/,
    /\bcheck\b/,
    /\bappeal\b/,
    /\btribunal\b/,
    /\bcourt fee\b/,
    /\bgov\.uk\b/,
  ]

  return !retrievalSignals.some((pattern) => pattern.test(latestQuestion))
}

const callPremiumPlusDirectText = async (
  message: string,
  options: {
    anthropicModel: string
    anthropicFallbackModel: string
    conversationHistory?: Array<{ role: string; content: string }>
    caseKeywords?: string
    memoryContext?: string
    historyLimit?: number
    maxTokens?: number
  }
) => {
  const client = createPremiumPlusAnthropic()
  const systemPrompt = buildPremiumPlusDirectSystemPrompt(options)
  return callPremiumPlusAnthropicText(
    client,
    options.anthropicModel,
    options.anthropicFallbackModel,
    systemPrompt,
    message,
    options.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
    'premium_plus_direct'
  )
}

const streamPremiumPlusDirectText = async (
  message: string,
  options: {
    anthropicModel: string
    anthropicFallbackModel: string
    conversationHistory?: Array<{ role: string; content: string }>
    caseKeywords?: string
    memoryContext?: string
    historyLimit?: number
    maxTokens?: number
    onToken?: (chunk: string) => void
  }
) => {
  const client = createPremiumPlusAnthropic()
  const systemPrompt = buildPremiumPlusDirectSystemPrompt(options)
  return streamPremiumPlusAnthropic(
    client,
    options.anthropicModel,
    options.anthropicFallbackModel,
    systemPrompt,
    [{ role: 'user', content: message }],
    {
      maxTokens: options.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
      requestType: 'premium_plus_direct_stream',
      onToken: options.onToken,
    }
  )
}

const extractAnthropicTextContent = (content: any): string => {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block: any) => block?.type === 'text')
    .map((block: any) => String(block?.text || ''))
    .join('')
    .trim()
}

const extractAnthropicToolUseBlocks = (content: any): Array<{ id: string; name: string; input: Record<string, any> }> => {
  if (!Array.isArray(content)) return []
  return content
    .filter((block: any) => block?.type === 'tool_use' && typeof block?.id === 'string' && typeof block?.name === 'string')
    .map((block: any) => ({
      id: block.id,
      name: block.name,
      input: block?.input && typeof block.input === 'object' ? block.input as Record<string, any> : {},
    }))
}

const mapPremiumPlusCaseLawItem = (row: any, index: number) => {
  const title = premiumPlusFirstDefinedString(row?.title, row?.case_name, row?.name) || `Authority ${index + 1}`
  const citation = premiumPlusFirstDefinedString(row?.citation, row?.neutralCitation, row?.neutral_citation) || `Authority ${index + 1}`
  const summary = premiumPlusTruncate(premiumPlusCompact(String(row?.summary || row?.snippet || row?.excerpt || '')), 320)
  const extracts = premiumPlusTruncate(premiumPlusCompact(String(row?.extracts || '')), 420)
  const url = premiumPlusFirstDefinedString(row?.url, row?.link) || ''
  return {
    citation,
    title,
    summary,
    extracts,
    url,
  }
}

const executePremiumPlusWebSearch = async (
  query: string,
  mode: LegalSearchMode,
  engine: SearchEngine
): Promise<PremiumPlusToolExecutionResult> => {
  const searchTool = new SearchTool({ engine })
  const searchPayload = JSON.stringify({ query, mode, engine })
  const raw = await searchTool._call(searchPayload)
  const parsed = JSON.parse(raw) as SearchToolOutput
  const sources = Array.isArray(parsed.sources) ? parsed.sources.filter((item): item is string => typeof item === 'string') : []
  const packet = typeof parsed.packet === 'string' ? parsed.packet : raw
  const sourceBlock = sources.length > 0
    ? `Sources:\n${sources.map((url, index) => `[${index + 1}] ${url}`).join('\n')}\n\n`
    : ''

  return {
    content: `${sourceBlock}${premiumPlusTruncate(packet, 7000)}`.trim(),
    sources,
  }
}

const executePremiumPlusCaseLawSearch = async (
  query: string,
  scope: 'suggestions' | 'analysis' | 'both',
  limit: number
): Promise<PremiumPlusToolExecutionResult> => {
  if (!process.env.MILVUS_HOST) {
    return {
      content: 'Case-law retrieval is currently unavailable.',
    }
  }

  const rawResults = await searchByText(query, Math.max(6, limit * 3))
  const mapped = Array.isArray(rawResults)
    ? rawResults.slice(0, limit).map((row, index) => mapPremiumPlusCaseLawItem(row, index))
    : []

  if (mapped.length === 0) {
    return {
      content: 'No closely relevant case-law results were found.',
    }
  }

  const lines: string[] = ['Case-law results:']
  mapped.forEach((item, index) => {
    lines.push(`[${index + 1}] ${item.citation} - ${item.title}`)
    if (scope !== 'suggestions' && item.summary) lines.push(`Summary: ${item.summary}`)
    if (scope !== 'suggestions' && item.extracts) lines.push(`Extract: ${item.extracts}`)
    if (item.url) lines.push(`URL: ${item.url}`)
  })

  return {
    content: premiumPlusTruncate(lines.join('\n'), 5000),
  }
}

const executePremiumPlusToolCall = async (
  toolName: string,
  args: Record<string, any>,
  searchEngineOverride: SearchEngine
): Promise<PremiumPlusToolExecutionResult> => {
  if (toolName === 'web_search') {
    const query = String(args.query || '').trim()
    const mode = normalizeLegalSearchMode(args.mode) || 'general'
    if (!query) return { content: 'Web search was skipped because no query was provided.' }
    return executePremiumPlusWebSearch(query, mode, searchEngineOverride)
  }

  if (toolName === 'case_law_search') {
    const query = String(args.query || '').trim()
    const scopeRaw = String(args.scope || 'both').trim().toLowerCase()
    const scope = scopeRaw === 'suggestions' || scopeRaw === 'analysis' || scopeRaw === 'both'
      ? scopeRaw
      : 'both'
    const limit = Number.isFinite(Number(args.limit))
      ? Math.max(1, Math.min(5, Math.floor(Number(args.limit))))
      : 3
    if (!query) return { content: 'Case-law search was skipped because no query was provided.' }
    return executePremiumPlusCaseLawSearch(query, scope, limit)
  }

  return {
    content: `Tool ${toolName} is not available.`,
  }
}

const buildPremiumPlusAnthropicRequest = (
  modelName: string,
  systemPrompt: string,
  messages: PremiumPlusAnthropicMessage[],
  options?: {
    toolsEnabled?: boolean
    maxTokens?: number
    promptCachingEnabled?: boolean
  }
) => {
  const promptCachingEnabled = options?.promptCachingEnabled !== false && premiumPlusPromptCachingEnabled()
  const payload: Record<string, any> = {
    model: modelName,
    system: buildPremiumPlusAnthropicSystemBlocks(systemPrompt, promptCachingEnabled),
    messages,
    max_tokens: Math.max(256, Math.floor(options?.maxTokens || PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS)),
    temperature: 0.2,
  }

  if (options?.toolsEnabled) {
    payload.tools = buildPremiumPlusAnthropicTools(promptCachingEnabled)
    payload.tool_choice = { type: 'auto' }
  }

  return {
    payload,
    requestOptions: promptCachingEnabled
      ? {
          headers: {
            'anthropic-beta': PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHING_BETA,
          },
        }
      : undefined,
  }
}

const callPremiumPlusAnthropic = async (
  client: Anthropic,
  model: string,
  fallbackModel: string,
  systemPrompt: string,
  messages: PremiumPlusAnthropicMessage[],
  options?: {
    toolsEnabled?: boolean
    maxTokens?: number
    requestType?: string
  }
) => {
  const runModel = async (modelName: string) => {
    const startedAt = Date.now()
    try {
      const executeRequest = async (promptCachingEnabled: boolean) => {
        const { payload, requestOptions } = buildPremiumPlusAnthropicRequest(modelName, systemPrompt, messages, {
          ...options,
          promptCachingEnabled,
        })
        return client.messages.create(payload as any, requestOptions as any)
      }

      let response: any
      try {
        response = await executeRequest(true)
      } catch (error: any) {
        if (!premiumPlusPromptCachingEnabled() || !isPremiumPlusPromptCachingUnsupportedError(error)) {
          throw error
        }
        console.warn('Premium+ Anthropic prompt caching unavailable, retrying without cache hints', {
          model: modelName,
          requestType: options?.requestType,
        })
        response = await executeRequest(false)
      }

      logClaudeUsage({
        model: modelName,
        usage: response?.usage,
        success: true,
        latencyMs: Date.now() - startedAt,
        requestType: options?.requestType,
        endpoint: 'messages.create',
      })
      return response
    } catch (error: any) {
      logClaudeUsage({
        model: modelName,
        success: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        requestType: options?.requestType,
        endpoint: 'messages.create',
      })
      throw error
    }
  }

  try {
    return await runModel(model)
  } catch (primaryError) {
    if (fallbackModel && fallbackModel !== model) {
      console.error('Premium+ Anthropic primary model failed, trying fallback model', {
        primaryModel: model,
        fallbackModel,
      })
      return await runModel(fallbackModel)
    }
    throw primaryError
  }
}

const streamPremiumPlusAnthropic = async (
  client: Anthropic,
  model: string,
  fallbackModel: string,
  systemPrompt: string,
  messages: PremiumPlusAnthropicMessage[],
  options?: {
    maxTokens?: number
    requestType?: string
    onToken?: (chunk: string) => void
  }
) => {
  const runModel = async (modelName: string) => {
    const startedAt = Date.now()
    let streamedText = ''
    try {
      const startStream = (promptCachingEnabled: boolean) => {
        const { payload, requestOptions } = buildPremiumPlusAnthropicRequest(modelName, systemPrompt, messages, {
          toolsEnabled: false,
          maxTokens: options?.maxTokens,
          promptCachingEnabled,
        })
        return client.messages.stream(payload as any, requestOptions as any)
      }

      let stream: any
      try {
        stream = startStream(true)
      } catch (error: any) {
        if (!premiumPlusPromptCachingEnabled() || !isPremiumPlusPromptCachingUnsupportedError(error)) {
          throw error
        }
        console.warn('Premium+ Anthropic prompt caching unavailable for stream, retrying without cache hints', {
          model: modelName,
          requestType: options?.requestType,
        })
        stream = startStream(false)
      }

      stream.on('text', (text: string) => {
        if (!text) return
        streamedText += text
        options?.onToken?.(text)
      })
      const finalMessage = await stream.finalMessage()
      logClaudeUsage({
        model: modelName,
        usage: (finalMessage as any)?.usage,
        success: true,
        latencyMs: Date.now() - startedAt,
        requestType: options?.requestType,
        endpoint: 'messages.stream',
      })
      return extractAnthropicTextContent((finalMessage as any)?.content) || streamedText
    } catch (error: any) {
      logClaudeUsage({
        model: modelName,
        success: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        requestType: options?.requestType,
        endpoint: 'messages.stream',
      })
      throw { error, streamedText }
    }
  }

  try {
    return await runModel(model)
  } catch (primaryFailure: any) {
    const emittedText = typeof primaryFailure?.streamedText === 'string' && primaryFailure.streamedText.length > 0
    if (!emittedText && fallbackModel && fallbackModel !== model) {
      console.error('Premium+ Anthropic primary stream failed, trying fallback model', {
        primaryModel: model,
        fallbackModel,
      })
      return await runModel(fallbackModel)
    }
    throw primaryFailure?.error || primaryFailure
  }
}

const callPremiumPlusAnthropicText = async (
  client: Anthropic,
  model: string,
  fallbackModel: string,
  systemPrompt: string,
  prompt: string,
  maxTokens: number,
  requestType: string
) => {
  const completion = await callPremiumPlusAnthropic(
    client,
    model,
    fallbackModel,
    systemPrompt,
    [{ role: 'user', content: prompt }],
    {
      toolsEnabled: false,
      maxTokens,
      requestType,
    }
  )

  return extractAnthropicTextContent((completion as any)?.content)
}

const emitSyntheticStream = (text: string, onToken?: (chunk: string) => void) => {
  if (!text) return
  for (const chunk of text.match(/.{1,24}/g) || []) {
    onToken?.(chunk)
  }
}

const describePremiumPlusToolStatus = (toolNames: string[]) => {
  const hasWebSearch = toolNames.includes('web_search')
  const hasCaseLaw = toolNames.includes('case_law_search')

  if (hasWebSearch && hasCaseLaw) {
    return 'Checking web sources and retrieving case law...'
  }
  if (hasWebSearch) {
    return 'Checking web sources...'
  }
  if (hasCaseLaw) {
    return 'Retrieving case law...'
  }
  return 'Thinking...'
}

const runPremiumPlusToolLoop = async (
  prompt: string,
  options: {
    anthropicModel: string
    anthropicFallbackModel: string
    searchEngineOverride: SearchEngine
    conversationHistory?: Array<{ role: string; content: string }>
    caseKeywords?: string
    memoryContext?: string
    historyLimit?: number
    onStatus?: (status: string) => void
  }
): Promise<PremiumPlusToolLoopState> => {
  const client = createPremiumPlusAnthropic()
  const contextLines = buildPremiumPlusContextLines(options)
  const systemPrompt = buildPremiumPlusAnthropicSystemPrompt(contextLines)
  const messages: PremiumPlusAnthropicMessage[] = [{ role: 'user', content: prompt }]
  const aggregatedSources: string[] = []
  const usedTools: string[] = []

  for (let round = 0; round < PREMIUM_PLUS_TOOL_LOOP_LIMIT; round += 1) {
    const completion = await callPremiumPlusAnthropic(
      client,
      options.anthropicModel,
      options.anthropicFallbackModel,
      systemPrompt,
      messages,
      {
        toolsEnabled: true,
        maxTokens: PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS,
        requestType: 'premium_plus_tool_loop',
      }
    ) as any

    const assistantContent = Array.isArray(completion?.content)
      ? completion.content as Array<Record<string, any>>
      : []

    if (assistantContent.length === 0) break

    messages.push({
      role: 'assistant',
      content: assistantContent,
    })

    const toolUses = extractAnthropicToolUseBlocks(assistantContent)
    if (toolUses.length === 0) {
      return {
        messages,
        sources: aggregatedSources,
        directResponse: extractAnthropicTextContent(assistantContent),
        toolsUsed: usedTools,
        systemPrompt,
      }
    }

    options.onStatus?.(describePremiumPlusToolStatus(toolUses.map((toolUse) => toolUse.name)))

    const executedToolResults = await Promise.all(
      toolUses.map(async (toolUse) => ({
        toolUse,
        result: await executePremiumPlusToolCall(toolUse.name, toolUse.input, options.searchEngineOverride),
      }))
    )

    const toolResults: Array<Record<string, any>> = []
    for (const { toolUse, result } of executedToolResults) {
      if (Array.isArray(result.sources)) {
        for (const source of result.sources) {
          if (!aggregatedSources.includes(source)) aggregatedSources.push(source)
        }
      }
      usedTools.push(toolUse.name)
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.content,
      })
    }

    if (toolResults.length > 0) {
      messages.push({
        role: 'user',
        content: toolResults,
      })
    }
  }

  return {
    messages,
    sources: aggregatedSources,
    directResponse: '',
    toolsUsed: usedTools,
    systemPrompt,
  }
}

export async function invokePremiumPlusLegalAgent(
  message: string,
  _threadId: string,
  _userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    useSearch?: boolean
    autoDecideSearch?: boolean
    memoryContext?: string
    historyLimit?: number
    searchQueryOverride?: string
    searchModeOverride?: LegalSearchMode
    searchEngineOverride?: SearchEngine
    anthropicModel?: string
    anthropicFallbackModel?: string
    maxTokens?: number
    maxCompressionRetries?: number
  }
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!apiKey) {
    return {
      response: "I'm unable to respond right now because the Premium+ model is unavailable. Please try again shortly.",
      document_generated: false,
      guidance_provided: false,
      next_steps: [],
      sources: undefined,
    }
  }

  const anthropicModel = options?.anthropicModel || PREMIUM_PLUS_ANTHROPIC_MODEL
  const anthropicFallbackModel = options?.anthropicFallbackModel || PREMIUM_PLUS_ANTHROPIC_FALLBACK_MODEL
  const explicitUseSearch = typeof options?.useSearch === 'boolean' ? options.useSearch : undefined
  const autoDecideSearch = (options?.autoDecideSearch ?? true) && explicitUseSearch === undefined
  const shouldUseDirectOnly =
    explicitUseSearch === false ||
    (autoDecideSearch && shouldPreferPremiumPlusDirectAnswer(message))

  if (shouldUseDirectOnly) {
    const directText = await callPremiumPlusDirectText(message, {
      anthropicModel,
      anthropicFallbackModel,
      conversationHistory,
      caseKeywords,
      memoryContext: options?.memoryContext,
      historyLimit: options?.historyLimit,
    })

    return {
      response: neutralizeLegalAdviceTone(
        stripMarkdown(stripUrlsFromText(directText || "I couldn't generate a response."))
      ),
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: undefined,
    }
  }

  const toolLoop = await runPremiumPlusToolLoop(message, {
    anthropicModel,
    anthropicFallbackModel,
    searchEngineOverride: options?.searchEngineOverride || 'perplexity',
    conversationHistory,
    caseKeywords,
    memoryContext: options?.memoryContext,
    historyLimit: options?.historyLimit,
  })

  if (toolLoop.directResponse) {
    const finalDirect = ensureCitationsForPremium(
      neutralizeLegalAdviceTone(stripMarkdown(stripUrlsFromText(toolLoop.directResponse))),
      toolLoop.sources,
      toolLoop.sources.length > 0
    )
    return {
      response: finalDirect.responseText,
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: finalDirect.sources,
    }
  }

  const client = createPremiumPlusAnthropic()
  const finalCompletion = await callPremiumPlusAnthropic(
    client,
    anthropicModel,
    anthropicFallbackModel,
    toolLoop.systemPrompt,
    [
      ...toolLoop.messages,
      {
        role: 'user',
        content: 'Now answer the user directly in plain text using any tool results already provided. Do not call any more tools.',
      },
    ],
    {
      toolsEnabled: false,
      maxTokens: options?.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
      requestType: 'premium_plus_final',
    }
  ) as any
  const finalText = extractAnthropicTextContent(finalCompletion?.content)
  const final = ensureCitationsForPremium(
    neutralizeLegalAdviceTone(stripMarkdown(stripUrlsFromText(finalText || "I couldn't generate a response."))),
    toolLoop.sources,
    toolLoop.sources.length > 0
  )

  return {
    response: final.responseText,
    document_generated: false,
    guidance_provided: true,
    next_steps: [],
    sources: final.sources,
  }
}

export async function invokePremiumPlusLegalAgentStream(
  message: string,
  threadId: string,
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    useSearch?: boolean
    autoDecideSearch?: boolean
    memoryContext?: string
    historyLimit?: number
    searchQueryOverride?: string
    searchModeOverride?: LegalSearchMode
    searchEngineOverride?: SearchEngine
    anthropicModel?: string
    anthropicFallbackModel?: string
    maxTokens?: number
    maxCompressionRetries?: number
    onToken?: (chunk: string) => void
    onStatus?: (status: string) => void
  }
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!apiKey) {
    return {
      response: "I'm unable to respond right now because the Premium+ model is unavailable. Please try again shortly.",
      document_generated: false,
      guidance_provided: false,
      next_steps: [],
      sources: undefined,
    }
  }

  const anthropicModel = options?.anthropicModel || PREMIUM_PLUS_ANTHROPIC_MODEL
  const anthropicFallbackModel = options?.anthropicFallbackModel || PREMIUM_PLUS_ANTHROPIC_FALLBACK_MODEL
  const explicitUseSearch = typeof options?.useSearch === 'boolean' ? options.useSearch : undefined
  const autoDecideSearch = (options?.autoDecideSearch ?? true) && explicitUseSearch === undefined
  const shouldUseDirectOnly =
    explicitUseSearch === false ||
    (autoDecideSearch && shouldPreferPremiumPlusDirectAnswer(message))
  let lastStatus = ''
  const emitStatus = (status: string) => {
    const normalizedStatus = String(status || '').trim()
    if (!normalizedStatus || normalizedStatus === lastStatus) return
    lastStatus = normalizedStatus
    options?.onStatus?.(normalizedStatus)
  }

  if (shouldUseDirectOnly) {
    emitStatus('Drafting answer...')
    const directText = await streamPremiumPlusDirectText(message, {
      anthropicModel,
      anthropicFallbackModel,
      conversationHistory,
      caseKeywords,
      memoryContext: options?.memoryContext,
      historyLimit: options?.historyLimit,
      maxTokens: options?.maxTokens,
      onToken: options?.onToken,
    })

    return {
      response: neutralizeLegalAdviceTone(
        stripMarkdown(stripUrlsFromText(directText || "I couldn't generate a response."))
      ),
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: undefined,
    }
  }

  emitStatus('Thinking...')
  const toolLoop = await runPremiumPlusToolLoop(message, {
    anthropicModel,
    anthropicFallbackModel,
    searchEngineOverride: options?.searchEngineOverride || 'perplexity',
    conversationHistory,
    caseKeywords,
    memoryContext: options?.memoryContext,
    historyLimit: options?.historyLimit,
    onStatus: emitStatus,
  })

  if (toolLoop.directResponse) {
    const finalDirect = ensureCitationsForPremium(
      neutralizeLegalAdviceTone(stripMarkdown(stripUrlsFromText(toolLoop.directResponse))),
      toolLoop.sources,
      toolLoop.sources.length > 0
    )
    emitStatus('Writing answer...')
    emitSyntheticStream(finalDirect.responseText, options?.onToken)
    return {
      response: finalDirect.responseText,
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: finalDirect.sources,
    }
  }

  const client = createPremiumPlusAnthropic()
  emitStatus('Drafting answer...')
  const finalText = await streamPremiumPlusAnthropic(
    client,
    anthropicModel,
    anthropicFallbackModel,
    toolLoop.systemPrompt,
    [
      ...toolLoop.messages,
      {
        role: 'user',
        content: 'Now answer the user directly in plain text using any tool results already provided. Do not call any more tools.',
      },
    ],
    {
      maxTokens: options?.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
      requestType: 'premium_plus_final_stream',
      onToken: options?.onToken,
    }
  )

  const final = ensureCitationsForPremium(
    neutralizeLegalAdviceTone(stripMarkdown(stripUrlsFromText(finalText || "I couldn't generate a response."))),
    toolLoop.sources,
    toolLoop.sources.length > 0
  )

  return {
    response: final.responseText,
    document_generated: false,
    guidance_provided: true,
    next_steps: [],
    sources: final.sources,
  }
}

export async function invokeBasicLegalAgent(
  message: string,
  threadId: string,
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    memoryContext?: string
    historyLimit?: number
  }
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const basicProvider = chooseBasicProvider(userId || threadId)
  const agent = await createLegalAgent(conversationHistory, caseKeywords, undefined, {
    useSearch: false,
    caseAccessUserId: userId,
    systemPrompt: SYSTEM_PROMPT_FREE,
    memoryContext: options?.memoryContext,
    historyLimit: options?.historyLimit,
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
