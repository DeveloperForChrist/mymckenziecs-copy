import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const anthropicMockState = vi.hoisted(() => {
  const flattenContent = (content: any): string => {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''
    return content
      .map((block: any) => {
        if (typeof block === 'string') return block
        if (block?.type === 'text') return String(block?.text || '')
        if (block?.type === 'tool_result') return String(block?.content || '')
        if (block?.type === 'tool_use') {
          return `${block?.name || ''} ${JSON.stringify(block?.input || {})}`.trim()
        }
        return ''
      })
      .join('\n')
  }

  const defaultText = 'Overview\n1. General guidance point.\n2. Practical note.\nIn short: This is general legal information support.'

  return {
    anthropicMessagesCreateMock: vi.fn(async (payload: any, _requestOptions?: any) => {
      const combinedContent = [
        flattenContent(payload?.system),
        ...(Array.isArray(payload?.messages)
          ? payload.messages.map((message: any) => flattenContent(message?.content))
          : []),
      ].join('\n')
      const hasToolResult = Array.isArray(payload?.messages) && payload.messages.some(
        (message: any) =>
          Array.isArray(message?.content) &&
          message.content.some((block: any) => block?.type === 'tool_result')
      )

      if (hasToolResult) {
        return {
          content: [{ type: 'text', text: defaultText }],
          usage: { input_tokens: 120, output_tokens: 36 },
        }
      }

      if (payload?.tools?.length) {
        if (combinedContent.includes('Earlier conversation marker: driver hit my car and ran away')) {
          return {
            content: [
              {
                type: 'text',
                text: 'I remember the earlier conversation about the driver hitting your car and leaving the scene.',
              },
            ],
            usage: { input_tokens: 96, output_tokens: 24 },
          }
        }

        if (combinedContent.toLowerCase().includes('case law')) {
          return {
            content: [
              {
                type: 'tool_use',
                id: 'toolu_case_law_1',
                name: 'case_law_search',
                input: {
                  query: 'driver hit my car and ran away case law',
                  scope: 'both',
                  limit: 3,
                },
              },
            ],
            usage: { input_tokens: 110, output_tokens: 18 },
          }
        }
      }

      return {
        content: [{ type: 'text', text: defaultText }],
        usage: { input_tokens: 90, output_tokens: 28 },
      }
    }),
    anthropicMessagesStreamMock: vi.fn((payload: any, _requestOptions?: any) => {
      const text = flattenContent(payload?.system).includes('Earlier conversation marker: driver hit my car and ran away')
        ? 'I remember the earlier conversation about the driver hitting your car and leaving the scene.'
        : defaultText
      const stream = {
        on: vi.fn((event: string, handler: (chunk: string) => void) => {
          if (event === 'text') handler(text)
          return stream
        }),
        finalMessage: vi.fn(async () => ({
          content: [{ type: 'text', text }],
          usage: { input_tokens: 118, output_tokens: 30 },
        })),
      }
      return stream
    }),
  }
})

const openAiMockState = vi.hoisted(() => ({
  openAiCreateMock: vi.fn(async (payload: any) => {
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
    if (payload?.stream) {
      const chunks = content.match(/.{1,24}/g) || [content]
      return {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield {
              choices: [
                {
                  delta: { content: chunk },
                  finish_reason: null,
                },
              ],
            }
          }
          yield {
            choices: [
              {
                delta: {},
                finish_reason: 'stop',
              },
            ],
          }
        },
      }
    }
    return {
      choices: [
        {
          message: { content },
          finish_reason: 'stop',
        },
      ],
    }
  }),
}))

