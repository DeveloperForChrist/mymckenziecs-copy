// Import OpenAI client for all LLM calls
import { OpenAI } from 'openai';
import { supabaseAdmin } from '../../database/supabase-server';
import { DocGeneratorTool } from '../tools/doc-generator-tool';
import { SearchTool, type SearchEngine, type SearchToolOutput } from '../tools/search-tool';
import { neutralizeLegalAdviceTone } from './legal-tone';
import { searchByText } from '@/lib/vector/milvus';

// Simplified system prompt
const SYSTEM_PROMPT: string = `You are MyMckenzieCS Assistant, a highly knowledgeable and conversational legal assistant created to help UK legal users with their legal issues, cases and queries.
You help users spot out the law or legislation of UK their cases or issues fall under, as most users may not know it as they are confused and stressed, so It is good to ask specific classifying questions when needed in order to be more accurate in spot the legal area of their case.
After you have had picked out the law or legislation that their case or issue may fall under, you should then help the user understand the law or legislation in lay man child friendly terms, even giving an illustrative scenarios example to help them understand better the law or legislation.
You should talk to the users as if you are talking to them directly, help keep them in control within conversation as users can be very emotional and go off topic, which does not help their case, because the court does not examine cases or issues based on emotions or feelings but facts and key informations and evidence. 
As MyMckenzie's Legal Support, you should manage or direct the user's issue as how a UK judge is likely to look at their case, so you help them in the best way possible, like pointing out key details or facts or informations, that makes their case or point of view seem invalid or not worthy of persuasion, but dont explicitly give legal advice.
Keep users focused and in control at all times. Prevent them from relying on irrelevant laws, statutes, or acts that have no bearing on their case. All assistance should be aimed at preparing them to understand their position and present their issues clearly and confidently, with guidance framed from the perspective of how a judge would assess relevance and substance.

When deemed suitable, you MAY need to make references to laws, acts, statutes and sucH.
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

const SYSTEM_PROMPT_FREE: string = `You are MyMckenzieCS Assistant, a highly knowledgeable and conversational legal assistant created to help UK legal users with their legal issues, cases and queries.
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



To the user, you are a legal leader/Assitant for them, most importantly preparing, then supporting and leading them.


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
const PREMIUM_PLUS_OPENAI_MODEL =
  process.env.PREMIUM_PLUS_OPENAI_MODEL ||
  'gpt-5.2'
const PREMIUM_PLUS_OPENAI_FALLBACK_MODEL =
  process.env.PREMIUM_PLUS_OPENAI_FALLBACK_MODEL ||
  OPENAI_MODEL
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
const PREMIUM_PLUS_MAX_SUB_ISSUES = Number.isFinite(Number(process.env.PREMIUM_PLUS_MAX_SUB_ISSUES))
  ? Math.max(4, Math.min(12, Math.floor(Number(process.env.PREMIUM_PLUS_MAX_SUB_ISSUES))))
  : 8
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

class RoutingTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RoutingTimeoutError'
  }
}

const withRoutingTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, stage: string): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise

  let timeoutId: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new RoutingTimeoutError(`${stage} timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

const getRoutingDecisionTimeoutMs = () =>
  Number.isFinite(Number(process.env.ROUTING_DECISION_TIMEOUT_MS))
    ? Math.max(1000, Math.floor(Number(process.env.ROUTING_DECISION_TIMEOUT_MS)))
    : 3500

// =====================================================
// SIMPLE HELPERS
// =====================================================

export type LegalSearchMode = 'education' | 'procedure' | 'case_specific' | 'document_review' | 'general'
type LlmProvider = 'openai' | 'groq'
type LengthRecoveryMode = 'none' | 'continue' | 'compress'
export type GeneratorRetrievalMode = 'direct' | 'web_only' | 'vector_only' | 'hybrid'
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
export type PremiumPlusSubIssue = {
  issue: string
  retrievalMode?: GeneratorRetrievalMode
  webQuery?: string
  vectorQuery?: string
  rationale?: string
  tools?: PremiumPlusToolSelection[]
}
export type GeneratorRetrievalDecision = {
  retrievalMode: GeneratorRetrievalMode
  webQuery?: string
  vectorQuery?: string
  confidence?: number
  decomposition?: string
  subIssues?: PremiumPlusSubIssue[]
  tools?: PremiumPlusToolSelection[]
  reasons: string[]
}
export type PremiumPlusPlannerDecision =
  | ({
      action: 'answer'
      answer: string
      confidence?: number
      reasons: string[]
      decomposition?: string
      subIssues?: PremiumPlusSubIssue[]
    })
  | ({
      action: 'execute'
      confidence?: number
      reasons: string[]
      decomposition?: string
      subIssues?: PremiumPlusSubIssue[]
      plan: GeneratorRetrievalDecision
    })
type LegalAgentOptions = {
  useSearch?: boolean
  systemPrompt?: string
  includeCitations?: boolean
  memoryContext?: string
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

// Build history context
function buildHistoryContext(history: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  if (!history || history.length === 0) return ''

  const lines = history.map(entry => `${entry.role === 'assistant' ? 'Assistant' : 'User'}: ${entry.content}`)
  return `Recent conversation:\n${lines.join('\n')}\n`
}

const PREMIUM_PLUS_WEB_SEARCH_TOOLS: PremiumPlusToolName[] = [
  'web_search_education',
  'web_search_procedure',
  'web_search_case_specific',
  'web_search_document_review',
  'web_search_general',
]
const PREMIUM_PLUS_WEB_SEARCH_TOOL_SET = new Set<PremiumPlusToolName>(PREMIUM_PLUS_WEB_SEARCH_TOOLS)
const PREMIUM_PLUS_CASELAW_TOOL_SET = new Set<PremiumPlusToolName>([
  'case_law_suggestions',
  'case_law_rag',
])

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

const webSearchToolNameFromMode = (mode: LegalSearchMode): PremiumPlusToolName => {
  switch (mode) {
    case 'education':
      return 'web_search_education'
    case 'procedure':
      return 'web_search_procedure'
    case 'case_specific':
      return 'web_search_case_specific'
    case 'document_review':
      return 'web_search_document_review'
    case 'general':
    default:
      return 'web_search_general'
  }
}

const normalizePremiumPlusToolName = (toolValue: any, modeValue?: any): PremiumPlusToolName | null => {
  const normalizedTool = String(toolValue || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const normalizedMode = normalizeLegalSearchMode(modeValue)

  switch (normalizedTool) {
    case 'direct':
    case 'direct_answer':
    case 'direct_knowledge':
    case 'direct_response':
      return 'direct_knowledge'
    case 'web':
    case 'web_search':
    case 'internet_search':
    case 'search':
      return webSearchToolNameFromMode(normalizedMode || 'general')
    case 'web_search_education':
    case 'web_education':
      return 'web_search_education'
    case 'web_search_procedure':
    case 'web_procedure':
      return 'web_search_procedure'
    case 'web_search_case_specific':
    case 'web_case_specific':
      return 'web_search_case_specific'
    case 'web_search_document_review':
    case 'web_document_review':
      return 'web_search_document_review'
    case 'web_search_general':
    case 'web_general':
      return 'web_search_general'
    case 'case_law_suggestions':
    case 'authority_suggestions':
    case 'precedent_suggestions':
      return 'case_law_suggestions'
    case 'case_law':
    case 'case_law_rag':
    case 'vector_case_law_rag':
    case 'vector_rag':
    case 'authority_rag':
    case 'case_law_retrieval':
      return 'case_law_rag'
    default:
      return null
  }
}

const dedupePremiumPlusTools = (
  selections: PremiumPlusToolSelection[],
  limit: number = 8
): PremiumPlusToolSelection[] => {
  const seen = new Set<string>()
  const deduped: PremiumPlusToolSelection[] = []

  for (const selection of selections) {
    const tool = normalizePremiumPlusToolName(selection?.tool)
    if (!tool) continue
    const query = String(selection?.query || '').trim()
    const rationale = String(selection?.rationale || '').trim()
    const key = `${tool}|${query.toLowerCase()}|${rationale.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({
      tool,
      query: query || undefined,
      rationale: rationale || undefined,
    })
    if (deduped.length >= limit) break
  }

  return deduped
}

const parsePremiumPlusTools = (rawValue: any): PremiumPlusToolSelection[] => {
  if (!Array.isArray(rawValue)) return []

  const parsed = rawValue
    .map((item: any): PremiumPlusToolSelection | null => {
      if (typeof item === 'string') {
        const tool = normalizePremiumPlusToolName(item)
        return tool ? { tool } : null
      }
      if (!item || typeof item !== 'object') return null

      const tool = normalizePremiumPlusToolName(
        item.tool ?? item.name ?? item.type ?? item.id,
        item.mode ?? item.search_mode ?? item.searchMode
      )
      if (!tool) return null

      const query = String(
        item.query ??
        item.web_query ??
        item.webQuery ??
        item.vector_query ??
        item.vectorQuery ??
        ''
      ).trim()
      const rationale = String(item.rationale ?? item.reason ?? item.why ?? '').trim()

      return {
        tool,
        query: query || undefined,
        rationale: rationale || undefined,
      }
    })
    .filter((item: PremiumPlusToolSelection | null): item is PremiumPlusToolSelection => Boolean(item))

  return dedupePremiumPlusTools(parsed)
}

const deriveRetrievalModeFromTools = (
  tools: PremiumPlusToolSelection[] | undefined
): GeneratorRetrievalMode | null => {
  if (!Array.isArray(tools) || tools.length === 0) return null

  const hasWeb = tools.some((item) => PREMIUM_PLUS_WEB_SEARCH_TOOL_SET.has(item.tool))
  const hasCaseLaw = tools.some((item) => PREMIUM_PLUS_CASELAW_TOOL_SET.has(item.tool))

  if (hasWeb && hasCaseLaw) return 'hybrid'
  if (hasCaseLaw) return 'vector_only'
  if (hasWeb) return 'web_only'
  return 'direct'
}

const firstToolQuery = (
  tools: PremiumPlusToolSelection[] | undefined,
  kind: 'web' | 'case_law'
): string => {
  if (!Array.isArray(tools) || tools.length === 0) return ''
  const matched = tools.find((item) =>
    kind === 'web'
      ? PREMIUM_PLUS_WEB_SEARCH_TOOL_SET.has(item.tool)
      : PREMIUM_PLUS_CASELAW_TOOL_SET.has(item.tool)
  )
  return String(matched?.query || '').trim()
}

