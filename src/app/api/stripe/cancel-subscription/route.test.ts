import { afterEach, describe, expect, it, vi } from 'vitest'

const createSubscriptionsQuery = (row: any) => {
  const builder: any = {
    select: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  }

  return builder
}

const createUsersSelectQuery = (row: any) => {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  }

  return builder
}
describe('/api/stripe/cancel-subscription route', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  const loadRoute = async ({
    subscriptionRow,
    userRow = { email: 'user@example.com', name: 'Jordan' },
    updatedSubscription,
  }: {
    subscriptionRow: any
    userRow?: any
    updatedSubscription?: any
  }) => {
    const sendResendEmail = vi.fn(async () => null)
    const subscriptionUpdate = vi.fn(async () => (
      updatedSubscription || {
        id: subscriptionRow.stripe_subscription_id,
        status: subscriptionRow.status,
        cancel_at_period_end: true,
        trial_start: 1776086400,
        trial_end: 1777296000,
      }
    ))
    const subscriptionsQuery = createSubscriptionsQuery(subscriptionRow)
    subscriptionsQuery.eq = vi.fn((column: string) => {
      if (column === 'stripe_subscription_id') {
        return Promise.resolve({ error: null })
      }
      return subscriptionsQuery
    })

    vi.doMock('@/lib/database/supabase-route', () => ({
      createSupabaseRouteClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: 'user-1' } },
            error: null,
          })),
        },
      })),
    }))

    vi.doMock('@/lib/database/supabase-server', () => ({
      supabaseAdmin: {
        from: vi.fn((table: string) => {
          if (table === 'subscriptions') {
            return subscriptionsQuery
          }

          if (table === 'users') {
            return createUsersSelectQuery(userRow)
          }

          throw new Error(`Unexpected table: ${table}`)
        }),
      },
    }))

    vi.doMock('@/lib/payments/stripe', () => ({
      stripe: {
        subscriptions: {
          update: subscriptionUpdate,
        },
      },
    }))

    vi.doMock('@/lib/utils/rate-limit', () => ({
      billingIpRateLimiter: {},
      billingRateLimiter: {},
      getClientIp: vi.fn(() => '127.0.0.1'),
      getIdentifier: vi.fn((value: string) => value),
      rateLimit: vi.fn(async () => ({ success: true })),
      rateLimitExceededResponse: vi.fn(),
    }))

    vi.doMock('@/lib/payments/entitlements', () => ({
      syncUserEntitlementSnapshot: vi.fn(async () => null),
    }))

    vi.doMock('@/lib/payments/user-plan', () => ({
      invalidateUserPlanCache: vi.fn(),
    }))

    vi.doMock('@/lib/email/resend', () => ({
      sendResendEmail,
    }))

    vi.doMock('@/lib/app-url', () => ({
      getAppUrl: vi.fn(() => 'https://app.example.com'),
    }))

    vi.doMock('@/lib/plans/access', async () => {
      const actual = await vi.importActual<any>('@/lib/plans/access')
      return actual
    })

    const route = await import('./route')
    return {
      POST: route.POST,
      sendResendEmail,
      subscriptionUpdate,
    }
  }

  it('sends an immediate confirmation email when a free trial cancellation is scheduled', async () => {
    const { POST, sendResendEmail, subscriptionUpdate } = await loadRoute({
      subscriptionRow: {
        stripe_subscription_id: 'sub_trial',
        status: 'trialing',
        cancel_at_period_end: false,
        plan_type: 'Basic',
      },
    })

    const response = await POST(new Request('https://app.example.com/api/stripe/cancel-subscription', {
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(subscriptionUpdate).toHaveBeenCalledWith('sub_trial', { cancel_at_period_end: true })
    expect(sendResendEmail).toHaveBeenCalledTimes(1)

    const emailArgs = sendResendEmail.mock.calls.at(0)?.[0] as any
    expect(emailArgs?.subject).toContain('free trial will end on')
    expect(emailArgs?.tag).toBe('billing-trial-cancellation-scheduled')
    expect(emailArgs?.htmlBody).toContain('free trial has been scheduled to end')
  })

  it('does not resend the email when cancellation is already scheduled', async () => {
    const { POST, sendResendEmail, subscriptionUpdate } = await loadRoute({
      subscriptionRow: {
        stripe_subscription_id: 'sub_existing',
        status: 'active',
        cancel_at_period_end: true,
        plan_type: 'Premium',
      },
    })

    const response = await POST(new Request('https://app.example.com/api/stripe/cancel-subscription', {
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(subscriptionUpdate).not.toHaveBeenCalled()
    expect(sendResendEmail).not.toHaveBeenCalled()
  })
})