const supabaseMockState = vi.hoisted(() => {
  const tables: string[] = []

  const buildCasesQuery = () => {
    const filters: Record<string, any> = {}
    return {
      select(this: any, _fields: string) {
        return this
      },
      eq(this: any, field: string, value: any) {
        filters[field] = value
        return this
      },
      is(this: any, field: string, value: any) {
        filters[`is:${field}`] = value
        return this
      },
      maybeSingle: vi.fn(async () => ({
        data:
          filters.id === 'case-123' &&
          filters.user_id === 'user-1' &&
          filters['is:deleted_at'] === null
            ? { id: 'case-123' }
            : null,
        error: null,
      })),
    }
  }

  const buildMessagesQuery = () => {
    const filters: Record<string, any> = {}
    return {
      select(this: any, _fields: string) {
        return this
      },
      eq(this: any, field: string, value: any) {
        filters[field] = value
        return this
      },
      order(this: any, _field: string, _options?: any) {
        return this
      },
      then: (resolve: (value: any) => any, reject?: (reason: any) => any) =>
        Promise.resolve({
          data:
            filters.case_id === 'case-123'
              ? [
                  {
                    role: 'user',
                    content: 'Earlier conversation marker: authorised case history',
                    timestamp: '2025-01-01T00:00:00Z',
                  },
                ]
              : [],
          error: null,
        }).then(resolve, reject),
    }
  }

  const from = vi.fn((table: string) => {
    tables.push(table)
    if (table === 'cases') return buildCasesQuery()
    if (table === 'messages') return buildMessagesQuery()
    throw new Error(`Unexpected Supabase table in test: ${table}`)
  })

  const reset = () => {
    from.mockClear()
    tables.length = 0
  }

  return { from, tables, reset }
})

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: anthropicMockState.anthropicMessagesCreateMock,
      stream: anthropicMockState.anthropicMessagesStreamMock,
    }
  }

  return { default: MockAnthropic, Anthropic: MockAnthropic }
})

vi.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: openAiMockState.openAiCreateMock,
      },
    }
  }

  return { default: MockOpenAI, OpenAI: MockOpenAI }
})

vi.mock('../../database/supabase-server', () => ({
  supabaseAdmin: {
    from: supabaseMockState.from,
  },
}))

import {
  createLegalAgent,
  invokeBasicLegalAgent,
  invokeLegalAgent,
  invokePremiumLegalAgent,
  invokePremiumLegalAgentStream,
  invokePremiumPlusLegalAgent,
  invokePremiumPlusLegalAgentStream,
} from './legal-agent'
import { CaseStudyAgent } from './case-study-agent'
import { SearchTool } from '../tools/search-tool'