const buildFallbackPremiumPlusTools = (
  retrievalMode: GeneratorRetrievalMode,
  webQuery?: string,
  vectorQuery?: string
): PremiumPlusToolSelection[] => {
  switch (retrievalMode) {
    case 'web_only':
      return [{ tool: 'web_search_general', query: webQuery || undefined }]
    case 'vector_only':
      return dedupePremiumPlusTools([
        { tool: 'case_law_rag', query: vectorQuery || undefined },
        { tool: 'case_law_suggestions', query: vectorQuery || undefined },
      ])
    case 'hybrid':
      return dedupePremiumPlusTools([
        { tool: 'web_search_general', query: webQuery || undefined },
        { tool: 'case_law_rag', query: vectorQuery || undefined },
        { tool: 'case_law_suggestions', query: vectorQuery || undefined },
      ])
    case 'direct':
    default:
      return [{ tool: 'direct_knowledge' }]
  }
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
      const parsedTools = parsePremiumPlusTools(parsed?.tools ?? parsed?.tool_plan ?? parsed?.toolPlan)
      const retrievalMode = (
        retrievalModeRaw === 'direct' ||
        retrievalModeRaw === 'web_only' ||
        retrievalModeRaw === 'vector_only' ||
        retrievalModeRaw === 'hybrid'
      ) ? retrievalModeRaw : deriveRetrievalModeFromTools(parsedTools)
      if (!retrievalMode) continue

      const webQuery = String(parsed?.web_query || parsed?.webQuery || firstToolQuery(parsedTools, 'web')).trim()
      const vectorQuery = String(parsed?.vector_query || parsed?.vectorQuery || firstToolQuery(parsedTools, 'case_law')).trim()
      const rawDecomposition = parsed?.decomposition ?? parsed?.issue_breakdown ?? parsed?.breakdown ?? ''
      const decomposition = Array.isArray(rawDecomposition)
        ? rawDecomposition.map((value: any) => String(value || '').trim()).filter(Boolean).join('\n')
        : String(rawDecomposition || '').trim()
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
      const rawSubIssues = Array.isArray(parsed?.sub_issues)
        ? parsed.sub_issues
        : Array.isArray(parsed?.subIssues)
          ? parsed.subIssues
          : []
      const subIssues = rawSubIssues
        .map((item: any): PremiumPlusSubIssue | null => {
          if (typeof item === 'string') {
            const issue = item.trim()
            return issue ? { issue } : null
          }
          if (!item || typeof item !== 'object') return null
          const issue = String(item.issue || item.question || item.topic || '').trim()
          if (!issue) return null
          const subTools = parsePremiumPlusTools(item.tools ?? item.tool_plan ?? item.toolPlan)
          const subModeRaw = String(item.retrieval_mode || item.retrievalMode || '').trim().toLowerCase()
          const subMode = (
            subModeRaw === 'direct' ||
            subModeRaw === 'web_only' ||
            subModeRaw === 'vector_only' ||
            subModeRaw === 'hybrid'
          ) ? subModeRaw : (deriveRetrievalModeFromTools(subTools) || undefined)
          const subWebQuery = String(item.web_query || item.webQuery || firstToolQuery(subTools, 'web')).trim()
          const subVectorQuery = String(item.vector_query || item.vectorQuery || firstToolQuery(subTools, 'case_law')).trim()
          const rationale = String(item.rationale || item.reason || item.why || '').trim()
          return {
            issue,
            retrievalMode: subMode,
            webQuery: subWebQuery || undefined,
            vectorQuery: subVectorQuery || undefined,
            rationale: rationale || undefined,
            tools: subTools.length > 0 ? subTools : undefined,
          }
        })
        .filter((item: PremiumPlusSubIssue | null): item is PremiumPlusSubIssue => Boolean(item))
        .slice(0, PREMIUM_PLUS_MAX_SUB_ISSUES)

      const tools = parsedTools.length > 0
        ? parsedTools
        : buildFallbackPremiumPlusTools(retrievalMode, webQuery || undefined, vectorQuery || undefined)

      return {
        retrievalMode,
        webQuery: webQuery || undefined,
        vectorQuery: vectorQuery || undefined,
        confidence,
        decomposition: decomposition || undefined,
        subIssues: subIssues.length > 0 ? subIssues : undefined,
        tools,
        reasons,
      }
    } catch {
      // try next candidate
    }
  }

  return null
}

