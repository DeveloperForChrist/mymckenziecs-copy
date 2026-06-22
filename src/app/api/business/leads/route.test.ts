import { afterEach, describe, expect, it, vi } from 'vitest'

describe('/api/business/leads route', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('returns 409 and does not create a matter when another business won the claim', async () => {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: { id: '00000000-0000-4000-8000-000000000001', marketplace_enquiry_id: 'enquiry-1' },
        error: null,
      })),
    }
    const rpc = vi.fn(async () => ({
      data: { claimed: false, reason: 'already_claimed' },
      error: null,
    }))
    const syncAcceptedLeadMatterRow = vi.fn()

    vi.doMock('@/lib/database/supabase-route', () => ({
      createSupabaseRouteClient: vi.fn(async () => ({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
      })),
    }))
    vi.doMock('@/lib/database/supabase-server', () => ({
      supabaseAdmin: { from: vi.fn(() => query), rpc },
    }))
    vi.doMock('@/lib/business/business-workspace', () => ({
      BusinessWorkspaceError: class BusinessWorkspaceError extends Error {
        status = 500
      },
      ensureBusinessContext: vi.fn(async () => ({
        businessId: '00000000-0000-4000-8000-000000000002',
        userId: '00000000-0000-4000-8000-000000000003',
        role: 'owner',
      })),
    }))
    vi.doMock('@/lib/business/business-matters-db', () => ({
      businessLeadToRow: vi.fn(),
      leadUpdateToRow: vi.fn(() => ({ status: 'accepted' })),
      loadBusinessLeadRows: vi.fn(),
      loadClientMatterRows: vi.fn(),
      rowToBusinessLead: vi.fn(),
      rowToClientMatter: vi.fn(),
      syncAcceptedLeadMatterRow,
    }))

    const { PUT } = await import('./route')
    const response = await PUT(new Request('https://app.example.com/api/business/leads', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', status: 'accepted' }),
    }) as any)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      message: 'This enquiry has already been accepted by another professional.',
    })
    expect(syncAcceptedLeadMatterRow).not.toHaveBeenCalled()
  })
})
