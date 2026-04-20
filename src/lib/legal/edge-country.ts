import { isSupportedCountryCode, type SupportedCountryCode } from '@/lib/legal/jurisdictions'

export const readFirstHeaderValue = (headers: Headers, names: readonly string[]): string | null => {
  for (const name of names) {
    const value = headers.get(name)
    if (value && value.trim()) return value.trim()
  }
  return null
}

const normalizeCountryCode = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null
}

const normalizeRegionCode = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase()
  return /^[A-Z]{2,3}$/.test(normalized) ? normalized : null
}

export function readEdgeCountryCode(headers: Headers): SupportedCountryCode | null {
  const normalized = normalizeCountryCode(readFirstHeaderValue(headers, [
    'cf-ipcountry',
    'cloudfront-viewer-country',
    'x-country-code',
    'x-vercel-ip-country',
  ]))
  return isSupportedCountryCode(normalized) ? normalized : null
}

export function readEdgeRegionCode(headers: Headers): string | null {
  return normalizeRegionCode(readFirstHeaderValue(headers, [
    'cloudfront-viewer-country-region',
    'x-region-code',
  ]))
}
