import { afterEach, describe, expect, it, vi } from 'vitest'

const createMaybeSingleQuery = (row: any) => {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  }

  return builder
}

describe('/api/stripe/plan-checkout route', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  const loadRoute = async ({
    existingSubscriptionRow = null,
  }: {
    existingSubscriptionRow?: { stripe_customer_id?: string | null; stripe_subscription_id?: string | null } | null
  } = {}) => {
    const checkoutSessionCreate = vi.fn(async () => ({ url: 'https://checkout.stripe.test/session' }))
    const customerCreate = vi.fn(async () => ({ id: 'cus_new' }))

    vi.doMock('@/lib/database/supabase-route', () => ({
      createSupabaseRouteClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: {
              user: {
                id: 'user-1',
                email: 'user@example.com',
                email_confirmed_at: '2026-03-27T10:15:00.000Z',
              },
            },
            error: null,
          })),
        },
      })),
    }))

    vi.doMock('@/lib/database/supabase-server', () => ({
      supabaseAdmin: {
        from: vi.fn((table: string) => {
          if (table === 'users') {
            return createMaybeSingleQuery({
              id: 'user-1',
              email_verified_at: '2026-03-27T10:15:00.000Z',
            })
          }

          if (table === 'subscriptions') {
            return createMaybeSingleQuery(existingSubscriptionRow)
          }

          throw new Error(`Unexpected table: ${table}`)
        }),
      },
    }))

    vi.doMock('@/lib/payments/stripe', () => ({
      stripe: {
        customers: {
          create: customerCreate,
        },
        checkout: {
          sessions: {
            create: checkoutSessionCreate,
          },
        },
      },
    }))

    vi.doMock('@/lib/utils/api-usage-logger', () => ({
      logApiUsage: vi.fn(async () => null),
    }))

    vi.doMock('@/lib/utils/rate-limit', () => ({
      billingIpRateLimiter: {},
      billingRateLimiter: {},
      getClientIp: vi.fn(() => '127.0.0.1'),
      getIdentifier: vi.fn((value: string) => value),
      rateLimit: vi.fn(async () => ({ success: true })),
      rateLimitExceededResponse: vi.fn(),
    }))

    vi.doMock('@/lib/app-url', () => ({
      getAppUrl: vi.fn(() => 'https://app.example.com'),
    }))

    const route = await import('./route')
    return {
      POST: route.POST,
      checkoutSessionCreate,
      customerCreate,
    }
  }

  it('applies a one-week trial to the first paid subscription checkout', async () => {
    const { POST, checkoutSessionCreate, customerCreate } = await loadRoute()

    const response = await POST(
      new Request('https://app.example.com/api/stripe/plan-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'price_basic' }),
      }) as any
    )

    expect(response.status).toBe(200)
    expect(customerCreate).toHaveBeenCalledTimes(1)

    const checkoutArgs = checkoutSessionCreate.mock.calls.at(0)?.[0] as any
    expect(checkoutArgs?.metadata?.trialApplied).toBe('true')
    expect(checkoutArgs?.subscription_data?.metadata?.trialApplied).toBe('true')
    expect(checkoutArgs?.subscription_data?.trial_period_days).toBe(7)
    expect(checkoutArgs?.success_url).toContain('session_id={CHECKOUT_SESSION_ID}')
    expect(checkoutArgs?.success_url).not.toContain('%7BCHECKOUT_SESSION_ID%7D')
  })

  it('does not reapply the trial when the user already has subscription history', async () => {
    const { POST, checkoutSessionCreate, customerCreate } = await loadRoute({
      existingSubscriptionRow: {
        stripe_customer_id: 'cus_existing',
        stripe_subscription_id: 'sub_existing',
      },
    })

    const response = await POST(
      new Request('https://app.example.com/api/stripe/plan-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'price_premium' }),
      }) as any
    )

    expect(response.status).toBe(200)
    expect(customerCreate).not.toHaveBeenCalled()

    const checkoutArgs = checkoutSessionCreate.mock.calls.at(0)?.[0] as any
    expect(checkoutArgs?.customer).toBe('cus_existing')
    expect(checkoutArgs?.metadata?.trialApplied).toBe('false')
    expect(checkoutArgs?.subscription_data?.metadata?.trialApplied).toBe('false')
    expect(checkoutArgs?.subscription_data?.trial_period_days).toBeUndefined()
  })
})
