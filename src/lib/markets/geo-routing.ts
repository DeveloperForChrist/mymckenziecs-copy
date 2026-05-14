import type { NextResponse } from 'next/server'
import type { PublicMarket } from '@/lib/markets/public-routes'

export const MARKET_COOKIE_NAME = 'market'
export const MARKET_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

const normalizeMarketValue = (value?: string | null): PublicMarket | null => {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'US') return 'US'
  if (normalized === 'GB') return 'GB'
  return null
}

export function readStoredMarketCookie(value?: string | null): PublicMarket | null {
  return normalizeMarketValue(value)
}

export function resolveRootMarket({
  profileCountryCode,
  storedMarket,
  edgeCountryCode,
}: {
  profileCountryCode?: string | null
  storedMarket?: string | null
  edgeCountryCode?: string | null
}): PublicMarket {
  const profileMarket = normalizeMarketValue(profileCountryCode)
  if (profileMarket) return profileMarket

  const cookieMarket = normalizeMarketValue(storedMarket)
  if (cookieMarket) return cookieMarket

  const edgeMarket = normalizeMarketValue(edgeCountryCode)
  return edgeMarket || 'GB'
}

export function setMarketCookie(response: NextResponse, market: PublicMarket, secure: boolean) {
  response.cookies.set({
    name: MARKET_COOKIE_NAME,
    value: market,
    path: '/',
    maxAge: MARKET_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    httpOnly: true,
    secure,
  })
}

export function copyCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie)
  }
}
