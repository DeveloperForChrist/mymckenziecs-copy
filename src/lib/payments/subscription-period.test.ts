import { describe, expect, it } from 'vitest'
import {
  getStripeSubscriptionPeriodEndIso,
  getStripeSubscriptionPeriodEndUnix,
  getStripeSubscriptionPeriodStartIso,
  getStripeSubscriptionPeriodStartUnix,
} from '@/lib/payments/subscription-period'

describe('subscription period helpers', () => {
  it('uses trial dates when current period dates are absent', () => {
    const subscription = {
      created: 1774600000,
      trial_start: 1774601000,
      trial_end: 1777193000,
      current_period_start: null,
      current_period_end: null,
    }

    expect(getStripeSubscriptionPeriodStartUnix(subscription)).toBe(1774601000)
    expect(getStripeSubscriptionPeriodEndUnix(subscription)).toBe(1777193000)
    expect(getStripeSubscriptionPeriodStartIso(subscription)).toBe('2026-03-27T08:43:20.000Z')
    expect(getStripeSubscriptionPeriodEndIso(subscription)).toBe('2026-04-26T08:43:20.000Z')
  })

  it('prefers current period dates when Stripe provides them', () => {
    const subscription = {
      created: 1774600000,
      trial_start: 1774601000,
      trial_end: 1777193000,
      current_period_start: 1774602000,
      current_period_end: 1777194000,
    }

    expect(getStripeSubscriptionPeriodStartUnix(subscription)).toBe(1774602000)
    expect(getStripeSubscriptionPeriodEndUnix(subscription)).toBe(1777194000)
  })
})