describe('agent smoke checks', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.PREMIUM_PLUS_ANTHROPIC_PROMPT_CACHING = 'true'
    process.env.GROQ_API_KEY = 'test-key'
    process.env.BASIC_OPENAI_ROUTING_PERCENT = '100'
    anthropicMockState.anthropicMessagesCreateMock.mockClear()
    anthropicMockState.anthropicMessagesStreamMock.mockClear()
    openAiMockState.openAiCreateMock.mockClear()
    supabaseMockState.reset()
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

  it('only loads case history when the supplied user owns the case', async () => {
    await createLegalAgent([], undefined, 'case-123', {
      caseAccessUserId: 'user-1',
      useSearch: false,
    })
    expect(supabaseMockState.tables).toEqual(['cases', 'messages'])

    supabaseMockState.reset()
    await createLegalAgent([], undefined, 'case-123', {
      caseAccessUserId: 'user-2',
      useSearch: false,
    })
    expect(supabaseMockState.tables).toEqual(['cases'])

    supabaseMockState.reset()
    await createLegalAgent([], undefined, 'case-123', {
      useSearch: false,
    })
    expect(supabaseMockState.tables).toEqual([])
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

  it('premium prompt does not claim direct tool access', async () => {
    await invokePremiumLegalAgent(
      'What does claimant mean in a small claim?',
      'thread_smoke_premium_prompt_split',
      'user_smoke_premium_prompt_split',
      [],
      'small claims',
      { useSearch: false }
    )

    const [payload] = (openAiMockState.openAiCreateMock.mock.calls[0] || []) as any[]
    const systemPrompt = Array.isArray(payload?.messages)
      ? String(payload.messages.find((message: any) => message?.role === 'system')?.content || '')
      : ''

    expect(systemPrompt).toContain('You are MyMckenzieCS Assistant')
    expect(systemPrompt).not.toContain('You have access to web_search')
    expect(systemPrompt).not.toContain('case_law_search')
  })

  it('premium agent can decide to answer directly without web search when search is not forced', async () => {
    const searchSpy = vi.spyOn(SearchTool.prototype, '_call')

    const result = await invokePremiumLegalAgent(
      'What does claimant mean in a small claim?',
      'thread_smoke_premium_auto_direct',
      'user_smoke_premium_auto_direct',
      [],
      'small claims'
    )

    expect(result.response).toContain('In short:')
    expect(searchSpy).not.toHaveBeenCalled()
  })

  it('premium agent can decide to use web search when search is not forced', async () => {
    const searchSpy = vi.spyOn(SearchTool.prototype, '_call').mockResolvedValue(
      JSON.stringify({
        query: 'current UK procedure guidance',
        mode: 'general',
        reviewedCount: 1,
        sources: ['https://www.gov.uk/make-court-claim-for-money'],
        packet: 'Current UK procedure guidance for early claim steps.',
        sourceMode: 'engine',
      })
    )

    const result = await invokePremiumLegalAgent(
      'I am at the pre-claim stage. What claim form and procedural steps are usually involved?',
      'thread_smoke_premium_auto_search',
      'user_smoke_premium_auto_search',
      [],
      'small claims'
    )

    expect(typeof result.response).toBe('string')
    expect(result.response.trim().length).toBeGreaterThan(0)
    expect(searchSpy).toHaveBeenCalledTimes(1)
    const searchPayload = JSON.parse(String(searchSpy.mock.calls[0]?.[0] || '{}'))
    expect(searchPayload.engine).toBe('brave')
    expect(typeof searchPayload.query).toBe('string')
    expect(searchPayload.query.length).toBeGreaterThan(0)
  })

  it('premium stream emits progress statuses on the web-search path', async () => {
    const searchSpy = vi.spyOn(SearchTool.prototype, '_call').mockResolvedValue(
      JSON.stringify({
        query: 'current UK procedure guidance',
        mode: 'general',
        reviewedCount: 1,
        sources: ['https://www.gov.uk/make-court-claim-for-money'],
        packet: 'Current UK procedure guidance for early claim steps.',
        sourceMode: 'engine',
      })
    )
    const onStatus = vi.fn()
    const onToken = vi.fn()

    const result = await invokePremiumLegalAgentStream(
      'I am at the pre-claim stage. What claim form and procedural steps are usually involved?',
      'thread_smoke_premium_stream_status',
      'user_smoke_premium_stream_status',
      [],
      'small claims',
      {
        autoDecideSearch: true,
        openaiModel: 'gpt-4.1-mini',
        openaiFallbackModel: 'gpt-4.1',
        onStatus,
        onToken,
      }
    )

    expect(result.response).toContain('In short:')
    expect(onStatus).toHaveBeenCalledWith('Thinking...')
    expect(onStatus).toHaveBeenCalledWith('Checking web sources...')
    expect(onStatus).toHaveBeenCalledWith('Drafting answer...')
    expect(onToken).toHaveBeenCalled()
    expect(searchSpy).toHaveBeenCalledTimes(1)
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
        anthropicModel: 'claude-opus-4-6',
        anthropicFallbackModel: 'claude-sonnet-4-6',
      }
    )

    expect(typeof result.response).toBe('string')
    expect(result.response.trim().length).toBeGreaterThan(0)
  })

  it('premium plus tool path explicitly includes tool instructions', async () => {
    await invokePremiumPlusLegalAgent(
      'Can you give case law on this?',
      'thread_smoke_premium_plus_prompt_split',
      'user_smoke_premium_plus_prompt_split',
      [],
      'road traffic incident',
      {
        useSearch: true,
        anthropicModel: 'claude-sonnet-4-6',
        anthropicFallbackModel: 'claude-opus-4-6',
      }
    )

    const [payload] = (anthropicMockState.anthropicMessagesCreateMock.mock.calls[0] || []) as any[]
    const systemPrompt = Array.isArray(payload?.system)
      ? String(payload.system[0]?.text || '')
      : String(payload?.system || '')

    expect(systemPrompt).toContain('TOOL EXECUTION')
    expect(systemPrompt).toContain('You have access to web_search and case_law_search.')
  })

  it('premium plus stream bypasses the tool loop for stable explanatory questions', async () => {
    const onToken = vi.fn()

    const result = await invokePremiumPlusLegalAgentStream(
      'Explain promissory estoppel in plain English.',
      'thread_smoke_premium_plus_stream_direct',
      'user_smoke_premium_plus_stream_direct',
      [],
      'contract law',
      {
        autoDecideSearch: true,
        anthropicModel: 'claude-sonnet-4-6',
        anthropicFallbackModel: 'claude-opus-4-6',
        onToken,
      }
    )

    expect(result.response).toContain('In short:')
    expect(onToken).toHaveBeenCalled()
    expect(anthropicMockState.anthropicMessagesCreateMock).not.toHaveBeenCalled()
    expect(anthropicMockState.anthropicMessagesStreamMock).toHaveBeenCalledTimes(1)
  })

  it('premium plus stream emits progress statuses on the tool path', async () => {
    const onStatus = vi.fn()
    const onToken = vi.fn()

    const result = await invokePremiumPlusLegalAgentStream(
      'Can you give case law on this?',
      'thread_smoke_premium_plus_stream_status',
      'user_smoke_premium_plus_stream_status',
      [],
      'road traffic incident',
      {
        useSearch: true,
        anthropicModel: 'claude-sonnet-4-6',
        anthropicFallbackModel: 'claude-opus-4-6',
        onStatus,
        onToken,
      }
    )

    expect(result.response).toContain('In short:')
    expect(onStatus).toHaveBeenCalledWith('Thinking...')
    expect(onStatus).toHaveBeenCalledWith('Retrieving case law...')
    expect(onStatus).toHaveBeenCalledWith('Writing answer...')
    expect(onToken).toHaveBeenCalled()
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
        anthropicModel: 'claude-opus-4-6',
        anthropicFallbackModel: 'claude-sonnet-4-6',
      }
    )

    expect(result.response).toContain('I remember the earlier conversation')
  })

  it('premium plus agent enables Anthropic prompt caching on its tool path', async () => {
    await invokePremiumPlusLegalAgent(
      'Can you give case law on this?',
      'thread_smoke_premium_plus_prompt_cache',
      'user_smoke_premium_plus_prompt_cache',
      [
        {
          role: 'user',
          content: 'Earlier conversation marker: driver hit my car and ran away',
        },
      ],
      'road traffic incident',
      {
        useSearch: true,
        anthropicModel: 'claude-opus-4-6',
        anthropicFallbackModel: 'claude-sonnet-4-6',
      }
    )

    const [payload, requestOptions] = (anthropicMockState.anthropicMessagesCreateMock.mock.calls[0] || []) as any[]
    expect(Array.isArray(payload?.system)).toBe(true)
    expect(payload?.system?.[0]).toMatchObject({
      type: 'text',
      cache_control: { type: 'ephemeral', ttl: '5m' },
    })
    expect(payload?.tools?.[payload.tools.length - 1]).toMatchObject({
      name: 'case_law_search',
      cache_control: { type: 'ephemeral', ttl: '5m' },
    })
    expect(requestOptions?.headers?.['anthropic-beta']).toContain('prompt-caching-2024-07-31')
  })

  it('premium plus agent can keep deep earlier thread history when provided a full-thread limit', async () => {
    const deepHistory = [
      {
        role: 'user',
        content: 'Earlier conversation marker: driver hit my car and ran away',
      },
      ...Array.from({ length: 50 }, (_, index) => ({
        role: index % 2 === 0 ? 'assistant' : 'user',
        content: `Later filler turn ${index + 1}`,
      })),
    ]

    const result = await invokePremiumPlusLegalAgent(
      'Can you give case law on this?',
      'thread_smoke_premium_plus_deep_history',
      'user_smoke_premium_plus_deep_history',
      deepHistory,
      'road traffic incident',
      {
        useSearch: true,
        anthropicModel: 'claude-opus-4-6',
        anthropicFallbackModel: 'claude-sonnet-4-6',
        historyLimit: deepHistory.length,
      }
    )

    expect(result.response).toContain('I remember the earlier conversation')
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
