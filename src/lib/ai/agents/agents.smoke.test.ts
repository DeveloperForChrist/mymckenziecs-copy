import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(async (payload: any) => {
          const combinedContent = Array.isArray(payload?.messages)
            ? payload.messages.map((message: any) => String(message?.content || '')).join('\n')
            : ''
          if (combinedContent.includes('routing timeout sentinel')) {
            return new Promise<any>(() => {})
          }
          if (combinedContent.includes('Earlier conversation marker: driver hit my car and ran away')) {
            return {
              choices: [
                {
                  message: {
                    content: 'I remember the earlier conversation about the driver hitting your car and leaving the scene.',
                  },
                  finish_reason: 'stop',
                },
              ],
            }
          }
          const isCaseStudy = combinedContent.includes('Please provide a comprehensive educational case study analysis')
          const isRoutingDecision = combinedContent.includes('Choose the retrieval mode for this user request before answer generation.')
          if (isRoutingDecision) {
            if (combinedContent.includes('What does claimant mean')) {
              return {
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        retrieval_mode: 'direct',
                        vector_query: '',
                        web_query: '',
                        confidence: 0.81,
                        reasons: ['stable-legal-concept'],
                      }),
                    },
                    finish_reason: 'stop',
                  },
                ],
              }
            }
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

import {
  decidePremiumPlusPlanWithGroq,
  decideRetrievalWithGenerator,
  invokeBasicLegalAgent,
  invokeLegalAgent,
  invokePremiumLegalAgent,
  invokePremiumPlusLegalAgent,
} from './legal-agent'
import { CaseStudyAgent } from './case-study-agent'

describe('agent smoke checks', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.GROQ_API_KEY = 'test-key'
    process.env.BASIC_OPENAI_ROUTING_PERCENT = '100'
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('api.groq.com/openai/v1/chat/completions')) {
        const body = typeof init?.body === 'string' ? init.body : ''
        const isSimpleQuestion = body.includes('What does claimant mean in a small claim?')
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(
                  isSimpleQuestion
                    ? {
                        action: 'answer',
                        answer: 'A claimant is the person bringing the claim.\n\nIn short: It is the person asking the court or tribunal for a remedy.',
                        confidence: 0.92,
                        reasons: ['simple-stable-definition'],
                      }
                    : {
                        action: 'execute',
                        retrieval_mode: 'hybrid',
                        tools: [
                          { tool: 'web_search', web_mode: 'general', query: 'current UK procedure guidance' },
                          { tool: 'case_law', query: 'relevant UK precedent' },
                        ],
                        decomposition: 'User asks about facts and procedure.',
                        vector_query: 'relevant UK precedent',
                        web_query: 'current UK procedure guidance',
                        confidence: 0.78,
                        reasons: ['mixed-signals'],
                      }
                ),
              },
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }

      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                retrieval_mode: 'hybrid',
                tools: [
                  { tool: 'web_search_general', query: 'current UK procedure guidance' },
                  { tool: 'case_law_rag', query: 'relevant UK precedent' },
                ],
                decomposition: 'User asks about facts and procedure.',
                vector_query: 'relevant UK precedent',
                web_query: 'current UK procedure guidance',
                confidence: 0.78,
                reasons: ['mixed-signals'],
              }),
            },
          },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
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

  it('direct legal agent can use supplied earlier-thread memory context', async () => {
    const result = await invokeLegalAgent(
      'Can you give case law on this?',
      'thread_smoke_direct_memory',
      'user_smoke_direct_memory',
      [],
      '',
      {
        useSearch: false,
        memoryContext: 'Relevant earlier thread memory:\n- Earlier conversation marker: driver hit my car and ran away',
      }
    )

    expect(result.response).toContain('I remember the earlier conversation')
  })

  it('direct legal agent path returns a usable answer', async () => {
    const result = await invokeLegalAgent(
      'What does claimant mean in a small claim?',
      'thread_smoke_direct_review',
      'user_smoke_direct_review',
      [],
      'small claims',
      { useSearch: false }
    )

    expect(typeof result.response).toBe('string')
    expect(result.response.trim().length).toBeGreaterThan(0)
    expect(result.response).toContain('In short:')
  })

  it('premium plan uses its own premium agent wrapper', async () => {
    const result = await invokePremiumLegalAgent(
      'What does claimant mean in a small claim?',
      'thread_smoke_premium',
      'user_smoke_premium',
      [],
      'small claims',
      { useSearch: false }
    )

    expect(typeof result.response).toBe('string')
    expect(result.response.trim().length).toBeGreaterThan(0)
  })

  it('premium plus plan uses its own Premium+ agent wrapper', async () => {
    const result = await invokePremiumPlusLegalAgent(
      'Explain promissory estoppel in plain English.',
      'thread_smoke_premium_plus',
      'user_smoke_premium_plus',
      [],
      'contract law',
      {
        useSearch: false,
        openaiModel: 'gpt-5.2',
        openaiFallbackModel: 'gpt-4.1',
      }
    )

    expect(typeof result.response).toBe('string')
    expect(result.response.trim().length).toBeGreaterThan(0)
  })

  it('premium plus agent uses earlier conversation history in its own tool path', async () => {
    const result = await invokePremiumPlusLegalAgent(
      'Can you give case law on this?',
      'thread_smoke_premium_plus_history',
      'user_smoke_premium_plus_history',
      [
        {
          role: 'user',
          content: 'Earlier conversation marker: driver hit my car and ran away',
        },
        {
          role: 'assistant',
          content: 'We discussed fail to stop, fail to report, and assault issues.',
        },
      ],
      'road traffic incident',
      {
        useSearch: true,
        openaiModel: 'gpt-5.2',
        openaiFallbackModel: 'gpt-4.1',
      }
    )

    expect(result.response).toContain('I remember the earlier conversation')
  })

  it('premium plus groq planner can return a direct answer for a simple question', async () => {
    const result = await decidePremiumPlusPlanWithGroq(
      'What does claimant mean in a small claim?',
      [],
      'small claims'
    )

    expect(result).not.toBeNull()
    expect(result?.action).toBe('answer')
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

  it('premium plus retrieval routing can choose direct for stable questions', async () => {
    const result = await decideRetrievalWithGenerator(
      'What does claimant mean in a small claim?',
      [],
      'small claims'
    )

    expect(result).not.toBeNull()
    expect(result?.retrievalMode).toBe('direct')
    expect(result?.webQuery).toBeUndefined()
    expect(result?.vectorQuery).toBeUndefined()
  })

  it('generator retrieval routing falls back quickly when the routing model stalls', async () => {
    process.env.ROUTING_DECISION_TIMEOUT_MS = '1'

    const result = await decideRetrievalWithGenerator(
      'routing timeout sentinel',
      [],
      'small claims'
    )

    expect(result).toBeNull()
  })

  it('legal agent returns the generator answer directly on the direct path', async () => {
    const result = await invokeLegalAgent(
      'What does claimant mean in a small claim?',
      'thread_smoke_direct_only',
      'user_smoke_direct_only',
      [],
      'small claims',
      { useSearch: false }
    )

    expect(typeof result.response).toBe('string')
    expect(result.response.trim().length).toBeGreaterThan(0)
    expect(result.response).toContain('Overview')
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
