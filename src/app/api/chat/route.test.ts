import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult<T> = { data: T; error: any }

const createQuery = <T,>(result: QueryResult<T>) => {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    upsert: vi.fn(() => Promise.resolve(result)),
    insert: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled: (value: QueryResult<T>) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }

  return builder
}

const buildChatRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any

const buildStreamingChatRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mymckenzie-stream': '1',
    },
    body: JSON.stringify(body),
  }) as any

describe('/api/chat route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  const loadRoute = async ({
    authUser = { id: 'user-1', email: 'user@example.com' },
    planData = { plan: 'basic', paidAccess: true, planStatus: 'active' },
    incrementedTurnCount = 1,
    searchByTextImpl,
    processMessageResult = {
      task: 'legal_procedure',
      contextType: 'general',
      urgency: 'normal',
      caseId: null,
    },
  }: {
    authUser?: { id: string; email?: string | null } | null
    planData?: { plan?: string | null; paidAccess?: boolean; planStatus?: string | null }
    incrementedTurnCount?: number
    searchByTextImpl?: (...args: any[]) => Promise<any[]>
    processMessageResult?: { task: string; contextType: string; urgency: string; caseId: string | null }
  } = {}) => {
    const chatMemoryQuery = createQuery({
      data: { memory_summary: null, key_facts: [], open_questions: [], user_turn_count: incrementedTurnCount },
      error: null,
    })

    const supabaseAdmin = {
      rpc: vi.fn(async () => ({ data: incrementedTurnCount, error: null })),
      from: vi.fn((table: string) => {
        switch (table) {
          case 'chat_memory':
            return chatMemoryQuery
          case 'chat_action_items':
            return createQuery({ data: null, error: null })
          default:
            throw new Error(`Unexpected table: ${table}`)
        }
      }),
    }

    const chatManagerInstance = {
      seedUserPlan: vi.fn(),
      initializeSession: vi.fn(async () => ({
        requiresCaseSelection: false,
        conversationId: 'conv-1',
        activeCaseId: null,
      })),
      processMessage: vi.fn(async () => processMessageResult),
      getCaseData: vi.fn(async () => null),
      shouldPersistMessages: vi.fn(() => false),
      storeRawMessage: vi.fn(async () => null),
    }

    const legalAgentMocks = {
      invokeBasicLegalAgent: vi.fn(async () => ({
        response: 'Basic answer',
        guidance_provided: [],
        next_steps: [],
      })) as any,
      invokePremiumLegalAgent: vi.fn(async () => ({
        response: 'Premium answer',
        guidance_provided: [],
        next_steps: [],
      })) as any,
      invokePremiumLegalAgentStream: vi.fn(async (_message: string, _threadId: string, _userId: string, _history: any[], _caseKeywords: string, options?: any) => {
        options?.onToken?.('Premium ')
        options?.onToken?.('answer')
        return {
          response: 'Premium answer',
          guidance_provided: [],
          next_steps: [],
        }
      }) as any,
      invokePremiumPlusLegalAgent: vi.fn(async () => ({
        response: 'Premium answer',
        guidance_provided: [],
        next_steps: [],
      })) as any,
      invokePremiumPlusLegalAgentStream: vi.fn(async (_message: string, _threadId: string, _userId: string, _history: any[], _caseKeywords: string, options?: any) => {
        options?.onToken?.('Premium+ ')
        options?.onToken?.('answer')
        return {
          response: 'Premium answer',
          guidance_provided: [],
          next_steps: [],
        }
      }) as any,
    }
    const searchByTextMock = vi.fn(searchByTextImpl || (async () => []))

    vi.doMock('@/lib/database/supabase-route', () => ({
      createSupabaseRouteClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: authUser },
            error: null,
          })),
        },
      })),
    }))
    vi.doMock('@/lib/database/supabase-server', () => ({ supabaseAdmin }))
    vi.doMock('@/lib/ai/chat-manager', () => ({
      ChatManager: class MockChatManager {
        constructor() {}
        seedUserPlan(...args: any[]) {
          return (chatManagerInstance.seedUserPlan as any)(...args)
        }
        initializeSession(...args: any[]) {
          return (chatManagerInstance.initializeSession as any)(...args)
        }
        processMessage(...args: any[]) {
          return (chatManagerInstance.processMessage as any)(...args)
        }
        getCaseData(...args: any[]) {
          return (chatManagerInstance.getCaseData as any)(...args)
        }
        shouldPersistMessages(...args: any[]) {
          return (chatManagerInstance.shouldPersistMessages as any)(...args)
        }
        storeRawMessage(...args: any[]) {
          return (chatManagerInstance.storeRawMessage as any)(...args)
        }
      },
    }))
    vi.doMock('@/lib/utils/rate-limit', () => ({
      aiRateLimiter: {},
      rateLimit: vi.fn(async () => ({
        success: true,
        limit: 10,
        remaining: 9,
        reset: Date.now() + 60_000,
      })),
      getIdentifier: vi.fn((value: string) => value),
      acquirePremiumProviderCapacity: vi.fn(async () => ({
        success: true,
        limit: 5,
        remaining: 4,
        reset: Date.now() + 10_000,
        retryAfterMs: 0,
      })),
    }))
    vi.doMock('@/lib/payments/user-plan', () => ({
      getUserPlanData: vi.fn(async () => planData),
    }))
    vi.doMock('@/lib/ai/agents/legal-agent', () => legalAgentMocks)
    vi.doMock('@/lib/vector/milvus', () => ({
      searchByText: searchByTextMock,
    }))
    vi.doMock('@/lib/chat/text-extraction', () => ({
      extractTextFromBuffer: vi.fn(async () => ''),
    }))
    vi.doMock('@/lib/monitoring/error-logger', () => ({
      captureServerException: vi.fn(async () => {}),
    }))

    const routeModule = await import('./route')
    return {
      POST: routeModule.POST,
      supabaseAdmin,
      chatManagerInstance,
      legalAgentMocks,
      searchByTextMock,
    }
  }

  it('returns a structured assistant payload when auth is missing', { timeout: 15000 }, async () => {
    const { POST } = await loadRoute({ authUser: null })

    const response = await POST(buildChatRequest({ message: 'What does CPR Part 7 mean?', history: [] }))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.response).toBe('Please sign in and choose a paid plan to use chat.')
    expect(payload.metadata.signInRequired).toBe(true)
    expect(payload.metadata.presentation.version).toBe(1)
  })

  it('returns a structured upgrade response when the signed-in user has no paid plan', { timeout: 15000 }, async () => {
    const { POST, chatManagerInstance } = await loadRoute({
      planData: { plan: 'none', paidAccess: false, planStatus: 'inactive' },
    })

    const response = await POST(buildChatRequest({ message: 'Help me with my claim', history: [] }))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.response).toBe('A paid plan is required to use chat. Please choose a plan to continue.')
    expect(payload.metadata.upgradeRequired).toBe(true)
    expect(payload.metadata.presentation.version).toBe(1)
    expect(chatManagerInstance.seedUserPlan).toHaveBeenCalledWith('none')
  })

  it('returns the thread-limit assistant response before invoking the legal agent', { timeout: 15000 }, async () => {
    process.env.BASIC_THREAD_MAX_USER_TURNS = '10'

    const { POST, supabaseAdmin, chatManagerInstance } = await loadRoute({
      planData: { plan: 'basic', paidAccess: true, planStatus: 'active' },
      incrementedTurnCount: 10,
    })

    const response = await POST(
      buildChatRequest({
        message: 'What should I do next?',
        history: [{ role: 'user', content: 'I need help with a hearing.' }],
        conversationId: 'conv-1',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.response).toContain('This chat has reached the thread limit (10 user turns).')
    expect(payload.metadata.threadLimitReached).toBe(true)
    expect(payload.metadata.suggestNewChat).toBe(true)
    expect(payload.metadata.presentation.version).toBe(1)
    expect(chatManagerInstance.processMessage).toHaveBeenCalledTimes(1)
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      'increment_chat_memory_turn_count',
      expect.objectContaining({
        p_conversation_id: 'conv-1',
      })
    )
  })

  it('uses Brave-only web search for premium plan requests', { timeout: 15000 }, async () => {
    const { POST, legalAgentMocks } = await loadRoute({
      planData: { plan: 'premium', paidAccess: true, planStatus: 'active' },
      processMessageResult: { task: 'legal_procedure', contextType: 'general', urgency: 'normal', caseId: null },
    })

    const response = await POST(
      buildChatRequest({
        message: 'I am at the pre-claim stage. What claim form and procedural steps are usually involved?',
        history: [],
      })
    )

    expect(response.status).toBe(200)
    expect(legalAgentMocks.invokePremiumLegalAgent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'user-1',
      [],
      '',
      expect.objectContaining({
        useSearch: true,
        searchQueryOverride: undefined,
        searchEngineOverride: 'brave',
      })
    )
  })

  it('streams premium answers over NDJSON when requested', { timeout: 15000 }, async () => {
    const { POST, legalAgentMocks } = await loadRoute({
      planData: { plan: 'premium', paidAccess: true, planStatus: 'active' },
      processMessageResult: { task: 'legal_procedure', contextType: 'general', urgency: 'normal', caseId: null },
    })

    const response = await POST(
      buildStreamingChatRequest({
        message: 'I am at the pre-claim stage. What claim form and procedural steps are usually involved?',
        history: [],
      })
    )

    expect(response.status).toBe(200)
    expect(legalAgentMocks.invokePremiumLegalAgentStream).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'user-1',
      [],
      '',
      expect.objectContaining({
        useSearch: true,
        searchEngineOverride: 'brave',
      })
    )
    expect(legalAgentMocks.invokePremiumLegalAgent).not.toHaveBeenCalled()
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')

    const body = await response.text()
    expect(body).toContain('"type":"start"')
    expect(body).toContain('"type":"delta"')
    expect(body).toContain('"type":"done"')
  })

  it('keeps premium plus definition questions on the direct fast path', { timeout: 15000 }, async () => {
    process.env.PREMIUM_PLUS_OPENAI_MODEL = 'gpt-5.2'

    const { POST, legalAgentMocks, searchByTextMock } = await loadRoute({
      planData: { plan: 'premium +', paidAccess: true, planStatus: 'active' },
      processMessageResult: { task: 'case_lookup', contextType: 'general', urgency: 'normal', caseId: null },
    })

    const response = await POST(buildChatRequest({ message: 'Explain promissory estoppel in plain English', history: [] }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.response).toContain('Premium answer')
    expect(searchByTextMock).not.toHaveBeenCalled()
    expect(legalAgentMocks.invokePremiumPlusLegalAgent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'user-1',
      [],
      '',
      expect.objectContaining({
        useSearch: true,
        openaiModel: 'gpt-5.2',
      })
    )
  })

  it('keeps premium plus procedural questions on the web-only path without case-law lookup', { timeout: 15000 }, async () => {
    process.env.PREMIUM_PLUS_OPENAI_MODEL = 'gpt-5.2'

    const { POST, legalAgentMocks, searchByTextMock } = await loadRoute({
      planData: { plan: 'premium +', paidAccess: true, planStatus: 'active' },
      processMessageResult: { task: 'legal_procedure', contextType: 'general', urgency: 'normal', caseId: null },
    })

    const response = await POST(
      buildChatRequest({
        message: 'I am at the pre-claim stage of an employment tribunal claim. What claim form and procedural steps are usually involved?',
        history: [],
      })
    )

    expect(response.status).toBe(200)
    expect(searchByTextMock).not.toHaveBeenCalled()
    expect(legalAgentMocks.invokePremiumPlusLegalAgent).toHaveBeenCalledWith(
      expect.not.stringContaining('Issue breakdown'),
      expect.any(String),
      'user-1',
      [],
      '',
      expect.objectContaining({
        useSearch: true,
        openaiModel: 'gpt-5.2',
      })
    )
  })

  it('falls back when premium plus case-law retrieval exceeds the timeout budget', { timeout: 15000 }, async () => {
    process.env.PREMIUM_PLUS_OPENAI_MODEL = 'gpt-5.2'
    process.env.PREMIUM_PLUS_CASELAW_TIMEOUT_MS = '1'
    process.env.MILVUS_HOST = 'localhost'

    const neverResolvingSearch = () => new Promise<any[]>(() => {})
    const { POST, legalAgentMocks, searchByTextMock } = await loadRoute({
      planData: { plan: 'premium +', paidAccess: true, planStatus: 'active' },
      searchByTextImpl: neverResolvingSearch,
      processMessageResult: { task: 'case_lookup', contextType: 'general', urgency: 'normal', caseId: null },
    })

    const response = await POST(buildChatRequest({ message: 'What does case law say about unfair dismissal?', history: [] }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.response).toContain('Premium answer')
    expect(searchByTextMock).not.toHaveBeenCalled()
    expect(legalAgentMocks.invokePremiumPlusLegalAgent).toHaveBeenCalledWith(
      expect.not.stringContaining('Issue breakdown'),
      expect.any(String),
      'user-1',
      [],
      '',
      expect.objectContaining({
        useSearch: true,
        openaiModel: 'gpt-5.2',
      })
    )
  })
})
