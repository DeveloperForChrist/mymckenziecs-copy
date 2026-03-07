import Anthropic from '@anthropic-ai/sdk'
import { logClaudeUsage } from '@/lib/utils/claude-usage'

export type PlannerDecomposition = {
  retrievalMode: 'web_only' | 'vector_only' | 'hybrid'
  decomposition: string
  vectorQuery?: string
  webQuery?: string
  clarificationQuestion?: string
  confidence?: number
  reasons: string[]
}

const PLANNER_CLAUDE_MODEL =
  process.env.PREMIUM_PLUS_PLANNER_CLAUDE_MODEL ||
  process.env.PREMIUM_PLUS_CLAUDE_MODEL ||
  'claude-haiku-4-5-20251001'
const PLANNER_CLAUDE_FALLBACK_MODEL =
  process.env.PREMIUM_PLUS_PLANNER_CLAUDE_FALLBACK_MODEL ||
  process.env.PREMIUM_PLUS_CLAUDE_FALLBACK_MODEL ||
  ''
const PLANNER_MAX_TOKENS = Number.isFinite(Number(process.env.PREMIUM_PLUS_PLANNER_MAX_TOKENS))
  ? Math.max(250, Math.floor(Number(process.env.PREMIUM_PLUS_PLANNER_MAX_TOKENS)))
  : 500

const buildHistoryContext = (
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): string => {
  if (!history || history.length === 0) return ''
  const lines = history
    .filter((entry) => entry && typeof entry.content === 'string')
    .map((entry) => `${entry.role === 'assistant' ? 'Assistant' : 'User'}: ${entry.content.trim()}`)
    .filter((line) => line.length > 0)
  if (lines.length === 0) return ''
  return `Conversation history:\n${lines.join('\n')}\n`
}

const parsePlannerJson = (raw: string): PlannerDecomposition | null => {
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

      const decomposition = String(parsed?.decomposition || parsed?.summary || '').trim()
      const vectorQuery = String(parsed?.vector_query || parsed?.vectorQuery || '').trim()
      const webQuery = String(parsed?.web_query || parsed?.webQuery || '').trim()
      const clarificationQuestion = String(
        parsed?.clarification_question || parsed?.clarificationQuestion || ''
      ).trim()
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
        decomposition,
        vectorQuery: vectorQuery || undefined,
        webQuery: webQuery || undefined,
        clarificationQuestion: clarificationQuestion || undefined,
        confidence,
        reasons,
      }
    } catch {
      // try next candidate
    }
  }

  return null
}

const runClaudePlanner = async (modelName: string, userPrompt: string): Promise<string> => {
  const anthropicApiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!anthropicApiKey) return ''

  const startedAt = Date.now()
  const client = new Anthropic({ apiKey: anthropicApiKey })
  try {
    const completion = await client.messages.create({
      model: modelName,
      max_tokens: PLANNER_MAX_TOKENS,
      temperature: 0.1,
      system: [
        'You are the Premium Plus planner agent for UK litigant-in-person support.',
        'You only do pre-generation planning and retrieval routing.',
        'Return JSON only. No prose, no markdown, no code fences.',
      ].join(' '),
      messages: [{ role: 'user', content: userPrompt }],
    })
    logClaudeUsage({
      model: modelName,
      usage: (completion as any)?.usage,
      success: true,
      latencyMs: Date.now() - startedAt,
      requestType: 'planner-decompose',
    })
    return completion.content[0]?.type === 'text' ? completion.content[0].text : ''
  } catch (error: any) {
    logClaudeUsage({
      model: modelName,
      success: false,
      latencyMs: Date.now() - startedAt,
      requestType: 'planner-decompose',
      error: error?.message || String(error),
    })
    throw error
  }
}

export async function decomposeWithPlanner(
  input: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  caseKeywords?: string
): Promise<PlannerDecomposition | null> {
  const anthropicApiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!anthropicApiKey) return null

  const historyContext = buildHistoryContext(history)
  const userPrompt = `Decompose the user input and choose retrieval mode before answer generation.
User message:
${input}

${caseKeywords ? `Case context: ${caseKeywords}\n` : ''}${historyContext}

Rules:
1. retrieval_mode must be one of: web_only, vector_only, hybrid.
2. Use vector_only when legal authorities or precedent are dominant.
3. Use web_only when current procedure, forms, deadlines, or official guidance are dominant.
4. Use hybrid when both are materially relevant.
5. decomposition should be 2-6 concise lines summarizing what matters.
6. vector_query and web_query must be short, focused retrieval queries.
7. clarification_question should be set only when a missing fact blocks safe guidance.
8. confidence must be 0 to 1 for routing certainty.
9. reasons should list why the mode was selected.
10. Do not answer the user. Do not provide legal guidance. Only plan the next step.

Output schema:
{
  "retrieval_mode": "web_only|vector_only|hybrid",
  "decomposition": "string",
  "vector_query": "string",
  "web_query": "string",
  "clarification_question": "string",
  "confidence": 0.0,
  "reasons": ["string"]
}`

  try {
    const primary = await runClaudePlanner(PLANNER_CLAUDE_MODEL, userPrompt)
    const parsed = parsePlannerJson(primary)
    if (parsed) return parsed
  } catch {
    // try fallback below
  }

  if (PLANNER_CLAUDE_FALLBACK_MODEL && PLANNER_CLAUDE_FALLBACK_MODEL !== PLANNER_CLAUDE_MODEL) {
    try {
      const fallback = await runClaudePlanner(PLANNER_CLAUDE_FALLBACK_MODEL, userPrompt)
      const parsed = parsePlannerJson(fallback)
      if (parsed) return parsed
    } catch {
      return null
    }
  }

  return null
}
