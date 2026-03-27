function toFiniteUnix(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.trunc(numeric)
}

function toIsoFromUnix(value: unknown): string | null {
  const unix = toFiniteUnix(value)
  return unix ? new Date(unix * 1000).toISOString() : null
}

export function getStripeSubscriptionPeriodStartUnix(subscription: any): number | null {
  return (
    toFiniteUnix(subscription?.current_period_start) ??
    toFiniteUnix(subscription?.trial_start) ??
    toFiniteUnix(subscription?.created)
  )
}

export function getStripeSubscriptionPeriodEndUnix(subscription: any): number | null {
  return (
    toFiniteUnix(subscription?.current_period_end) ??
    toFiniteUnix(subscription?.trial_end)
  )
}

export function getStripeSubscriptionPeriodStartIso(subscription: any): string | null {
  return toIsoFromUnix(getStripeSubscriptionPeriodStartUnix(subscription))
}

export function getStripeSubscriptionPeriodEndIso(subscription: any): string | null {
  return toIsoFromUnix(getStripeSubscriptionPeriodEndUnix(subscription))
}