const parsePremiumPlusPlannerJson = (raw: string): PremiumPlusPlannerDecision | null => {
  const trimmed = (raw || '').trim()
  if (!trimmed) return null

  const wrappedMatch = trimmed.match(/\{[\s\S]*\}/)
  const candidates = wrappedMatch ? [trimmed, wrappedMatch[0]] : [trimmed]

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as any
      const action = String(parsed?.action || parsed?.mode || '').trim().toLowerCase()
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

      const rawDecomposition = parsed?.decomposition ?? parsed?.issue_breakdown ?? parsed?.breakdown ?? ''
      const decomposition = Array.isArray(rawDecomposition)
        ? rawDecomposition.map((value: any) => String(value || '').trim()).filter(Boolean).join('\n')
        : String(rawDecomposition || '').trim()

      const rawSubIssues = Array.isArray(parsed?.sub_issues)
        ? parsed.sub_issues
        : Array.isArray(parsed?.subIssues)
          ? parsed.subIssues
          : []
      const subIssues = rawSubIssues
        .map((item: any): PremiumPlusSubIssue | null => {
          if (typeof item === 'string') {
            const issue = item.trim()
            return issue ? { issue } : null
          }
          if (!item || typeof item !== 'object') return null
          const issue = String(item.issue || item.question || item.topic || '').trim()
          if (!issue) return null
          const subTools = parsePremiumPlusTools(item.tools ?? item.tool_plan ?? item.toolPlan)
          const subModeRaw = String(item.retrieval_mode || item.retrievalMode || '').trim().toLowerCase()
          const subMode = (
            subModeRaw === 'direct' ||
            subModeRaw === 'web_only' ||
            subModeRaw === 'vector_only' ||
            subModeRaw === 'hybrid'
          ) ? subModeRaw : (deriveRetrievalModeFromTools(subTools) || undefined)
          const subWebQuery = String(item.web_query || item.webQuery || firstToolQuery(subTools, 'web')).trim()
          const subVectorQuery = String(item.vector_query || item.vectorQuery || firstToolQuery(subTools, 'case_law')).trim()
          const rationale = String(item.rationale || item.reason || item.why || '').trim()
          return {
            issue,
            retrievalMode: subMode,
            webQuery: subWebQuery || undefined,
            vectorQuery: subVectorQuery || undefined,
            rationale: rationale || undefined,
            tools: subTools.length > 0 ? subTools : undefined,
          }
        })
        .filter((item: PremiumPlusSubIssue | null): item is PremiumPlusSubIssue => Boolean(item))
        .slice(0, PREMIUM_PLUS_MAX_SUB_ISSUES)

      if (action === 'answer') {
        const answer = String(parsed?.answer || parsed?.response || '').trim()
        if (!answer) continue
        return {
          action: 'answer',
          answer,
          confidence,
          reasons,
          decomposition: decomposition || undefined,
          subIssues: subIssues.length > 0 ? subIssues : undefined,
        }
      }

      const plan = parseGeneratorRetrievalJson(candidate)
      if (!plan) continue
      return {
        action: 'execute',
        confidence,
        reasons: reasons.length > 0 ? reasons : plan.reasons,
        decomposition: decomposition || plan.decomposition,
        subIssues: subIssues.length > 0 ? subIssues : plan.subIssues,
        plan,
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
  const routingTimeoutMs = getRoutingDecisionTimeoutMs()
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
1. retrieval_mode must be one of: direct, web_only, vector_only, hybrid.
2. Use direct when the answer can be given safely from stable general legal knowledge or plain-English explanation without needing current source verification or case-law retrieval.
3. Use web_only when current procedure, forms, deadlines, official guidance, or practical next steps are dominant.
4. Use vector_only when case law, precedent, legal authorities, or analogical reasoning from authorities are dominant.
5. Use hybrid when both current practical guidance and legal authorities materially matter.
6. If attachment excerpts are present, prefer web_only or hybrid unless authority-heavy analysis is clearly dominant.
7. web_query must be a short focused web search query when web retrieval is needed. Leave it blank for direct or vector_only.
8. vector_query must be a short focused case-law retrieval query when case-law retrieval is needed. Leave it blank for direct or web_only.
9. Freely decompose the request into all material legal, procedural, factual, and practical sub-issues. Do not force the request into a single short summary if it clearly has multiple moving parts.
10. decomposition may be a paragraph, compact multiline string, or ordered breakdown that explains how the request was split.
11. sub_issues should contain as many material issues as needed, up to ${PREMIUM_PLUS_MAX_SUB_ISSUES}. Keep them in the order the final answer should follow. Each may include retrieval_mode, web_query, vector_query, and rationale where useful.
12. confidence must be 0 to 1 for routing certainty.
13. reasons should briefly explain the routing choice.
14. Do not answer the user. Only choose retrieval.

Output schema:
{
  "retrieval_mode": "direct|web_only|vector_only|hybrid",
  "web_query": "string",
  "vector_query": "string",
  "decomposition": "string",
  "sub_issues": [
    {
      "issue": "string",
      "retrieval_mode": "direct|web_only|vector_only|hybrid",
      "web_query": "string",
      "vector_query": "string",
      "rationale": "string"
    }
  ],
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
    const primary = await withRoutingTimeout(
      runModel(model),
      routingTimeoutMs,
      'Premium+ retrieval routing'
    )
    const parsed = parseGeneratorRetrievalJson(primary)
    if (parsed) return parsed
  } catch (error) {
    if (error instanceof RoutingTimeoutError) {
      console.warn(error.message)
      return null
    }
    // try fallback below
  }

  if (fallbackModel && fallbackModel !== model) {
    try {
      const fallback = await withRoutingTimeout(
        runModel(fallbackModel),
        routingTimeoutMs,
        'Premium+ retrieval routing fallback'
      )
      const parsed = parseGeneratorRetrievalJson(fallback)
      if (parsed) return parsed
    } catch (error) {
      if (error instanceof RoutingTimeoutError) {
        console.warn(error.message)
      }
      return null
    }
  }

  return null
}

export async function decidePremiumPlusPlanWithGroq(
  input: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    groqModel?: string
    groqFallbackModel?: string
  }
): Promise<PremiumPlusPlannerDecision | null> {
  const groqApiKey = (process.env.GROQ_API_KEY || '').trim()
  if (!groqApiKey) return null

  const trimmedHistory = sanitizeConversationHistory(conversationHistory, 12)
  const historyContext = buildHistoryContext(trimmedHistory)
  const model = (options?.groqModel || BASIC_GROQ_MODEL).trim() || BASIC_GROQ_MODEL
  const fallbackModel = (options?.groqFallbackModel || BASIC_GROQ_FALLBACK_MODEL).trim()
  const routingTimeoutMs = getRoutingDecisionTimeoutMs()
  const systemPrompt = [
    'You are the MyMckenzieCS Premium+ planner.',
    'You may either answer a truly simple stable legal question directly, or produce an execution plan for the Claude executor.',
    'Freely decompose the request into all material issues before deciding.',
    'Return JSON only. No prose, no markdown, no code fences.',
  ].join(' ')
  const userPrompt = `Decide whether to answer directly yourself or send this Premium+ request to the executor.
User message:
${input}

${caseKeywords ? `Case context: ${caseKeywords}\n` : ''}${historyContext}

Rules:
1. action must be either "answer" or "execute".
2. Choose action="answer" only for truly simple stable questions that can be answered safely without current verification, web retrieval, or case-law retrieval.
3. If action="answer", provide a complete plain-text answer in "answer". Keep it concise, clear, and practical. Do not include markdown.
4. Choose action="execute" for anything that needs current procedure, practical steps, case-law reasoning, mixed issues, user-fact issue spotting, or retrieval.
5. If action="execute", retrieval_mode must be one of: direct, web_only, vector_only, hybrid.
6. Freely decompose the request into all material legal, procedural, factual, and practical sub-issues. Do not force the request into a short summary if it has multiple moving parts.
7. decomposition may be a paragraph, compact multiline string, or ordered breakdown.
8. sub_issues may be as detailed as needed, up to ${PREMIUM_PLUS_MAX_SUB_ISSUES}. Keep them in the order the final answer should follow.
9. tools must be an array drawn from this smaller planner set only: direct_knowledge, web_search, case_law.
10. If using web_search, also set web_mode to one of: education, procedure, case_specific, document_review, general.
11. Use the smallest tool set that materially improves the answer.
12. web_query must be a short focused web search query when a web search tool is used. Leave it blank otherwise.
13. vector_query must be a short focused case-law retrieval query when a case-law tool is used. Leave it blank otherwise.
14. confidence must be 0 to 1.
15. reasons should briefly explain the choice.
16. Do not mix final user answer text into action="execute".

Output schema for action="answer":
{
  "action": "answer",
  "answer": "plain text answer",
  "decomposition": "string",
  "sub_issues": ["string"],
  "confidence": 0.0,
  "reasons": ["string"]
}

Output schema for action="execute":
{
  "action": "execute",
  "retrieval_mode": "direct|web_only|vector_only|hybrid",
  "web_query": "string",
  "vector_query": "string",
  "tools": [
    {
      "tool": "direct_knowledge|web_search|case_law",
      "web_mode": "education|procedure|case_specific|document_review|general",
      "query": "string",
      "rationale": "string"
    }
  ],
  "decomposition": "string",
  "sub_issues": [
    {
      "issue": "string",
      "retrieval_mode": "direct|web_only|vector_only|hybrid",
      "tools": [
        {
          "tool": "direct_knowledge|web_search|case_law",
          "web_mode": "education|procedure|case_specific|document_review|general",
          "query": "string",
          "rationale": "string"
        }
      ],
      "web_query": "string",
      "vector_query": "string",
      "rationale": "string"
    }
  ],
  "confidence": 0.0,
  "reasons": ["string"]
}`

  const runGroqModel = async (modelName: string): Promise<string> => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 500,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!response.ok) {
      const details = await response.text().catch(() => '')
      throw new Error(`Groq planner model ${modelName} failed (${response.status}): ${details}`)
    }

    const completion = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>
    }

    return completion.choices?.[0]?.message?.content || ''
  }

  try {
    const primary = await withRoutingTimeout(
      runGroqModel(model),
      routingTimeoutMs,
      'Premium+ Groq planning'
    )
    const parsed = parsePremiumPlusPlannerJson(primary)
    if (parsed) return parsed
  } catch (error) {
    if (error instanceof RoutingTimeoutError) {
      console.warn(error.message)
      return null
    }
  }

  if (fallbackModel && fallbackModel !== model) {
    try {
      const fallback = await withRoutingTimeout(
        runGroqModel(fallbackModel),
        routingTimeoutMs,
        'Premium+ Groq planning fallback'
      )
      const parsed = parsePremiumPlusPlannerJson(fallback)
      if (parsed) return parsed
    } catch (error) {
      if (error instanceof RoutingTimeoutError) {
        console.warn(error.message)
      }
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
  const memoryContext = typeof options?.memoryContext === 'string' && options.memoryContext.trim()
    ? `${options.memoryContext.trim()}\n\n`
    : ''
  const useSearch = options?.useSearch !== false
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
  const maxTokens = useSearch
    ? Math.min(maxTokensCap, Math.max(targetTokensFloor, requestedMaxTokens))
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

        // 3. LEGAL AGENT: Direct answer (no search)
        if (!useSearch) {
          const historyContext = buildHistoryContext(trimmedHistory)
          const caseContext = caseKeywords ? `Case context: ${caseKeywords}\n` : ''
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
            maxTokens,
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
        const isDefinition = isDefinitionQuery(latestQuestion)
        const mode: LegalSearchMode = searchModeOverride || (isDefinition ? 'education' : 'general')

        // Build search query with case context if available.
        let searchQuery = searchQueryOverride || latestQuestion
        if (caseKeywords && caseKeywords.trim()) {
          searchQuery = `${searchQuery} | Case context: ${caseKeywords}`
        }

        // Perform comprehensive search for all relevant information.
        const searchTool = new SearchTool({ engine: searchEngineOverride })
        const searchPayload = JSON.stringify({ query: searchQuery, mode, engine: searchEngineOverride })
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
        const caseContext = caseKeywords ? `Case context: ${caseKeywords}\n` : ''
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
          maxTokens + COMPREHENSIVE_TOKEN_BONUS,
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
  _userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: LegalAgentOptions
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

export async function invokePremiumLegalAgent(
  message: string,
  threadId: string,
  userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    useSearch?: boolean
    memoryContext?: string
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
    includeCitations: false,
    memoryContext: options?.memoryContext,
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
    memoryContext?: string
    searchQueryOverride?: string
    searchModeOverride?: LegalSearchMode
    searchEngineOverride?: SearchEngine
    openaiModel?: string
    openaiFallbackModel?: string
    maxTokens?: number
    maxCompressionRetries?: number
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

  const trimmedHistory = sanitizeConversationHistory(conversationHistory, 40)
  const systemPrompt = SYSTEM_PROMPT
  const memoryContext = typeof options?.memoryContext === 'string' && options.memoryContext.trim()
    ? `${options.memoryContext.trim()}\n\n`
    : ''
  const useSearch = options?.useSearch !== false
  const openaiModel = options?.openaiModel || OPENAI_MODEL
  const openaiFallbackModel = options?.openaiFallbackModel || OPENAI_FALLBACK_MODEL
  const searchQueryOverride = (options?.searchQueryOverride || '').trim()
  const searchModeOverride = options?.searchModeOverride
  const searchEngineOverride = options?.searchEngineOverride || 'brave'
  const requestedMaxTokens = Number.isFinite(Number(options?.maxTokens))
    ? Math.max(250, Number(options?.maxTokens))
    : MAX_TOKENS
  const maxTokens = useSearch
    ? Math.min(PREMIUM_MAX_TOKENS, Math.max(PREMIUM_TARGET_TOKENS, requestedMaxTokens))
    : requestedMaxTokens

  const openai = new OpenAI({ apiKey })
  const continuationPrompt = 'Continue exactly from where you stopped. Do not repeat prior text. Keep the same structure and style.'
  const continuationLimit = 1

  const streamOpenAiText = async (prompt: string): Promise<string> => {
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
        payload.max_completion_tokens = maxTokens
      } else {
        payload.max_tokens = maxTokens
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
          retryPayload.max_completion_tokens = maxTokens
        } else {
          delete retryPayload.max_completion_tokens
          retryPayload.max_tokens = maxTokens
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

  if (!useSearch) {
    const historyContext = buildHistoryContext(trimmedHistory)
    const caseContext = caseKeywords ? `Case context: ${caseKeywords}\n` : ''
    const lengthInstruction = buildLengthInstruction(latestQuestion)
    const directPrompt = `${memoryContext}${historyContext}${caseContext}User question: "${latestQuestion}"\n\nProvide a clear, helpful answer based on your general knowledge. ${lengthInstruction} Output must be plain text only. Follow the presentation rules. Use standalone heading lines instead of markdown headings, and do not use tables, markdown bold, italics, or markdown links.`
    return {
      response: neutralizeLegalAdviceTone(await streamOpenAiText(directPrompt)),
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: undefined,
    }
  }

  const isDefinition = isDefinitionQuery(latestQuestion)
  const mode: LegalSearchMode = searchModeOverride || (isDefinition ? 'education' : 'general')

  let searchQuery = searchQueryOverride || latestQuestion
  if (caseKeywords && caseKeywords.trim()) {
    searchQuery = `${searchQuery} | Case context: ${caseKeywords}`
  }

  const searchTool = new SearchTool({ engine: searchEngineOverride })
  const searchPayload = JSON.stringify({ query: searchQuery, mode, engine: searchEngineOverride })
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
  const caseContext = caseKeywords ? `Case context: ${caseKeywords}\n` : ''
  const comprehensivePrompt = `${sourceBlock}\n\nComprehensive legal information retrieved:\n${searchedInfo}\n\n${memoryContext}${buildHistoryContext(trimmedHistory)}${caseContext}User question: "${latestQuestion}"\n\nGenerate a clear answer that covers the user's actual question using the retrieved information. ${lengthInstruction} Do not include any source citations. This must remain legal information support only (not legal advice): avoid definitive conclusions on this user's exact facts and prefer neutral phrases like "may", "can", and "generally". Output must be plain text only. Follow the presentation rules. Use standalone heading lines instead of markdown headings, and do not use tables, markdown bold, italics, or markdown links.`

  return {
    response: neutralizeLegalAdviceTone(await streamOpenAiText(comprehensivePrompt)),
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
  messages: Array<Record<string, any>>
  sources: string[]
  directResponse: string
  toolsUsed: string[]
}

const PREMIUM_PLUS_TOOL_LOOP_LIMIT = 4
const PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS = 700

const PREMIUM_PLUS_TOOL_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

TOOL EXECUTION
- You may answer directly when the question is simple and stable.
- If current official guidance, procedure, forms, deadlines, or practical process are needed, call web_search.
- If authorities, precedents, or how courts have generally reasoned are needed, call case_law_search.
- You may call both tools when both materially help.
- After tool results are returned, answer the user directly in plain text.
- Do not mention tools, tool calls, internal routing, or function names to the user.
- Treat tool outputs as context already provided to you.`

const PREMIUM_PLUS_OPENAI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search current web sources for legal guidance, procedure, forms, deadlines, or practical context.',
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'case_law_search',
      description: 'Retrieve case-law authorities, summaries, and extracts relevant to the user query.',
      parameters: {
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
  },
] as const

const parseToolArguments = (raw: string | undefined) => {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, any>
  } catch {
    return {}
  }
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

const buildPremiumPlusToolCallPayload = (
  modelName: string,
  messages: Array<Record<string, any>>,
  options?: {
    stream?: boolean
    toolsEnabled?: boolean
    maxTokens?: number
  }
) => {
  const normalizedModel = modelName.trim().toLowerCase()
  const payload: Record<string, any> = {
    model: modelName,
    messages,
  }

  if (options?.stream) payload.stream = true
  if (options?.toolsEnabled) payload.tools = PREMIUM_PLUS_OPENAI_TOOLS as any
  if (options?.toolsEnabled) payload.tool_choice = 'auto'

  const maxTokens = options?.maxTokens || PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS
  if (normalizedModel.startsWith('o') || normalizedModel.startsWith('gpt-5')) {
    payload.max_completion_tokens = maxTokens
  } else {
    payload.max_tokens = maxTokens
    payload.temperature = 0.2
  }

  return payload
}

const createPremiumPlusOpenAi = () => {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set for Premium+ tool calling')
  }
  return new OpenAI({ apiKey })
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

const callPremiumPlusOpenAi = async (
  client: OpenAI,
  model: string,
  fallbackModel: string,
  messages: Array<Record<string, any>>,
  options?: {
    stream?: boolean
    toolsEnabled?: boolean
    maxTokens?: number
  }
) => {
  const runModel = async (modelName: string) => {
    try {
      return await client.chat.completions.create(
        buildPremiumPlusToolCallPayload(modelName, messages, options) as any
      )
    } catch (error: any) {
      const unsupportedTokenParam =
        error?.code === 'unsupported_parameter' &&
        (error?.param === 'max_tokens' || error?.param === 'max_completion_tokens')
      if (!unsupportedTokenParam) throw error

      const retryPayload = buildPremiumPlusToolCallPayload(modelName, messages, options)
      if ('max_tokens' in retryPayload) {
        delete retryPayload.max_tokens
        retryPayload.max_completion_tokens = options?.maxTokens || PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS
      } else {
        delete retryPayload.max_completion_tokens
        retryPayload.max_tokens = options?.maxTokens || PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS
        retryPayload.temperature = 0.2
      }
      return await client.chat.completions.create(retryPayload as any)
    }
  }

  try {
    return await runModel(model)
  } catch (primaryError) {
    if (fallbackModel && fallbackModel !== model) {
      console.error('Premium+ OpenAI primary model failed, trying fallback model', {
        primaryModel: model,
        fallbackModel,
      })
      return await runModel(fallbackModel)
    }
    throw primaryError
  }
}

const runPremiumPlusToolLoop = async (
  prompt: string,
  options: {
    openaiModel: string
    openaiFallbackModel: string
    searchEngineOverride: SearchEngine
    conversationHistory?: Array<{ role: string; content: string }>
    caseKeywords?: string
    memoryContext?: string
  }
): Promise<PremiumPlusToolLoopState> => {
  const client = createPremiumPlusOpenAi()
  const trimmedHistory = sanitizeConversationHistory(options.conversationHistory, 40)
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
  const messages: Array<Record<string, any>> = [
    { role: 'system', content: PREMIUM_PLUS_TOOL_SYSTEM_PROMPT },
    ...(contextLines.length > 0
      ? [{ role: 'system', content: contextLines.join('\n\n') }]
      : []),
    { role: 'user', content: prompt },
  ]
  const aggregatedSources: string[] = []
  const usedTools: string[] = []

  for (let round = 0; round < PREMIUM_PLUS_TOOL_LOOP_LIMIT; round += 1) {
    const completion = await callPremiumPlusOpenAi(
      client,
      options.openaiModel,
      options.openaiFallbackModel,
      messages,
      {
        toolsEnabled: true,
        maxTokens: PREMIUM_PLUS_TOOL_CALL_MAX_TOKENS,
      }
    ) as any

    const assistantMessage = completion?.choices?.[0]?.message
    if (!assistantMessage) break

    const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : []
    messages.push({
      role: 'assistant',
      content: assistantMessage.content || '',
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    })

    if (toolCalls.length === 0) {
      return {
        messages,
        sources: aggregatedSources,
        directResponse: String(assistantMessage.content || '').trim(),
        toolsUsed: usedTools,
      }
    }

    for (const toolCall of toolCalls.slice(0, 3)) {
      const toolName = String(toolCall?.function?.name || '').trim()
      const args = parseToolArguments(toolCall?.function?.arguments)
      const result = await executePremiumPlusToolCall(toolName, args, options.searchEngineOverride)
      if (Array.isArray(result.sources)) {
        for (const source of result.sources) {
          if (!aggregatedSources.includes(source)) aggregatedSources.push(source)
        }
      }
      usedTools.push(toolName)
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result.content,
      })
    }
  }

  return {
    messages,
    sources: aggregatedSources,
    directResponse: '',
    toolsUsed: usedTools,
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
    memoryContext?: string
    searchQueryOverride?: string
    searchModeOverride?: LegalSearchMode
    searchEngineOverride?: SearchEngine
    openaiModel?: string
    openaiFallbackModel?: string
    maxTokens?: number
    maxCompressionRetries?: number
  }
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const useSearch = options?.useSearch !== false
  if (!useSearch) {
    return invokePremiumLegalAgent(message, '', undefined, conversationHistory, caseKeywords, {
      useSearch: false,
      memoryContext: options?.memoryContext,
      openaiModel: options?.openaiModel || PREMIUM_PLUS_OPENAI_MODEL,
      openaiFallbackModel: options?.openaiFallbackModel || PREMIUM_PLUS_OPENAI_FALLBACK_MODEL,
      maxTokens: options?.maxTokens,
      maxCompressionRetries: options?.maxCompressionRetries,
    })
  }

  const openaiModel = options?.openaiModel || PREMIUM_PLUS_OPENAI_MODEL
  const openaiFallbackModel = options?.openaiFallbackModel || PREMIUM_PLUS_OPENAI_FALLBACK_MODEL
  const toolLoop = await runPremiumPlusToolLoop(message, {
    openaiModel,
    openaiFallbackModel,
    searchEngineOverride: options?.searchEngineOverride || 'perplexity',
    conversationHistory,
    caseKeywords,
    memoryContext: options?.memoryContext,
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

  const client = createPremiumPlusOpenAi()
  const finalMessages = [
    ...toolLoop.messages,
    {
      role: 'user',
      content: 'Now answer the user directly in plain text using any tool results already provided. Do not call any more tools.',
    },
  ]
  const finalCompletion = await callPremiumPlusOpenAi(
    client,
    openaiModel,
    openaiFallbackModel,
    finalMessages,
    {
      toolsEnabled: false,
      maxTokens: options?.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
    }
  ) as any
  const finalText = String(finalCompletion?.choices?.[0]?.message?.content || '').trim()
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
  _threadId: string,
  _userId?: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  caseKeywords?: string,
  options?: {
    useSearch?: boolean
    memoryContext?: string
    searchQueryOverride?: string
    searchModeOverride?: LegalSearchMode
    searchEngineOverride?: SearchEngine
    openaiModel?: string
    openaiFallbackModel?: string
    maxTokens?: number
    maxCompressionRetries?: number
    onToken?: (chunk: string) => void
  }
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const useSearch = options?.useSearch !== false
  if (!useSearch) {
    return invokePremiumLegalAgentStream(message, '', undefined, conversationHistory, caseKeywords, {
      useSearch: false,
      memoryContext: options?.memoryContext,
      openaiModel: options?.openaiModel || PREMIUM_PLUS_OPENAI_MODEL,
      openaiFallbackModel: options?.openaiFallbackModel || PREMIUM_PLUS_OPENAI_FALLBACK_MODEL,
      maxTokens: options?.maxTokens,
      maxCompressionRetries: options?.maxCompressionRetries,
      onToken: options?.onToken,
    })
  }

  const openaiModel = options?.openaiModel || PREMIUM_PLUS_OPENAI_MODEL
  const openaiFallbackModel = options?.openaiFallbackModel || PREMIUM_PLUS_OPENAI_FALLBACK_MODEL
  const toolLoop = await runPremiumPlusToolLoop(message, {
    openaiModel,
    openaiFallbackModel,
    searchEngineOverride: options?.searchEngineOverride || 'perplexity',
    conversationHistory,
    caseKeywords,
    memoryContext: options?.memoryContext,
  })

  const emitSyntheticStream = (text: string) => {
    if (!text) return
    for (const chunk of text.match(/.{1,24}/g) || []) {
      options?.onToken?.(chunk)
    }
  }

  if (toolLoop.directResponse) {
    const finalDirect = ensureCitationsForPremium(
      neutralizeLegalAdviceTone(stripMarkdown(stripUrlsFromText(toolLoop.directResponse))),
      toolLoop.sources,
      toolLoop.sources.length > 0
    )
    emitSyntheticStream(finalDirect.responseText)
    return {
      response: finalDirect.responseText,
      document_generated: false,
      guidance_provided: true,
      next_steps: [],
      sources: finalDirect.sources,
    }
  }

  const client = createPremiumPlusOpenAi()
  const finalMessages = [
    ...toolLoop.messages,
    {
      role: 'user',
      content: 'Now answer the user directly in plain text using any tool results already provided. Do not call any more tools.',
    },
  ]

  const stream = await callPremiumPlusOpenAi(
    client,
    openaiModel,
    openaiFallbackModel,
    finalMessages,
    {
      stream: true,
      toolsEnabled: false,
      maxTokens: options?.maxTokens || PREMIUM_PLUS_CONCISE_MAX_TOKENS,
    }
  ) as unknown as AsyncIterable<any>

  let finalText = ''
  for await (const chunk of stream) {
    const delta = chunk?.choices?.[0]?.delta?.content || ''
    if (delta) {
      finalText += delta
      options?.onToken?.(delta)
    }
  }

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
  }
): Promise<{ response: string; document_generated: boolean; guidance_provided: boolean; next_steps: string[]; sources?: Array<{ number: number; title: string; url: string }> }> {
  const basicProvider = chooseBasicProvider(userId || threadId)
  const agent = await createLegalAgent(conversationHistory, caseKeywords, undefined, {
    useSearch: false,
    systemPrompt: SYSTEM_PROMPT_FREE,
    memoryContext: options?.memoryContext,
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
