export const SUBSCRIPTION_TRIAL_DAYS = 7

export function addUtcDays(date: Date, days: number) {
  const wholeDays = Number.isFinite(days) ? Math.trunc(days) : 0
  if (wholeDays === 0) return new Date(date.getTime())

  const shifted = new Date(date.getTime())
  shifted.setUTCDate(shifted.getUTCDate() + wholeDays)
  return shifted
}

export function getSubscriptionTrialEnd(now: Date = new Date()) {
  return addUtcDays(now, SUBSCRIPTION_TRIAL_DAYS)
}

export function getSubscriptionTrialEndUnix(now: Date = new Date()) {
  return Math.floor(getSubscriptionTrialEnd(now).getTime() / 1000)
}
