import { describe, expect, it } from 'vitest'
import { getSubscriptionTrialEnd, getSubscriptionTrialEndUnix } from '@/lib/payments/trials'
import { isBillingActiveStripeStatus, isTrialingStripeStatus } from '@/lib/payments/subscription-status'

describe('subscription trials', () => {
  it('sets the free trial to the same UTC time one calendar month later', () => {
    const now = new Date('2026-03-27T10:15:00.000Z')
    const trialEnd = getSubscriptionTrialEnd(now)

    expect(trialEnd.toISOString()).toBe('2026-04-27T10:15:00.000Z')
    expect(getSubscriptionTrialEndUnix(now)).toBe(Math.floor(trialEnd.getTime() / 1000))
  })

  it('clamps end-of-month dates to the last valid day of the next month', () => {
    const now = new Date('2026-01-31T08:00:00.000Z')
    const trialEnd = getSubscriptionTrialEnd(now)

    expect(trialEnd.toISOString()).toBe('2026-02-28T08:00:00.000Z')
  })

  it('treats trialing subscriptions as active paid access', () => {
    expect(isTrialingStripeStatus('trialing')).toBe(true)
    expect(isBillingActiveStripeStatus('trialing')).toBe(true)
    expect(isBillingActiveStripeStatus('active')).toBe(true)
    expect(isBillingActiveStripeStatus('cancelled')).toBe(false)
  })
})
