import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(async (payload: any) => {
          const combinedContent = Array.isArray(payload?.messages)
            ? payload.messages.map((message: any) => String(message?.content || '')).join('\n')
            : ''
          const isCaseStudy = combinedContent.includes('Please provide a comprehensive educational case study analysis')
          const isRoutingDecision = combinedContent.includes('Choose the retrieval mode for this user request before answer generation.')
          if (isRoutingDecision) {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      retrieval_mode: 'hybrid',
                      vector_query: 'relevant UK precedent',
                      web_query: 'current UK procedure guidance',
                      confidence: 0.78,
                      reasons: ['mixed-signals'],
                    }),
                  },
                  finish_reason: 'stop',
                },
              ],
            }
          }
          const content = isCaseStudy
            ? `CASE SUMMARY\n${'learning '.repeat(1200)}\n\nIn short: This is educational information only.`
            : 'Overview\n1. General guidance point.\n2. Practical note.\nIn short: This is general legal information support.'
          return {
            choices: [
              {
                message: { content },
                finish_reason: 'stop',
              },
            ],
          }
        }),
      },
    }
  }

  return { default: MockOpenAI, OpenAI: MockOpenAI }
})

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: vi.fn(async (payload: any) => {
        const userPrompt = String(payload?.messages?.[0]?.content || '')
        const isDecompose = userPrompt.includes('Output schema')
        const text = isDecompose
          ? JSON.stringify({
              retrieval_mode: 'hybrid',
              decomposition: 'User asks about facts and procedure.',
              vector_query: 'relevant UK precedent',
              web_query: 'current UK procedure guidance',
              confidence: 0.78,
              reasons: ['mixed-signals'],
            })
          : 'Structured Answer\n────────────────────\nIn short: This is refined legal guidance.'

        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 120, output_tokens: 80 },
        }
      }),
    }
  }

  return { default: MockAnthropic }
})

import { invokeBasicLegalAgent } from './legal-agent'
import { CaseStudyAgent } from './case-study-agent'
import { createDiscriminatorAgent } from './discriminator-agent'
import { decideRetrievalWithGenerator } from './legal-agent'

describe('agent smoke checks', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.GROQ_API_KEY = 'test-key'
    process.env.BASIC_OPENAI_ROUTING_PERCENT = '100'
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                retrieval_mode: 'hybrid',
                decomposition: 'User asks about facts and procedure.',
                vector_query: 'relevant UK precedent',
                web_query: 'current UK procedure guidance',
                confidence: 0.78,
                reasons: ['mixed-signals'],
              }),
            },
          },
        ],
      }),
      text: async () => '',
      headers: { get: () => null },
    })))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    process.env = { ...originalEnv }
  })

  it('basic legal agent returns a non-empty reply', async () => {
    const result = await invokeBasicLegalAgent(
      'What is CPR Part 7 in England and Wales?',
      'thread_smoke_basic',
      'user_smoke_basic',
      [],
      ''
    )

    expect(typeof result.response).toBe('string')
    expect(result.response.trim().length).toBeGreaterThan(0)
  })

  it('generator retrieval routing returns a routing decision', async () => {
    const result = await decideRetrievalWithGenerator(
      'My landlord kept my deposit and ignored my letter before action. What next?',
      [],
      'small claims'
    )

    expect(result).not.toBeNull()
    expect(result?.retrievalMode).toBe('hybrid')
    expect(result?.webQuery).toBe('current UK procedure guidance')
  })

  it('discriminator final-pass agent returns a streamlined reply', async () => {
    const agent = await createDiscriminatorAgent([], 'small claims', false)
    const result = await agent.invoke({
      input: 'What should I understand here?',
      comprehensiveAnswer: 'A longer draft answer from generator.',
      allSources: ['https://www.gov.uk/example'],
    })

    expect(typeof result.streamlinedAnswer).toBe('string')
    expect(result.streamlinedAnswer.trim().length).toBeGreaterThan(0)
  })

  it('case study agent returns educational content', async () => {
    const agent = new CaseStudyAgent()
    const result = await agent.generateCaseStudy(
      {
        title: 'Example v Example',
        citation: '[2024] EWHC 123',
        summary: 'This is a summary of the case facts and legal issues.',
        extracts: ['Extract one', 'Extract two'],
        court: 'High Court',
        year: 2024,
        outcome: 'Claim partly allowed',
        url: 'https://example.com/case',
      },
      { maxRetries: 1, timeout: 3000 }
    )

    expect(typeof result.content).toBe('string')
    expect(result.content.trim().length).toBeGreaterThan(0)
    expect(result.content.toLowerCase()).toContain('not legal advice')
  })
})
