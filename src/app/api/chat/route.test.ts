import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult<T> = { data: T; error: any }

type MockRow = Record<string, any>

const applyFilters = (rows: MockRow[], filters: Array<{ type: string; column: string; value: any }>) =>
  rows.filter((row) =>
    filters.every((filter) => {
      const value = row[filter.column]
      if (filter.type === 'eq') return value === filter.value
      if (filter.type === 'in') return Array.isArray(filter.value) && filter.value.includes(value)
      if (filter.type === 'ilike') return String(value || '').toLowerCase() === String(filter.value || '').toLowerCase()
      if (filter.type === 'is') return filter.value === null ? value == null : value === filter.value
      return true
    })
  )

const createTableQuery = (rows: MockRow[] = [], options?: { mutateResult?: QueryResult<any> }) => {
  const state = {
    filters: [] as Array<{ type: string; column: string; value: any }>,
    orderBy: [] as Array<{ column: string; ascending: boolean }>,
    limitValue: undefined as number | undefined,
  }

  const getRows = () => {
    let result = applyFilters(rows, state.filters)
    for (const { column, ascending } of [...state.orderBy].reverse()) {
      result = result.slice().sort((a, b) => {
        const left = a?.[column]
        const right = b?.[column]
        if (left == null && right == null) return 0
        if (left == null) return 1
        if (right == null) return -1
        if (left === right) return 0
        return ascending ? (left < right ? -1 : 1) : (left < right ? 1 : -1)
      })
    }
    if (typeof state.limitValue === 'number') {
      result = result.slice(0, state.limitValue)
    }
    return result
  }

  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: any) => {
      state.filters.push({ type: 'eq', column, value })
      return builder
    }),
    in: vi.fn((column: string, value: any[]) => {
      state.filters.push({ type: 'in', column, value })
      return builder
    }),
    ilike: vi.fn((column: string, value: any) => {
      state.filters.push({ type: 'ilike', column, value })
      return builder
    }),
    is: vi.fn((column: string, value: any) => {
      state.filters.push({ type: 'is', column, value })
      return builder
    }),
    order: vi.fn((column: string, orderOptions?: { ascending?: boolean }) => {
      state.orderBy.push({ column, ascending: orderOptions?.ascending !== false })
      return builder
    }),
    limit: vi.fn((value: number) => {
      state.limitValue = value
      return builder
    }),
    maybeSingle: vi.fn(async () => {
      const matched = getRows()
      return { data: matched[0] ?? null, error: null }
    }),
    single: vi.fn(async () => {
      const matched = getRows()
      return { data: matched[0] ?? null, error: null }
    }),
    upsert: vi.fn(async () => options?.mutateResult || { data: null, error: null }),
    insert: vi.fn(async () => options?.mutateResult || { data: null, error: null }),
    then: (onFulfilled: (value: QueryResult<any>) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: getRows(), error: null }).then(onFulfilled, onRejected),
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
    usersRows,
    casesRows,
    messagesRows,
    chatMemoryRows,
    chatActionItemsRows,
    }: {
    authUser?: { id: string; email?: string | null } | null
    planData?: { plan?: string | null; paidAccess?: boolean; planStatus?: string | null }
    incrementedTurnCount?: number
    searchByTextImpl?: (...args: any[]) => Promise<any[]>
    processMessageResult?: { task: string; contextType: string; urgency: string; caseId: string | null }
    usersRows?: MockRow[]
    casesRows?: MockRow[]
    messagesRows?: MockRow[]
    chatMemoryRows?: MockRow[]
    chatActionItemsRows?: MockRow[]
  } = {}) => {
    const defaultChatMemoryRow = {
      memory_key: 'thread-memory',
      memory_summary: null,
      key_facts: [],
      open_questions: [],
      user_turn_count: incrementedTurnCount,
      conversation_id: 'conv-1',
      user_id: authUser?.id || 'user-1',
    }
    const resolvedUsersRows = usersRows || []
    const resolvedCasesRows = casesRows || []
    const resolvedMessagesRows = messagesRows || []
    const resolvedChatMemoryRows = chatMemoryRows || [defaultChatMemoryRow]
    const resolvedChatActionItemsRows = chatActionItemsRows || []

    const supabaseAdmin = {
      rpc: vi.fn(async () => ({ data: incrementedTurnCount, error: null })),
      from: vi.fn((table: string) => {
        switch (table) {
          case 'chat_memory':
            return createTableQuery(resolvedChatMemoryRows)
          case 'chat_action_items':
            return createTableQuery(resolvedChatActionItemsRows)
          case 'users':
            return createTableQuery(resolvedUsersRows)
          case 'cases':
            return createTableQuery(resolvedCasesRows)
          case 'messages':
            return createTableQuery(resolvedMessagesRows)
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
        options?.onStatus?.('Checking web sources...')
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
        options?.onStatus?.('Checking web sources...')
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

  it('returns a structured assistant payload when auth is missing', { timeout: 30000 }, async () => {
    const { POST } = await loadRoute({ authUser: null })

    const response = await POST(buildChatRequest({ message: 'What does CPR Part 7 mean?', history: [] }))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.response).toBe('Please sign in and choose a paid plan to use chat.')
    expect(payload.metadata.signInRequired).toBe(true)
    expect(payload.metadata.presentation.version).toBe(1)
  })

  it('rejects an existing conversation that belongs to another user', { timeout: 15000 }, async () => {
    const { POST, chatManagerInstance } = await loadRoute({
      messagesRows: [
        {
          id: 'msg-foreign-1',
          conversation_id: 'foreign-conv',
          case_id: null,
          role: 'user',
          content: 'Foreign conversation',
          timestamp: '2026-03-09T09:00:00.000Z',
          metadata: { owner_user_id: 'user-2' },
        },
      ],
    })

    const response = await POST(
      buildChatRequest({
        message: 'Continue this conversation',
        history: [],
        conversationId: 'foreign-conv',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.response).toBe('That conversation is unavailable.')
    expect(payload.metadata.conversationUnavailable).toBe(true)
    expect(chatManagerInstance.initializeSession).not.toHaveBeenCalled()
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

  it('lets the premium agent decide search while constraining web search to Brave', { timeout: 15000 }, async () => {
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
        autoDecideSearch: true,
        searchEngineOverride: 'brave',
      })
    )
  })

  it('passes earlier thread memory into the agent context for new threads', { timeout: 15000 }, async () => {
    const { POST, legalAgentMocks } = await loadRoute({
      chatMemoryRows: [
        {
          memory_key: 'other-thread-memory',
          memory_summary: 'Driver hit my car and left the scene.',
          key_facts: ['Earlier conversation marker: driver hit my car and ran away'],
          open_questions: ['Did you get the registration number?'],
          user_turn_count: 4,
          conversation_id: 'older-conv',
          user_id: 'user-1',
          updated_at: '2026-03-09T10:00:00.000Z',
          case_id: null,
        },
        {
          memory_key: 'thread-memory',
          memory_summary: null,
          key_facts: [],
          open_questions: [],
          user_turn_count: 1,
          conversation_id: 'conv-1',
          user_id: 'user-1',
          updated_at: '2026-03-09T11:00:00.000Z',
          case_id: null,
        },
      ],
    })

    const response = await POST(
      buildChatRequest({
        message: 'Can you remind me what case law may matter here?',
        history: [],
        conversationId: 'conv-1',
      })
    )

    expect(response.status).toBe(200)
    expect(legalAgentMocks.invokeBasicLegalAgent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'user-1',
      [],
      '',
      expect.objectContaining({
        memoryContext: expect.stringContaining('Earlier conversation marker: driver hit my car and ran away'),
      })
    )
  })

  it('passes the full current thread history into the premium plus agent', { timeout: 15000 }, async () => {
    process.env.PREMIUM_PLUS_ANTHROPIC_MODEL = 'claude-opus-4-6'

    const { POST, legalAgentMocks } = await loadRoute({
      planData: { plan: 'premium +', paidAccess: true, planStatus: 'active' },
      processMessageResult: { task: 'case_lookup', contextType: 'general', urgency: 'normal', caseId: null },
    })

    const history = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `Turn ${index + 1}`,
    }))

    const response = await POST(
      buildChatRequest({
        message: 'Can I have case law on this?',
        history,
        conversationId: 'conv-1',
      })
    )

    expect(response.status).toBe(200)
    const call = (legalAgentMocks.invokePremiumPlusLegalAgent as any).mock.calls[0]
    expect(call).toBeTruthy()
    expect(call[3]).toHaveLength(12)
    expect(call[3][0]).toEqual({ role: 'user', content: 'Turn 1' })
    expect(call[3][11]).toEqual({ role: 'assistant', content: 'Turn 12' })
    expect(call[5]).toEqual(expect.objectContaining({
      historyLimit: expect.any(Number),
    }))
  })

  it('preserves visible case headings in premium plus responses when authority tokens are unavailable', { timeout: 15000 }, async () => {
    process.env.PREMIUM_PLUS_ANTHROPIC_MODEL = 'claude-opus-4-6'

    const { POST, legalAgentMocks } = await loadRoute({
      planData: { plan: 'premium +', paidAccess: true, planStatus: 'active' },
      processMessageResult: { task: 'case_lookup', contextType: 'general', urgency: 'normal', caseId: null },
    })

    ;(legalAgentMocks.invokePremiumPlusLegalAgent as any).mockResolvedValueOnce({
      response:
        "Lagden v O'Connor [2003] UKHL 64\nThis case dealt with a hire car that was damaged by a negligent third-party driver.\n\nHassam v Rabot [2023] UKSC 19\nThis is an important case on whiplash injuries from road accidents.",
      guidance_provided: [],
      next_steps: [],
    })

    const response = await POST(
      buildChatRequest({
        message: 'Can I get a case law on car accident',
        history: [],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.response).toContain("Lagden v O'Connor [2003] UKHL 64")
    expect(payload.response).toContain('Hassam v Rabot [2023] UKSC 19')
  })

  it('does not replace a procedural follow-up with the template-only refusal when the agent drifts into draft-style output', { timeout: 15000 }, async () => {
    process.env.PREMIUM_PLUS_ANTHROPIC_MODEL = 'claude-opus-4-6'

    const { POST, legalAgentMocks } = await loadRoute({
      planData: { plan: 'premium +', paidAccess: true, planStatus: 'active' },
      processMessageResult: { task: 'legal_procedure', contextType: 'general', urgency: 'normal', caseId: null },
    })

    ;(legalAgentMocks.invokePremiumPlusLegalAgent as any).mockResolvedValueOnce({
      response: 'Dear Sir or Madam,\n\nI want to sue the defendant for the money owed.\n\nYours faithfully,',
      guidance_provided: [],
      next_steps: [],
    })

    const response = await POST(
      buildChatRequest({
        message: 'What do I do if I want to sue a person?',
        history: [
          { role: 'user', content: 'Can you draft a statement for me?' },
          { role: 'assistant', content: 'Witness statement\n[CLAIMANT NAME]\n[DATE]' },
        ],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.response).not.toBe(
      'I cannot create bespoke or personalised letters/drafts. I can help fill template documents only. Please tell me the template/form and the fields to populate.'
    )
    expect(payload.response).toContain('Dear Sir or Madam')
  })

  it('falls back to GPT for premium plus standard responses when Anthropic credit errors occur', { timeout: 15000 }, async () => {
    process.env.PREMIUM_PLUS_ANTHROPIC_MODEL = 'claude-opus-4-6'

    const { POST, legalAgentMocks } = await loadRoute({
      planData: { plan: 'premium +', paidAccess: true, planStatus: 'active' },
      processMessageResult: { task: 'legal_procedure', contextType: 'general', urgency: 'normal', caseId: null },
    })

    ;(legalAgentMocks.invokePremiumPlusLegalAgent as any).mockRejectedValueOnce(
      new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_test"}')
    )

    const response = await POST(
      buildChatRequest({
        message: 'I am at the pre-claim stage of an employment tribunal claim. What claim form and procedural steps are usually involved?',
        history: [],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.response).toContain('Premium answer')
    expect(payload.response).not.toContain('credit balance')
    expect(payload.response).not.toContain('Anthropic')
    expect(legalAgentMocks.invokePremiumPlusLegalAgent).toHaveBeenCalledTimes(2)
    expect((legalAgentMocks.invokePremiumPlusLegalAgent as any).mock.calls[1][5]).toEqual(
      expect.objectContaining({
        forceOpenAiFallback: true,
        openaiFallbackModel: 'gpt-4.1',
      })
    )
  })

  it('keeps verified authority headings and strips unmatched ones in premium plus responses', { timeout: 15000 }, async () => {
    process.env.PREMIUM_PLUS_ANTHROPIC_MODEL = 'claude-opus-4-6'

    const { POST, legalAgentMocks } = await loadRoute({
      planData: { plan: 'premium +', paidAccess: true, planStatus: 'active' },
      processMessageResult: { task: 'case_lookup', contextType: 'general', urgency: 'normal', caseId: null },
    })

    ;(legalAgentMocks.invokePremiumPlusLegalAgent as any).mockResolvedValueOnce({
      response:
        "Hassam v Rabot [2023] UKSC 19\nThis is an important whiplash authority.\n\nInvented v Fiction [2025] EWHC 999\nThis is not a real retrieved authority.",
      guidance_provided: [],
      next_steps: [],
      verifiedAuthorities: [
        {
          title: 'Hassam v Rabot',
          citation: '[2023] UKSC 19',
        },
      ],
    })

    const response = await POST(
      buildChatRequest({
        message: 'Can I get a case law on car accident',
        history: [],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.response).toContain('Hassam v Rabot [2023] UKSC 19')
    expect(payload.response).not.toContain('Invented v Fiction [2025] EWHC 999')
    expect(payload.response).toContain('Note: I removed unverified case-law references.')
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
        autoDecideSearch: true,
        searchEngineOverride: 'brave',
      })
    )
    expect(legalAgentMocks.invokePremiumLegalAgent).not.toHaveBeenCalled()
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')

    const body = await response.text()
    expect(body).toContain('"type":"start"')
    expect(body).toContain('"type":"status"')
    expect(body).toContain('Checking web sources...')
    expect(body).toContain('"type":"delta"')
    expect(body).toContain('"type":"done"')
  })

  it('streams premium plus status events over NDJSON when requested', { timeout: 15000 }, async () => {
    const { POST, legalAgentMocks } = await loadRoute({
      planData: { plan: 'premium +', paidAccess: true, planStatus: 'active' },
      processMessageResult: { task: 'legal_procedure', contextType: 'general', urgency: 'normal', caseId: null },
    })

    const response = await POST(
      buildStreamingChatRequest({
        message: 'I am at the pre-claim stage of an employment tribunal claim. What claim form and procedural steps are usually involved?',
        history: [],
      })
    )

    expect(response.status).toBe(200)
    expect(legalAgentMocks.invokePremiumPlusLegalAgentStream).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'user-1',
      [],
      '',
      expect.objectContaining({
        autoDecideSearch: true,
        searchEngineOverride: 'perplexity',
      })
    )

    const body = await response.text()
    expect(body).toContain('"type":"status"')
    expect(body).toContain('Checking web sources...')
    expect(body).toContain('"type":"delta"')
    expect(body).toContain('"type":"done"')
  })

  it('falls back to GPT for premium plus streaming responses when Anthropic credit errors occur', { timeout: 15000 }, async () => {
    process.env.PREMIUM_PLUS_ANTHROPIC_MODEL = 'claude-opus-4-6'

    const { POST, legalAgentMocks } = await loadRoute({
      planData: { plan: 'premium +', paidAccess: true, planStatus: 'active' },
      processMessageResult: { task: 'legal_procedure', contextType: 'general', urgency: 'normal', caseId: null },
    })

    ;(legalAgentMocks.invokePremiumPlusLegalAgentStream as any).mockRejectedValueOnce(
      new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_test"}')
    )

    const response = await POST(
      buildStreamingChatRequest({
        message: 'I am at the pre-claim stage of an employment tribunal claim. What claim form and procedural steps are usually involved?',
        history: [],
      })
    )
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('Premium answer')
    expect(body).not.toContain('credit balance')
    expect(body).not.toContain('Anthropic')
    expect(legalAgentMocks.invokePremiumPlusLegalAgentStream).toHaveBeenCalledTimes(2)
    expect((legalAgentMocks.invokePremiumPlusLegalAgentStream as any).mock.calls[1][5]).toEqual(
      expect.objectContaining({
        forceOpenAiFallback: true,
        openaiFallbackModel: 'gpt-4.1',
      })
    )
  })

  it('keeps premium plus definition questions on the direct fast path', { timeout: 15000 }, async () => {
    process.env.PREMIUM_PLUS_ANTHROPIC_MODEL = 'claude-opus-4-6'

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
        autoDecideSearch: true,
        anthropicModel: 'claude-opus-4-6',
      })
    )
  })

  it('keeps premium plus procedural questions on the web-only path without case-law lookup', { timeout: 15000 }, async () => {
    process.env.PREMIUM_PLUS_ANTHROPIC_MODEL = 'claude-opus-4-6'

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
        autoDecideSearch: true,
        anthropicModel: 'claude-opus-4-6',
      })
    )
  })

  it('falls back when premium plus case-law retrieval exceeds the timeout budget', { timeout: 15000 }, async () => {
    process.env.PREMIUM_PLUS_ANTHROPIC_MODEL = 'claude-opus-4-6'
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
        autoDecideSearch: true,
        anthropicModel: 'claude-opus-4-6',
      })
    )
  })
})
