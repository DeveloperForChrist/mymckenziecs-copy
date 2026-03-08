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
  }: {
    authUser?: { id: string; email?: string | null } | null
    planData?: { plan?: string | null; paidAccess?: boolean; planStatus?: string | null }
    incrementedTurnCount?: number
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
      processMessage: vi.fn(async () => ({
        task: 'legal_procedure',
        contextType: 'general',
        urgency: 'normal',
        caseId: null,
      })),
      getCaseData: vi.fn(async () => null),
      shouldPersistMessages: vi.fn(() => false),
      storeRawMessage: vi.fn(async () => null),
    }

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
    vi.doMock('@/lib/ai/agents/legal-agent', () => ({
      decidePremiumSearchNeedWithGenerator: vi.fn(async () => null),
      decideRetrievalWithGenerator: vi.fn(async () => null),
      invokeBasicLegalAgent: vi.fn(async () => ({
        response: 'Basic answer',
        guidance_provided: [],
        next_steps: [],
      })),
      invokeLegalAgent: vi.fn(async () => ({
        response: 'Premium answer',
        guidance_provided: [],
        next_steps: [],
      })),
    }))
    vi.doMock('@/lib/vector/milvus', () => ({
      searchByText: vi.fn(async () => []),
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
})
