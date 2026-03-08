import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult<T> = { data: T; error: any }

const createQuery = <T,>(result: QueryResult<T>) => {
  const builder: any = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => Promise.resolve(result)),
    is: vi.fn(() => builder),
    not: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    or: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled: (value: QueryResult<T>) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }

  return builder
}

describe('/api/chat-history route', () => {
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

  it('returns paginated messages with hydrated assistant presentation metadata', async () => {
    const usersQuery = createQuery({ data: [{ id: 'user-1' }], error: null })
    const casesQuery = createQuery({ data: [], error: null })
    const memoryAccessQuery = createQuery({ data: { conversation_id: 'conv-1' }, error: null })
    const messagesQuery = createQuery({
      data: [
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Next steps\n\n1. File the claim',
          timestamp: '2026-03-08T10:00:00.000Z',
          metadata: {
            sources: [{ number: 1, title: 'CPR', url: 'https://www.justice.gov.uk/courts/procedure-rules/civil' }],
          },
        },
        {
          id: 'msg-1',
          role: 'user',
          content: 'How do I start the claim?',
          timestamp: '2026-03-08T09:55:00.000Z',
          metadata: null,
        },
      ],
      error: null,
    })

    const supabaseAdmin = {
      from: vi.fn((table: string) => {
        switch (table) {
          case 'users':
            return usersQuery
          case 'cases':
            return casesQuery
          case 'chat_memory':
            return memoryAccessQuery
          case 'messages':
            return messagesQuery
          default:
            throw new Error(`Unexpected table: ${table}`)
        }
      }),
    }

    vi.doMock('@/lib/database/supabase-route', () => ({
      createSupabaseRouteClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: 'user-1', email: 'user@example.com' } },
            error: null,
          })),
        },
      })),
    }))
    vi.doMock('@/lib/database/supabase-server', () => ({ supabaseAdmin }))
    vi.doMock('@/lib/payments/entitlements', () => ({
      getOrSyncUserEntitlementSnapshot: vi.fn(async () => ({ paid_access: true, plan_type: 'premium' })),
    }))

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost/api/chat-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'conv-1', limit: 1 }),
      }) as any
    )

    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.messages).toHaveLength(1)
    expect(payload.hasMoreOlder).toBe(true)
    expect(payload.nextCursor).toBe('2026-03-08T10:00:00.000Z|msg-2')
    expect(payload.messages[0].message).toBe('Next steps\n\n1. File the claim')
    expect(payload.messages[0].metadata.presentation).toEqual({
      version: 1,
      sections: [
        {
          heading: 'Next steps',
          lines: [{ kind: 'ordered', text: 'File the claim' }],
        },
      ],
    })
  })
})
