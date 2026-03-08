import Anthropic from '@anthropic-ai/sdk'
import { logClaudeUsage } from '@/lib/utils/claude-usage'
import { neutralizeLegalAdviceTone } from './legal-tone'

const DISCRIMINATOR_MODEL =
  process.env.PREMIUM_PLUS_CLAUDE_MODEL ||
  'claude-opus-4-5-20251101'
const DISCRIMINATOR_CLAUDE_FALLBACK_MODEL =
  process.env.PREMIUM_PLUS_CLAUDE_FALLBACK_MODEL ||
  ''
const DISCRIMINATOR_MAX_TOKENS = 800

class DiscriminatorTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscriminatorTimeoutError'
  }
}

const withDiscriminatorTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, modelName: string): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise

  let timeoutId: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new DiscriminatorTimeoutError(`Discriminator model ${modelName} timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

const getDiscriminatorTimeoutMs = () =>
  Number.isFinite(Number(process.env.PREMIUM_PLUS_DISCRIMINATOR_TIMEOUT_MS))
    ? Math.max(1000, Math.floor(Number(process.env.PREMIUM_PLUS_DISCRIMINATOR_TIMEOUT_MS)))
    : 10000

const stripMarkdown = (text: string): string => {
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

async function streamlineAnswerForUser(
  comprehensiveAnswer: string,
  allSources: string[],
  userQuery: string,
  historyContext: string,
  caseKeywords?: string,
  includeCitations: boolean = false,
  discriminatorModel?: string,
  discriminatorFallbackModel?: string
): Promise<{ streamlinedAnswer: string; citedSourcesIndices: number[] }> {
  const sourcesList = allSources.map((url, i) => `[${i + 1}] ${url}`).join('\n')
  
  const citationRule = includeCitations
    ? 'Keep any inline citations like [1], [2] and add them where factual claims are made if missing.'
    : 'Do not include source citations like [1], [2], [3].'
  const citationTaskRule = includeCitations
    ? 'Preserve and improve source citations like [1], [2], [3] so factual claims are attributable.'
    : 'Remove any source citations like [1], [2], [3].'
  const streamlinePrompt = `You are the discriminator agent (critic, reviser, verifier) reviewing the assistant's answer. Your goal is to decide if the answer is genuinely helpful to the user based on their specific question and the conversation history. If it is missing anything important, add it. If it is too long or unfocused, streamline it.

UNDERSTAND THE USER'S ACTUAL NEED:
User's Specific Question: "${userQuery}"
${caseKeywords ? `User's Case Context: ${caseKeywords}` : ''}

${historyContext}

You will receive a long, detailed legal answer. Your job is to:
1. Review it as if you are the user and judge whether it fully answers their question
2. If it is missing important steps or clarifications, add them
3. If it is unneccessarily long or off-topic, remove irrelevant parts
4. Improve structure and readability (use bullets • for lists)
5. Keep the tone warm, reassuring, and accessible
6. Use plain English without markdown formatting
7. Use plain text only. Use short standalone heading lines rather than markdown headings.
8. Use short paragraphs (1 idea, 1-3 sentences, 2-4 lines)
9. Use numbered lists only for ordered steps, sequence, hierarchy, or priority
10. Use bullet points only for parallel ideas, options, examples, evidence, or warnings
11. Do not output tables, ALL CAPS headings, markdown headings, markdown bold, markdown italics, or markdown links.
12. Use the divider line only when shifting mode (explanation → examples, law → practical, issue → next steps).
13. Always end with a one-sentence compression line starting with "In short:"
14. ${citationRule}
14. Keep any page references (e.g., "Page 4") if present
15. Dont allow any line of legal advice in its answer - if there is, word it in a way that is like support and guidance to the user.
16. Avoid definitive conclusions on the user's exact facts. Use neutral language like "may", "can", and "generally".
17. Keep the final answer concise; target roughly 500-650 tokens.

All Available Sources (for your internal review only):
${sourcesList}

Comprehensive Answer to Review:
${comprehensiveAnswer}

Your task:
1. Decide if the answer fully helps the user, supports or educates them on their queries and it is conversationally engaging
2. Add missing useful details if needed
3. Streamline for clarity and relevance
2. Add missing useful details if needed
3. Streamline for clarity and relevance
4. ${citationTaskRule}
5. Make it perfectly tailored to the user's question and history
6. Improve the format,presentation and structure of the answer - so when it is outputted it is well structured and easy to read for the user.
7. Always finish with "In short: ..." as a one-sentence compression layer.
8. Do not output tables.
8. Make sure the answer is conversational and engaging for a user who is a litigant in person.
9. when relevant or deemed helpful based on conversation context and history with user; if a legal concepts,terms,jargon or legislation like acts, statutes, etc is used, make sure to explain and educate the user like they have no background or knowledge on anything regarding the law of UK is to help them understand what it is, you may use scenarios or examples where relevant to make it more engaging and easier to understand for a litigant in person. 

Provide ONLY the final streamlined answer. No explanations needed.`

  const systemPrompt = `You are a UK litigant in person acting as a discriminator (critic, reviser, verifier) for legal guidance. Your job is to detect gaps, weak claims, missing steps, and formatting issues, then fix them. You are responsible for presentation, organisation,structure and making sure dialogue is conversational friendly. Streamline and improve while preserving accuracy. Output MUST be plain text only. Use short standalone heading lines rather than markdown headings. Use short paragraphs (1 idea, 1-3 sentences). Use numbered lists only for ordered steps, sequence, hierarchy, or priority. Use bullet points only for parallel ideas, options, examples, evidence, or warnings. Do not output tables, ALL CAPS headings, markdown headings, markdown bold, markdown italics, or markdown links. Use the divider line only when shifting mode (explanation → examples, law → practical, issue → next steps). Always end with a one-sentence compression line starting with "In short:". ${citationRule} Keep page references if present.`

  const runClaudeDiscriminator = async (modelName: string, apiKey: string): Promise<string> => {
    const startedAt = Date.now()
    const claudeLegalClient = new Anthropic({ apiKey })
    const discriminatorTimeoutMs = getDiscriminatorTimeoutMs()
    try {
      const completion = await withDiscriminatorTimeout(
        claudeLegalClient.messages.create({
          model: modelName,
          max_tokens: DISCRIMINATOR_MAX_TOKENS,
          temperature: 0.5,
          system: systemPrompt,
          messages: [
            { role: 'user', content: streamlinePrompt }
          ]
        }),
        discriminatorTimeoutMs,
        modelName
      )
      logClaudeUsage({
        model: modelName,
        usage: (completion as any)?.usage,
        success: true,
        latencyMs: Date.now() - startedAt,
        requestType: 'discriminator',
      })
      return completion.content[0]?.type === 'text' ? completion.content[0].text : comprehensiveAnswer
    } catch (error: any) {
      logClaudeUsage({
        model: modelName,
        success: false,
        latencyMs: Date.now() - startedAt,
        requestType: 'discriminator',
        error: error?.message || String(error),
      })
      throw error
    }
  }

  const anthropicApiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set for discriminator')
  }
  const activeDiscriminatorModel = (discriminatorModel || DISCRIMINATOR_MODEL).trim() || DISCRIMINATOR_MODEL
  const activeDiscriminatorFallbackModel = (discriminatorFallbackModel || DISCRIMINATOR_CLAUDE_FALLBACK_MODEL).trim()
  let streamed = comprehensiveAnswer
  let lastProviderError: unknown = null

  try {
    streamed = await runClaudeDiscriminator(activeDiscriminatorModel, anthropicApiKey)
  } catch (primaryClaudeError) {
    lastProviderError = primaryClaudeError
    const fallbackModel = activeDiscriminatorFallbackModel
    if (fallbackModel && fallbackModel !== activeDiscriminatorModel) {
      try {
        streamed = await runClaudeDiscriminator(fallbackModel, anthropicApiKey)
      } catch (fallbackClaudeError) {
        lastProviderError = fallbackClaudeError
        throw fallbackClaudeError
      }
    } else {
      throw primaryClaudeError
    }
  }
  if (lastProviderError && !streamed) throw lastProviderError

  let streamlinedAnswer = stripMarkdown(streamed)
  streamlinedAnswer = neutralizeLegalAdviceTone(streamlinedAnswer)
  if (!includeCitations) {
    // Remove any leftover [1] style citations.
    streamlinedAnswer = streamlinedAnswer.replace(/\s*\[\d+\]/g, '')
  }
  const citationPattern = /\[(\d+)\]/g
  const citationNumbers = new Set<number>()
  let match: RegExpExecArray | null
  citationPattern.lastIndex = 0
  while ((match = citationPattern.exec(streamlinedAnswer)) !== null) {
    const num = parseInt(match[1], 10)
    if (!Number.isNaN(num)) citationNumbers.add(num)
  }

  if (includeCitations && citationNumbers.size === 0 && allSources.length > 0) {
    const lines = streamlinedAnswer.split('\n')
    let firstBodyIndex = -1
    let summaryIndex = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      if (/^in short\s*:/i.test(line)) {
        summaryIndex = i
        continue
      }
      const isHeadingLike =
        (line.length <= 48 && /^[A-Z][^.!?]*$/.test(line)) ||
        (line.endsWith(':') && line.length <= 48)
      if (!isHeadingLike && firstBodyIndex === -1) {
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
    streamlinedAnswer = lines.join('\n')

    citationNumbers.clear()
    citationPattern.lastIndex = 0
    while ((match = citationPattern.exec(streamlinedAnswer)) !== null) {
      const num = parseInt(match[1], 10)
      if (!Number.isNaN(num)) citationNumbers.add(num)
    }
  }

  const citedSourcesIndices = Array.from(citationNumbers)
    .map((num) => num - 1)
    .filter((idx) => idx >= 0 && idx < allSources.length)
    .sort((a, b) => a - b)

  return { streamlinedAnswer: streamlinedAnswer.trim(), citedSourcesIndices }
}

export async function createDiscriminatorAgent(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  caseKeywords?: string,
  includeCitations: boolean = false,
  options?: {
    discriminatorModel?: string
    discriminatorFallbackModel?: string
  }
) {
  return {
    async invoke({ 
      input, 
      comprehensiveAnswer,
      allSources
    }: { 
      input: string
      comprehensiveAnswer: string
      allSources: string[]
    }): Promise<{ streamlinedAnswer: string; citedSources?: Array<{ number: number; title: string; url: string }> }> {
      const historyContext = buildHistoryContext(conversationHistory)
      const { streamlinedAnswer, citedSourcesIndices } = await streamlineAnswerForUser(
        comprehensiveAnswer,
        allSources,
        input,
        historyContext,
        caseKeywords,
        includeCitations,
        options?.discriminatorModel,
        options?.discriminatorFallbackModel
      )
      
      // Format cited sources
      const citedSources = citedSourcesIndices.map((idx) => {
        const url = allSources[idx]
        let title = url
        try {
          const urlObj = new URL(url)
          title = urlObj.hostname.replace('www.', '') + (urlObj.pathname !== '/' ? urlObj.pathname.split('/').pop() || '' : '')
        } catch {
          title = url
        }
        
        return {
          number: idx + 1,
          title: title.length > 50 ? title.substring(0, 50) + '...' : title,
          url
        }
      })
      
      return { 
        streamlinedAnswer: streamlinedAnswer,
        citedSources: citedSources.length > 0 ? citedSources : undefined
      }
    }
  }
}
