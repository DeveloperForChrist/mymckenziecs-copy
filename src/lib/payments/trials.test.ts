import { describe, expect, it } from 'vitest'
import { getSubscriptionTrialEnd, getSubscriptionTrialEndUnix } from '@/lib/payments/trials'
import { isBillingActiveStripeStatus, isTrialingStripeStatus } from '@/lib/payments/subscription-status'

describe('subscription trials', () => {
  it('sets the free trial to the same UTC time two weeks later', () => {
    const now = new Date('2026-03-27T10:15:00.000Z')
    const trialEnd = getSubscriptionTrialEnd(now)

    expect(trialEnd.toISOString()).toBe('2026-04-10T10:15:00.000Z')
    expect(getSubscriptionTrialEndUnix(now)).toBe(Math.floor(trialEnd.getTime() / 1000))
  })

  it('rolls end-of-month dates forward by fourteen days', () => {
    const now = new Date('2026-01-31T08:00:00.000Z')
    const trialEnd = getSubscriptionTrialEnd(now)

    expect(trialEnd.toISOString()).toBe('2026-02-14T08:00:00.000Z')
  })

  it('treats trialing subscriptions as active paid access', () => {
    expect(isTrialingStripeStatus('trialing')).toBe(true)
    expect(isBillingActiveStripeStatus('trialing')).toBe(true)
    expect(isBillingActiveStripeStatus('active')).toBe(true)
    expect(isBillingActiveStripeStatus('cancelled')).toBe(false)
  })
})
