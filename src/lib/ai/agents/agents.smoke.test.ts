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
        const offeredToolNames = Array.isArray(payload.tools)
          ? payload.tools.map((tool: any) => String(tool?.name || tool?.function?.name || ''))
          : []
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

        if (combinedContent.toLowerCase().includes('case law') && offeredToolNames.includes('case_law_search')) {
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

const milvusMockState = vi.hoisted(() => ({
  searchByTextMock: vi.fn(async () => [] as any[]),
}))

const supabaseMockState = vi.hoisted(() => {
  const tables: string[] = []
  const caseLawRows = [
    {
      id: 'fallback-case-1',
      citation: '[2024] EWHC 123',
      title: 'Driver Hit My Car and Ran Away v Example',
      url: 'https://example.com/fallback-authority',
      summary: 'A fallback authority summary about a driver hitting a car and leaving the scene.',
      extracts: ['Driver hit my car and ran away after a confrontation.'],
      case_type: 'general',
      year: 2024,
      court: 'High Court',
      outcome: 'Claim partly allowed',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ]

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

  const buildCaseLawQuery = () => {
    const filters: Record<string, any> = {}
    return {
      select(this: any, _fields: string) {
        return this
      },
      order(this: any, _field: string, _options?: any) {
        return this
      },
      limit(this: any, _limit: number) {
        return this
      },
      in(this: any, field: string, values: any[]) {
        filters[`in:${field}`] = Array.isArray(values) ? values : []
        return this
      },
      then: (resolve: (value: any) => any, reject?: (reason: any) => any) => {
        const rows =
          Array.isArray(filters['in:id']) && filters['in:id'].length > 0
            ? caseLawRows.filter((row) => filters['in:id'].includes(row.id))
            : Array.isArray(filters['in:citation']) && filters['in:citation'].length > 0
              ? caseLawRows.filter((row) => filters['in:citation'].includes(row.citation))
              : caseLawRows

        return Promise.resolve({
          data: rows,
          error: null,
        }).then(resolve, reject)
      },
    }
  }

  const from = vi.fn((table: string) => {
    tables.push(table)
    if (table === 'cases') return buildCasesQuery()
    if (table === 'messages') return buildMessagesQuery()
    if (table === 'case_law') return buildCaseLawQuery()
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

vi.mock('@/lib/vector/milvus', () => ({
  searchByText: milvusMockState.searchByTextMock,
}))

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
    anthropicMockState.anthropicMessagesCreateMock.mockClear()
    anthropicMockState.anthropicMessagesStreamMock.mockClear()
    openAiMockState.openAiCreateMock.mockClear()
    milvusMockState.searchByTextMock.mockClear()
    milvusMockState.searchByTextMock.mockResolvedValue([])
    supabaseMockState.reset()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
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

  it('basic agent can decide to use web search when quota allows it', async () => {
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
    const consumeSearchQuota = vi.fn(async () => ({
      allowed: true,
      limit: 5,
      used: 1,
      remaining: 4,
    }))

    const result = await invokeBasicLegalAgent(
      'I am at the pre-claim stage. What claim form and procedural steps are usually involved?',
      'thread_smoke_basic_auto_search',
      'user_smoke_basic_auto_search',
      [],
      'small claims',
      {
        autoDecideSearch: true,
        searchEngineOverride: 'brave',
        consumeSearchQuota,
      }
    )

    expect(typeof result.response).toBe('string')
    expect(result.response.trim().length).toBeGreaterThan(0)
    expect(result.response).toMatch(/\[\d+\]/)
    expect(Array.isArray(result.sources)).toBe(true)
    expect((result.sources || []).length).toBeGreaterThan(0)
    expect(consumeSearchQuota).toHaveBeenCalledTimes(1)
    expect(searchSpy).toHaveBeenCalledTimes(1)
    const searchPayload = JSON.parse(String(searchSpy.mock.calls[0]?.[0] || '{}'))
    expect(searchPayload.engine).toBe('brave')
  })

  it('basic agent returns a one-shot daily limit notice on the final allowed web search', async () => {
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
    const consumeSearchQuota = vi.fn(async () => ({
      allowed: true,
      limit: 5,
      used: 5,
      remaining: 0,
      resetsAt: '2026-03-13T00:00:00.000Z',
    }))

    const result = await invokeBasicLegalAgent(
      'I am at the pre-claim stage. What claim form and procedural steps are usually involved?',
      'thread_smoke_basic_quota_boundary',
      'user_smoke_basic_quota_boundary',
      [],
      'small claims',
      {
        autoDecideSearch: true,
        searchEngineOverride: 'brave',
        consumeSearchQuota,
      }
    )

    expect(result.response).toMatch(/\[\d+\]/)
    expect((result.sources || []).length).toBeGreaterThan(0)
    expect((result as any).basicDailySearchNotice).toBe(
      'You have used your web search limit for today. You can continue without web search, or upgrade for more search access.'
    )
    expect(consumeSearchQuota).toHaveBeenCalledTimes(1)
    expect(searchSpy).toHaveBeenCalledTimes(1)
  })

  it('basic agent falls back to direct guidance with a cap notice when quota is exhausted', async () => {
    const searchSpy = vi.spyOn(SearchTool.prototype, '_call')
    const consumeSearchQuota = vi.fn(async () => ({
      allowed: false,
      limit: 5,
      used: 5,
      remaining: 0,
      resetsAt: '2026-03-13T00:00:00.000Z',
    }))

    const result = await invokeBasicLegalAgent(
      'I am at the pre-claim stage. What claim form and procedural steps are usually involved?',
      'thread_smoke_basic_quota_exhausted',
      'user_smoke_basic_quota_exhausted',
      [],
      'small claims',
      {
        autoDecideSearch: true,
        searchEngineOverride: 'brave',
        consumeSearchQuota,
      }
    )

    expect(result.response).not.toContain("You've used your 5 searches today. Upgrade for unlimited research.")
    expect(result.response).not.toContain('Daily web search limit reached. Back to standard answers')
    expect((result as any).basicDailySearchNotice).toBe(
      'You have used your web search limit for today. You can continue without web search, or upgrade for more search access.'
    )
    expect(consumeSearchQuota).toHaveBeenCalledTimes(1)
    expect(searchSpy).not.toHaveBeenCalled()
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

  it('premium OpenAI path uses gpt-5-mini completion token settings when configured', async () => {
    await invokePremiumLegalAgent(
      'What does claimant mean in a small claim?',
      'thread_smoke_premium_gpt5mini',
      'user_smoke_premium_gpt5mini',
      [],
      'small claims',
      {
        useSearch: false,
        openaiModel: 'gpt-5-mini',
        openaiFallbackModel: 'gpt-4.1',
      }
    )

    const [payload] = (openAiMockState.openAiCreateMock.mock.calls[0] || []) as any[]

    expect(payload?.model).toBe('gpt-5-mini')
    expect(payload?.max_completion_tokens).toBeTypeOf('number')
    expect(payload?.max_tokens).toBeUndefined()
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

    expect(systemPrompt).toContain('You are MyMcKenzie Assistant')
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
    expect(result.response).toMatch(/\[\d+\]/)
    expect(Array.isArray(result.sources)).toBe(true)
    expect((result.sources || []).length).toBeGreaterThan(0)
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
    expect(result.response).toMatch(/\[\d+\]/)
    expect(Array.isArray(result.sources)).toBe(true)
    expect((result.sources || []).length).toBeGreaterThan(0)
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

  it('premium plus OpenAI fallback can execute tool calls when forced', async () => {
    process.env.ANTHROPIC_API_KEY = ''
    const searchSpy = vi.spyOn(SearchTool.prototype, '_call').mockResolvedValue(
      JSON.stringify({
        packet: 'Consumer guidance summary',
        sources: ['https://example.com/consumer-rights'],
        sourceMode: 'engine',
      })
    )

    openAiMockState.openAiCreateMock
      .mockImplementationOnce(async (_payload: any) => ({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call_web_1',
                  type: 'function',
                  function: {
                    name: 'web_search',
                    arguments: JSON.stringify({
                      query: 'consumer rights act dealer faulty car',
                      mode: 'general',
                    }),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }))
      .mockImplementationOnce(async (_payload: any) => ({
        choices: [
          {
            message: {
              content: 'Overview\n1. General guidance point.\nIn short: This is general legal information support.',
            },
            finish_reason: 'stop',
          },
        ],
      }))

    const result = await invokePremiumPlusLegalAgent(
      'force-openai-tool-loop check',
      'thread_smoke_premium_plus_openai_fallback',
      'user_smoke_premium_plus_openai_fallback',
      [],
      undefined,
      {
        forceOpenAiFallback: true,
        openaiFallbackModel: 'gpt-4.1',
      }
    )

    expect(searchSpy).toHaveBeenCalledTimes(1)
    expect(Array.isArray(result.sources)).toBe(true)
    expect((result.sources || []).length).toBeGreaterThan(0)
    expect(result.response.trim().length).toBeGreaterThan(0)
    searchSpy.mockRestore()
  })

  it('premium plus OpenAI fallback replaces placeholder final text with tool-context summary', async () => {
    process.env.ANTHROPIC_API_KEY = ''
    const searchSpy = vi.spyOn(SearchTool.prototype, '_call').mockResolvedValue(
      JSON.stringify({
        packet: 'Consumer guidance summary from retrieved sources.',
        sources: ['https://example.com/consumer-rights'],
        sourceMode: 'engine',
      })
    )

    const toolCallResponse = async (_payload: any) => ({
      choices: [
        {
          message: {
            content: '',
            tool_calls: [
              {
                id: 'call_web_1',
                type: 'function',
                function: {
                  name: 'web_search',
                  arguments: JSON.stringify({
                    query: 'consumer rights act dealer faulty car',
                    mode: 'general',
                  }),
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    })

    openAiMockState.openAiCreateMock
      .mockImplementationOnce(toolCallResponse)
      .mockImplementationOnce(toolCallResponse)
      .mockImplementationOnce(toolCallResponse)
      .mockImplementationOnce(toolCallResponse)
      .mockImplementationOnce(async (_payload: any) => ({
        choices: [
          {
            message: {
              content: "I couldn't generate a response.",
            },
            finish_reason: 'stop',
          },
        ],
      }))
      .mockImplementationOnce(async (_payload: any) => ({
        choices: [
          {
            message: {
              content: "I couldn't generate a response.",
            },
            finish_reason: 'stop',
          },
        ],
      }))

    const result = await invokePremiumPlusLegalAgent(
      'force-openai-placeholder-final check',
      'thread_smoke_premium_plus_openai_placeholder',
      'user_smoke_premium_plus_openai_placeholder',
      [],
      undefined,
      {
        forceOpenAiFallback: true,
        openaiFallbackModel: 'gpt-4.1',
      }
    )

    expect(result.response).not.toContain("I couldn't generate a response.")
    expect(result.response).toContain('Consumer guidance summary from retrieved sources.')
    expect(Array.isArray(result.sources)).toBe(true)
    expect((result.sources || []).length).toBeGreaterThan(0)
    searchSpy.mockRestore()
  })

  it('premium plus OpenAI fallback forces one retrieval round when GPT returns a placeholder', async () => {
    process.env.ANTHROPIC_API_KEY = ''
    const searchSpy = vi.spyOn(SearchTool.prototype, '_call').mockResolvedValue(
      JSON.stringify({
        packet: 'Leasehold guidance summary from retrieved sources.',
        sources: ['https://example.com/leasehold-guidance'],
        sourceMode: 'engine',
      })
    )

    openAiMockState.openAiCreateMock
      .mockImplementationOnce(async (_payload: any) => ({
        choices: [
          {
            message: {
              content: "I couldn't generate a response.",
            },
            finish_reason: 'stop',
          },
        ],
      }))
      .mockImplementationOnce(async (_payload: any) => ({
        choices: [
          {
            message: {
              content: "I couldn't generate a response.",
            },
            finish_reason: 'stop',
          },
        ],
      }))
      .mockImplementationOnce(async (_payload: any) => ({
        choices: [
          {
            message: {
              content: "I couldn't generate a response.",
            },
            finish_reason: 'stop',
          },
        ],
      }))
      .mockImplementationOnce(async (_payload: any) => ({
        choices: [
          {
            message: {
              content: "I couldn't generate a response.",
            },
            finish_reason: 'stop',
          },
        ],
      }))

    const result = await invokePremiumPlusLegalAgent(
      'force-openai-single-forced-retrieval check',
      'thread_smoke_premium_plus_openai_single_forced_retrieval',
      'user_smoke_premium_plus_openai_single_forced_retrieval',
      [],
      undefined,
      {
        forceOpenAiFallback: true,
        openaiFallbackModel: 'gpt-4.1',
      }
    )

    expect(searchSpy).toHaveBeenCalledTimes(1)
    expect(result.response).toContain('Leasehold guidance summary from retrieved sources.')
    expect(result.response).not.toContain("I couldn't generate a response.")
    searchSpy.mockRestore()
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
    expect(systemPrompt).toContain('Treat Reddit, forums, social posts, and community discussions as anecdotal only')
  })

  it('premium plus U.S. tool path does not expose UK case-law retrieval', async () => {
    delete process.env.US_MILVUS_HOST
    delete process.env.MILVUS_US_HOST

    await invokePremiumPlusLegalAgent(
      'Can you give case law on this Nevada issue?',
      'thread_smoke_premium_plus_us_prompt_split',
      'user_smoke_premium_plus_us_prompt_split',
      [],
      'Nevada consumer dispute',
      {
        useSearch: true,
        anthropicModel: 'claude-sonnet-4-6',
        anthropicFallbackModel: 'claude-opus-4-6',
        legalContext: {
          countryCode: 'US',
          jurisdictionCode: 'US-NV',
          jurisdictionLabel: 'Nevada',
        },
      }
    )

    const [payload] = (anthropicMockState.anthropicMessagesCreateMock.mock.calls[0] || []) as any[]
    const systemPrompt = Array.isArray(payload?.system)
      ? String(payload.system[0]?.text || '')
      : String(payload?.system || '')
    const toolNames = Array.isArray(payload?.tools)
      ? payload.tools.map((tool: any) => String(tool?.name || ''))
      : []

    expect(systemPrompt).toContain('You have access to web_search for U.S. matters.')
    expect(systemPrompt).toContain('do not call case_law_search for U.S. matters')
    expect(systemPrompt).toContain('plain English for a non-lawyer')
    expect(toolNames).toEqual(['web_search'])
  })

  it('premium plus U.S. tool path exposes U.S. case-law retrieval when configured', async () => {
    process.env.US_MILVUS_HOST = 'us-milvus.test'

    await invokePremiumPlusLegalAgent(
      'Can you give case law on this Nevada issue?',
      'thread_smoke_premium_plus_us_prompt_with_db',
      'user_smoke_premium_plus_us_prompt_with_db',
      [],
      'Nevada consumer dispute',
      {
        useSearch: true,
        anthropicModel: 'claude-sonnet-4-6',
        anthropicFallbackModel: 'claude-opus-4-6',
        legalContext: {
          countryCode: 'US',
          jurisdictionCode: 'US-NV',
          jurisdictionLabel: 'Nevada',
        },
      }
    )

    const [payload] = (anthropicMockState.anthropicMessagesCreateMock.mock.calls[0] || []) as any[]
    const systemPrompt = Array.isArray(payload?.system)
      ? String(payload.system[0]?.text || '')
      : String(payload?.system || '')
    const toolNames = Array.isArray(payload?.tools)
      ? payload.tools.map((tool: any) => String(tool?.name || ''))
      : []

    expect(systemPrompt).toContain('case_law_search retrieves from the U.S. case-law vector collection')
    expect(toolNames).toContain('web_search')
    expect(toolNames).toContain('case_law_search')
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

  it('premium plus case-law tool degrades cleanly when Milvus runtime dependencies are missing', async () => {
    process.env.MILVUS_HOST = 'localhost'
    milvusMockState.searchByTextMock.mockRejectedValueOnce(
      new Error('MILVUS_DEPENDENCY_MISSING: pymilvus is not installed on this runtime')
    )

    await invokePremiumPlusLegalAgent(
      'Can you give case law on this?',
      'thread_smoke_premium_plus_milvus_missing',
      'user_smoke_premium_plus_milvus_missing',
      [],
      'road traffic incident',
      {
        useSearch: true,
        anthropicModel: 'claude-sonnet-4-6',
        anthropicFallbackModel: 'claude-opus-4-6',
        legalContext: {
          countryCode: 'GB',
          jurisdictionCode: 'GB-ENG-WLS',
          jurisdictionLabel: 'England and Wales',
        },
      }
    )

    const secondCallPayload = (anthropicMockState.anthropicMessagesCreateMock.mock.calls[1] || [])[0] as any
    const toolResultMessage = Array.isArray(secondCallPayload?.messages)
      ? secondCallPayload.messages.find(
          (message: any) =>
            Array.isArray(message?.content) &&
            message.content.some((block: any) => block?.type === 'tool_result')
        )
      : null
    const toolResultContent = Array.isArray(toolResultMessage?.content)
      ? String(toolResultMessage.content[0]?.content || '')
      : ''

    expect(toolResultContent).toContain('Case-law fallback results:')
    expect(toolResultContent).toContain('[2024] EWHC 123')
    expect(toolResultContent).toContain('Driver Hit My Car and Ran Away v Example')
    expect(toolResultContent).not.toContain('MILVUS_DEPENDENCY_MISSING')
    expect(toolResultContent).not.toContain('pymilvus')
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

  it('premium plus agent does not carry earlier drafting turns into a fresh procedural question', async () => {
    await invokePremiumPlusLegalAgent(
      'What do I do if I want to sue a person?',
      'thread_smoke_premium_plus_ignore_draft_history',
      'user_smoke_premium_plus_ignore_draft_history',
      [
        {
          role: 'user',
          content: 'Please draft a witness statement for me.',
        },
        {
          role: 'assistant',
          content: 'Witness statement\n[CLAIMANT NAME]\n[DATE]\nStatement of Truth',
        },
        {
          role: 'user',
          content: 'I want to recover money from someone who owes me.',
        },
      ],
      'money claim',
      {
        useSearch: true,
        anthropicModel: 'claude-opus-4-6',
        anthropicFallbackModel: 'claude-sonnet-4-6',
      }
    )

    const [payload] = (anthropicMockState.anthropicMessagesCreateMock.mock.calls[0] || []) as any[]
    const systemText = Array.isArray(payload?.system)
      ? payload.system.map((block: any) => String(block?.text || '')).join('\n')
      : String(payload?.system || '')

    expect(systemText).not.toContain('Please draft a witness statement for me.')
    expect(systemText).not.toContain('Statement of Truth')
    expect(systemText).toContain('I want to recover money from someone who owes me.')
  })

  it('premium plus tool path returns verified authorities extracted from tool results', async () => {
    milvusMockState.searchByTextMock.mockResolvedValueOnce([
      {
        id: 'case-law-1',
        citation: '[2024] EWHC 123',
        title: 'Driver Hit My Car and Ran Away v Example',
        url: 'https://example.com/authority',
        summary: 'Authority about a driver hitting a car and leaving the scene.',
        extracts: 'Driver hit my car and ran away after a confrontation.',
      },
    ])

    const result = await invokePremiumPlusLegalAgent(
      'Can you give case law on this?',
      'thread_smoke_premium_plus_verified_authorities',
      'user_smoke_premium_plus_verified_authorities',
      [],
      'road traffic incident',
      {
        useSearch: true,
        anthropicModel: 'claude-opus-4-6',
        anthropicFallbackModel: 'claude-sonnet-4-6',
        legalContext: {
          countryCode: 'GB',
          jurisdictionCode: 'GB-ENG-WLS',
          jurisdictionLabel: 'England and Wales',
        },
      }
    )

    expect(result.verifiedAuthorities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          citation: '[2024] EWHC 123',
          title: 'Driver Hit My Car and Ran Away v Example',
        }),
      ])
    )
  })

  it('premium plus case-law tool avoids UK authority retrieval for U.S. users', async () => {
    delete process.env.US_MILVUS_HOST
    delete process.env.MILVUS_US_HOST

    await invokePremiumPlusLegalAgent(
      'Can you give case law on this?',
      'thread_smoke_premium_plus_us_case_law_block',
      'user_smoke_premium_plus_us_case_law_block',
      [],
      'consumer dispute',
      {
        useSearch: true,
        anthropicModel: 'claude-opus-4-6',
        anthropicFallbackModel: 'claude-sonnet-4-6',
        legalContext: {
          countryCode: 'US',
          jurisdictionCode: 'US-NV',
          jurisdictionLabel: 'Nevada',
        },
      }
    )

    const firstCallPayload = (anthropicMockState.anthropicMessagesCreateMock.mock.calls[0] || [])[0] as any
    const systemPrompt = Array.isArray(firstCallPayload?.system)
      ? String(firstCallPayload.system[0]?.text || '')
      : String(firstCallPayload?.system || '')
    const toolNames = Array.isArray(firstCallPayload?.tools)
      ? firstCallPayload.tools.map((tool: any) => String(tool?.name || ''))
      : []

    expect(systemPrompt).toContain('Internal case-law retrieval is currently configured for UK authorities only')
    expect(systemPrompt).toContain('do not call case_law_search for U.S. matters')
    expect(toolNames).not.toContain('case_law_search')
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

  it('premium plus agent allows bespoke drafting requests', async () => {
    const result = await invokePremiumPlusLegalAgent(
      'Please draft a witness statement for my unpaid invoice claim.',
      'thread_smoke_premium_plus_bespoke_draft',
      'user_smoke_premium_plus_bespoke_draft',
      [
        {
          role: 'user',
          content: 'The defendant has not paid my invoice dated 1 February 2026.',
        },
      ],
      'money claim',
      {
        useSearch: true,
        anthropicModel: 'claude-opus-4-6',
        anthropicFallbackModel: 'claude-sonnet-4-6',
      }
    )

    expect(result.document_generated).toBe(true)
    expect(result.response).not.toContain('I cannot create bespoke or personalised letters/drafts')

    const [payload] = (openAiMockState.openAiCreateMock.mock.calls[0] || []) as any[]
    const prompt = String(payload?.messages?.[0]?.content || '')
    expect(prompt).toContain('Draft the specific document the user has asked for.')
    expect(prompt).not.toContain('You may ONLY output template-fill content.')
    expect(prompt).not.toContain('You must NEVER produce bespoke/personalised letters')
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
