export const ANALYTICS_CONSENT_STORAGE_KEY = 'mymckenziecs.analytics-consent'
export const ANALYTICS_CONSENT_COOKIE_NAME = 'mymckenziecs_analytics_consent'
export const ANALYTICS_CONSENT_UPDATED_EVENT = 'mymckenziecs:analytics-consent-updated'

const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export type AnalyticsConsentState = {
  analytics: boolean
  updatedAt: string
}

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined'

const readCookieValue = (name: string) => {
  if (!isBrowser()) {
    return null
  }

  const cookie = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))

  if (!cookie) {
    return null
  }

  return decodeURIComponent(cookie.slice(name.length + 1))
}

const parseCookieConsent = (raw: string | null): AnalyticsConsentState | null => {
  if (raw === 'granted') {
    return {
      analytics: true,
      updatedAt: '',
    }
  }

  if (raw === 'denied') {
    return {
      analytics: false,
      updatedAt: '',
    }
  }

  return null
}

export const parseAnalyticsConsent = (raw: string | null): AnalyticsConsentState | null => {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AnalyticsConsentState>

    if (typeof parsed.analytics !== 'boolean') {
      return null
    }

    return {
      analytics: parsed.analytics,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    }
  } catch {
    return null
  }
}

export const readAnalyticsConsent = (): AnalyticsConsentState | null => {
  if (!isBrowser()) {
    return null
  }

  const stored = parseAnalyticsConsent(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY))

  if (stored) {
    return stored
  }

  return parseCookieConsent(readCookieValue(ANALYTICS_CONSENT_COOKIE_NAME))
}

const writeConsentCookie = (analytics: boolean) => {
  if (!isBrowser()) {
    return
  }

  document.cookie = [
    `${ANALYTICS_CONSENT_COOKIE_NAME}=${analytics ? 'granted' : 'denied'}`,
    'Path=/',
    `Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ].join('; ')
}

const expireCookie = (name: string, domain?: string) => {
  if (!isBrowser()) {
    return
  }

  const parts = [
    `${name}=`,
    'Path=/',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'SameSite=Lax',
  ]

  if (domain) {
    parts.push(`Domain=${domain}`)
  }

  document.cookie = parts.join('; ')
}

const getCookieDomainsForCleanup = () => {
  if (!isBrowser()) {
    return [undefined]
  }

  const hostname = window.location.hostname
  const rootDomain = hostname.replace(/^www\./i, '')
  const domains = new Set<string | undefined>([undefined, hostname, `.${hostname}`])

  if (rootDomain && rootDomain !== hostname) {
    domains.add(rootDomain)
    domains.add(`.${rootDomain}`)
  }

  return Array.from(domains)
}

export const saveAnalyticsConsent = (analytics: boolean): AnalyticsConsentState => {
  if (!isBrowser()) {
    return {
      analytics,
      updatedAt: new Date().toISOString(),
    }
  }

  const nextState: AnalyticsConsentState = {
    analytics,
    updatedAt: new Date().toISOString(),
  }

  window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify(nextState))
  writeConsentCookie(analytics)
  window.dispatchEvent(
    new CustomEvent<AnalyticsConsentState>(ANALYTICS_CONSENT_UPDATED_EVENT, { detail: nextState })
  )

  return nextState
}

export const revokeAnalyticsTracking = (measurementId?: string) => {
  if (!isBrowser()) {
    return
  }

  if (measurementId) {
    const windowWithAnalyticsFlags = window as unknown as Record<string, unknown>
    windowWithAnalyticsFlags[`ga-disable-${measurementId}`] = true
  }

  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: 'denied',
    })
  }

  const gaCookieNames = document.cookie
    .split(';')
    .map((entry) => entry.trim().split('=')[0])
    .filter((name) => name === '_ga' || name === '_gid' || name === '_gat' || name.startsWith('_ga_'))

  for (const name of gaCookieNames) {
    for (const domain of getCookieDomainsForCleanup()) {
      expireCookie(name, domain)
    }
  }
}
