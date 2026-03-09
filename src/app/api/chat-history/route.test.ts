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
      if (filter.type === 'neq') return value !== filter.value
      if (filter.type === 'not') {
        if (filter.value === 'null') return value != null
        return value !== filter.value
      }
      return true
    })
  )

const createTableQuery = (rows: MockRow[] = []) => {
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
    in: vi.fn((column: string, value: any[]) => {
      state.filters.push({ type: 'in', column, value })
      return builder
    }),
    eq: vi.fn((column: string, value: any) => {
      state.filters.push({ type: 'eq', column, value })
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
    not: vi.fn((column: string, _operator: string, value: any) => {
      state.filters.push({ type: 'not', column, value })
      return builder
    }),
    neq: vi.fn((column: string, value: any) => {
      state.filters.push({ type: 'neq', column, value })
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
    or: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      const matched = getRows()
      return { data: matched[0] ?? null, error: null }
    }),
    single: vi.fn(async () => {
      const matched = getRows()
      return { data: matched[0] ?? null, error: null }
    }),
    then: (onFulfilled: (value: QueryResult<any>) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: getRows(), error: null }).then(onFulfilled, onRejected),
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

  it('returns paginated messages with hydrated assistant presentation metadata', { timeout: 15000 }, async () => {
    const supabaseAdmin = {
      from: vi.fn((table: string) => {
        switch (table) {
          case 'users':
            return createTableQuery([{ id: 'user-1', email: 'user@example.com' }])
          case 'cases':
            return createTableQuery([])
          case 'chat_memory':
            return createTableQuery([{ conversation_id: 'conv-1', user_id: 'user-1' }])
          case 'messages':
            return createTableQuery([
              {
                id: 'msg-2',
                conversation_id: 'conv-1',
                case_id: null,
                role: 'assistant',
                content: 'Next steps\n\n1. File the claim',
                timestamp: '2026-03-08T10:00:00.000Z',
                metadata: {
                  sources: [{ number: 1, title: 'CPR', url: 'https://www.justice.gov.uk/courts/procedure-rules/civil' }],
                },
              },
              {
                id: 'msg-1',
                conversation_id: 'conv-1',
                case_id: null,
                role: 'user',
                content: 'How do I start the claim?',
                timestamp: '2026-03-08T09:55:00.000Z',
                metadata: null,
              },
            ])
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
          lines: [{ kind: 'ordered', order: 1, text: 'File the claim' }],
        },
      ],
    })
  })
})
