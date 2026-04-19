import type { NextRequest } from 'next/server'
import {
  getCountryOption,
  getJurisdictionLabel,
  isSupportedCountryCode,
  isSupportedJurisdictionCode,
  type SupportedCountryCode,
} from '@/lib/legal/jurisdictions'

type GeoDetectionSource = 'edge-header' | 'ipinfo-lite' | 'none'

export type LegalMatterGeoDetection = {
  detectedCountryCode: string | null
  detectedCountryName: string | null
  detectedRegionCode: string | null
  source: GeoDetectionSource
  suggestedCountryCode: SupportedCountryCode | null
  suggestedJurisdictionCode: string | null
  suggestedJurisdictionLabel: string | null
  isSupportedCountry: boolean
  requiresConfirmation: true
}

const countryNameByCode: Record<string, string> = {
  GB: 'United Kingdom',
  US: 'United States',
}

const readFirstHeaderValue = (headers: Headers, names: string[]): string | null => {
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

const isPublicIpAddress = (value?: string | null) => {
  const candidate = String(value || '').trim()
  if (!candidate) return false
  if (candidate.includes(':')) {
    const lower = candidate.toLowerCase()
    return !(
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80:')
    )
  }

  const octets = candidate.split('.').map((part) => Number(part))
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false
  }

  const [a, b] = octets
  if (a === 10) return false
  if (a === 127) return false
  if (a === 192 && b === 168) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 169 && b === 254) return false
  return true
}

const extractClientIp = (headers: Headers) => {
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    for (const rawPart of forwardedFor.split(',')) {
      const candidate = rawPart.trim()
      if (isPublicIpAddress(candidate)) return candidate
    }
  }

  const directCandidate = readFirstHeaderValue(headers, [
    'cf-connecting-ip',
    'x-real-ip',
    'x-client-ip',
    'fastly-client-ip',
    'x-cluster-client-ip',
  ])
  return isPublicIpAddress(directCandidate) ? directCandidate : null
}

const buildSuggestedJurisdictionCode = (
  countryCode: SupportedCountryCode | null,
  regionCode?: string | null
) => {
  if (!countryCode) return null
  if (countryCode === 'US') {
    const normalizedRegion = normalizeRegionCode(regionCode)
    const candidate = normalizedRegion ? `US-${normalizedRegion}` : null
    return candidate && isSupportedJurisdictionCode(countryCode, candidate) ? candidate : null
  }
  return null
}

const buildDetectionResult = ({
  countryCode,
  countryName,
  regionCode,
  source,
}: {
  countryCode?: string | null
  countryName?: string | null
  regionCode?: string | null
  source: GeoDetectionSource
}): LegalMatterGeoDetection => {
  const normalizedCountryCode = normalizeCountryCode(countryCode)
  const supportedCountryCode = isSupportedCountryCode(normalizedCountryCode)
    ? normalizedCountryCode
    : null
  const normalizedRegionCode = normalizeRegionCode(regionCode)
  const suggestedJurisdictionCode = buildSuggestedJurisdictionCode(supportedCountryCode, normalizedRegionCode)

  return {
    detectedCountryCode: normalizedCountryCode,
    detectedCountryName:
      countryName?.trim() ||
      (normalizedCountryCode ? countryNameByCode[normalizedCountryCode] || null : null),
    detectedRegionCode: normalizedRegionCode,
    source,
    suggestedCountryCode: supportedCountryCode,
    suggestedJurisdictionCode,
    suggestedJurisdictionLabel: getJurisdictionLabel(supportedCountryCode, suggestedJurisdictionCode),
    isSupportedCountry: Boolean(supportedCountryCode && getCountryOption(supportedCountryCode)),
    requiresConfirmation: true,
  }
}

const detectFromEdgeHeaders = (headers: Headers) => {
  const countryCode = normalizeCountryCode(readFirstHeaderValue(headers, [
    'x-vercel-ip-country',
    'cf-ipcountry',
    'cloudfront-viewer-country',
    'x-country-code',
  ]))

  if (!countryCode) return null

  const regionCode = normalizeRegionCode(readFirstHeaderValue(headers, [
    'x-vercel-ip-country-region',
    'cloudfront-viewer-country-region',
    'x-region-code',
  ]))

  return buildDetectionResult({
    countryCode,
    regionCode,
    source: 'edge-header',
  })
}

const detectFromIpinfoLite = async (ipAddress: string, token: string) => {
  const response = await fetch(`https://api.ipinfo.io/lite/${encodeURIComponent(ipAddress)}?token=${encodeURIComponent(token)}`, {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) return null
  const payload = await response.json().catch(() => null) as
    | { country_code?: string; country?: string }
    | null
  if (!payload) return null

  return buildDetectionResult({
    countryCode: payload.country_code,
    countryName: payload.country,
    source: 'ipinfo-lite',
  })
}

export async function detectLegalMatterLocation(request: NextRequest): Promise<LegalMatterGeoDetection> {
  const fromHeaders = detectFromEdgeHeaders(request.headers)
  if (fromHeaders) return fromHeaders

  const token = (process.env.IPINFO_TOKEN || '').trim()
  const clientIp = extractClientIp(request.headers)

  if (token && clientIp) {
    try {
      const fromIpinfo = await detectFromIpinfoLite(clientIp, token)
      if (fromIpinfo) return fromIpinfo
    } catch (error) {
      console.warn('IP geolocation lookup failed:', error)
    }
  }

  return buildDetectionResult({ source: 'none' })
}
