const LONDON_LOCALE = 'en-GB'
const LONDON_TIME_ZONE = 'Europe/London'

export function formatLondonDateTime(date: Date) {
  const datePart = new Intl.DateTimeFormat(LONDON_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: LONDON_TIME_ZONE,
  }).format(date)

  const timePart = new Intl.DateTimeFormat(LONDON_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: LONDON_TIME_ZONE,
    timeZoneName: 'short',
  }).format(date)

  return { datePart, timePart }
}
