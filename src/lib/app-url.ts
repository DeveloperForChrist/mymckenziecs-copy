const FALLBACK_LOCAL = 'http://localhost:3000'
const FALLBACK_PRODUCTION = 'https://www.mymckenziecs.com'

function firstHeaderValue(value: string | null): string {
  if (!value) return ''
  return value.split(',')[0]?.trim() || ''
}

function toOrigin(candidate: string): string {
  const trimmed = candidate.trim().replace(/\/+$/, '')
  if (!trimmed) return ''

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(withProtocol)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return ''
  }
}

function isLocalHost(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

export function getAppUrl(request?: Request): string {
  const explicitAppUrl = toOrigin(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '')
  if (explicitAppUrl) return explicitAppUrl

  const renderExternal = toOrigin(process.env.RENDER_EXTERNAL_URL || '')
  if (renderExternal) return renderExternal

  if (request && typeof request.headers?.get === 'function') {
    const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'))
    const host = forwardedHost || firstHeaderValue(request.headers.get('host'))
    const proto = firstHeaderValue(request.headers.get('x-forwarded-proto')) || 'https'

    if (host) {
      const fromHeaders = toOrigin(`${proto}://${host}`)
      if (fromHeaders) return fromHeaders
    }

    const fromRequestUrl = toOrigin(request.url || '')
    if (fromRequestUrl && !isLocalHost(fromRequestUrl)) {
      return fromRequestUrl
    }
  }

  return process.env.NODE_ENV === 'production' ? FALLBACK_PRODUCTION : FALLBACK_LOCAL
}

export default getAppUrl
