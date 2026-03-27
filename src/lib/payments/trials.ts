export const SUBSCRIPTION_TRIAL_MONTHS = 1

function daysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

export function addUtcCalendarMonthsClamped(date: Date, months: number) {
  const wholeMonths = Number.isFinite(months) ? Math.trunc(months) : 0
  if (wholeMonths === 0) return new Date(date.getTime())

  const shifted = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  )

  shifted.setUTCMonth(shifted.getUTCMonth() + wholeMonths)
  shifted.setUTCDate(Math.min(date.getUTCDate(), daysInUtcMonth(shifted.getUTCFullYear(), shifted.getUTCMonth())))
  return shifted
}

export function getSubscriptionTrialEnd(now: Date = new Date()) {
  return addUtcCalendarMonthsClamped(now, SUBSCRIPTION_TRIAL_MONTHS)
}

export function getSubscriptionTrialEndUnix(now: Date = new Date()) {
  return Math.floor(getSubscriptionTrialEnd(now).getTime() / 1000)
}
