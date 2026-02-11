import claudeLegalClient from '../providers/claude-legal-client'
import { logClaudeUsage } from '@/lib/utils/claude-usage'

const DISCRIMINATOR_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-5-20251101'

const stripMarkdown = (text: string): string => {
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
  includeCitations: boolean = false
): Promise<{ streamlinedAnswer: string; citedSourcesIndices: number[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set in the environment')
  }
  
  const sourcesList = allSources.map((url, i) => `[${i + 1}] ${url}`).join('\n')
  
  const citationRule = includeCitations
    ? 'Keep any inline citations like [1], [2] and add them where factual claims are made if missing.'
    : 'Do not include source citations like [1], [2], [3].'
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
7. Use clear section titles as plain text lines (do NOT end titles with a colon). Use headings only when the topic branches, and make them specific
8. Use short paragraphs (1 idea, 1-3 sentences, 2-4 lines)
9. Use numbered lists (1., 2., 3.) for ordered steps or hierarchy
10. Use bullets (•) for parallel ideas
11. Do not output tables.
12. Use divider lines only when shifting mode (explanation → examples, law → practical). Divider line must be exactly: ---
13. Always end with a one-sentence compression line starting with "In short:"
14. ${citationRule}
14. Keep any page references (e.g., "Page 4") if present
15. Dont allow any line of legal advice in its answer - if there is, word it in a way that is like support and guidance to the user.

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
4. Remove any source citations like [1], [2], [3]
5. Make it perfectly tailored to the user's question and history
6. Improve the format,presentation and structure of the answer - so when it is outputted it is well structured and easy to read for the user.
7. Always finish with "In short: ..." as a one-sentence compression layer.
8. Do not output tables.
8. Make sure the answer is conversational and engaging for a user who is a litigant in person.
9. when relevant or deemed helpful based on conversation context and history with user; if a legal concepts,terms,jargon or legislation like acts, statutes, etc is used, make sure to explain and educate the user like they have no background or knowledge on anything regarding the law of UK is to help them understand what it is, you may use scenarios or examples where relevant to make it more engaging and easier to understand for a litigant in person. 

Provide ONLY the final streamlined answer. No explanations needed.`

  const systemPrompt = `You are a UK litigant in person acting as a discriminator (critic, reviser, verifier) for legal guidance. Your job is to detect gaps, weak claims, missing steps, and formatting issues, then fix them. You are responsible for presentation, organisation,structure and making sure dialogue is conversational friendly. Streamline and improve while preserving accuracy. Output MUST be plain text only, with section titles as plain text lines (do NOT end titles with a colon). Use headings only when the topic branches, and make them specific. Use short paragraphs (1 idea, 1-3 sentences). Use numbered lists for ordered steps or hierarchy and bullets for parallel ideas. Do not output tables. Use divider lines only when shifting mode (explanation → examples, law → practical) and the divider line must be exactly: ---. Always end with a one-sentence compression line starting with "In short:". ${citationRule} Keep page references if present. No markdown.`

  const startedAt = Date.now()
  let completion
  try {
    completion = await claudeLegalClient.messages.create({
      model: DISCRIMINATOR_MODEL,
      max_tokens: 1000,
      temperature: 0.5,
      system: systemPrompt,
      messages: [
        { role: 'user', content: streamlinePrompt }
      ]
    })
    logClaudeUsage({
      model: DISCRIMINATOR_MODEL,
      usage: (completion as any)?.usage,
      success: true,
      latencyMs: Date.now() - startedAt,
      requestType: 'discriminator',
    })
  } catch (error: any) {
    logClaudeUsage({
      model: DISCRIMINATOR_MODEL,
      success: false,
      latencyMs: Date.now() - startedAt,
      requestType: 'discriminator',
      error: error?.message || String(error),
    })
    throw error
  }

  const streamed = completion.content[0]?.type === 'text' ? completion.content[0].text : comprehensiveAnswer
  let streamlinedAnswer = stripMarkdown(streamed)
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
  includeCitations: boolean = false
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
      const { streamlinedAnswer, citedSourcesIndices } = await streamlineAnswerForUser(comprehensiveAnswer, allSources, input, historyContext, caseKeywords, includeCitations)
      
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
