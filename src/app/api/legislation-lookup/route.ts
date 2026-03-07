import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const cache = new Map<string, string>()
const LEGISLATION_PATH_PATTERN = /href="(\/(?:ukpga|uksi|ukla|asp|anaw|mwa|nia|ukdsi)\/\d{4}\/\d+(?:\/contents)?)"/gi
const GENERIC_REFERENCE_WORDS = new Set([
  'act',
  'rules',
  'regulations',
  'order',
  'orders',
  'the',
  'and',
  'of',
  'for',
  'part',
  'section',
  'rule',
])

const buildSearchUrl = (title: string) =>
  `https://www.legislation.gov.uk/all?title=${encodeURIComponent(title)}`

const resolveCprPartUrl = (part: string) => {
  const numeric = part.match(/^\d{1,2}$/)
  if (!numeric) return null
  const padded = part.padStart(2, '0')
  return `https://www.justice.gov.uk/courts/procedure-rules/civil/rules/part${padded}`
}

const resolveCprOrPdUrl = (title: string) => {
  const text = title.trim()
  if (!text) return null
  const lower = text.toLowerCase()

  if (/cpr|civil procedure rules/.test(lower)) {
    const partMatch = text.match(/\bpart\s*([0-9]{1,2})\b/i)
    if (partMatch) {
      const partUrl = resolveCprPartUrl(partMatch[1])
      if (partUrl) return partUrl
    }
    const ruleMatch = text.match(/\br\.?\s*([0-9]{1,2})(?:\.[0-9]+)?\b/i)
    if (ruleMatch) {
      const partUrl = resolveCprPartUrl(ruleMatch[1])
      if (partUrl) return partUrl
    }
    return 'https://www.justice.gov.uk/courts/procedure-rules/civil'
  }

  if (/\bpractice direction\b|\bpd\b/.test(lower)) {
    return 'https://www.justice.gov.uk/courts/procedure-rules/civil/rules/pd'
  }

  return null
}

const normalizeReferenceText = (value: string) =>
  value
    .toLowerCase()
    .replace(/&amp;/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const extractLegislationUrls = (html: string) => {
  const urls: string[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  LEGISLATION_PATH_PATTERN.lastIndex = 0
  while ((match = LEGISLATION_PATH_PATTERN.exec(html)) !== null) {
    const url = `https://www.legislation.gov.uk${match[1]}`
    if (seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

const extractReferenceTokens = (title: string) =>
  normalizeReferenceText(title)
    .split(/\s+/)
    .filter((token) => {
      if (!token) return false
      if (/^\d{4}$/.test(token)) return true
      if (GENERIC_REFERENCE_WORDS.has(token)) return false
      return token.length >= 3
    })

const isVerifiedLegislationPage = (title: string, html: string) => {
  const pageText = normalizeReferenceText(html.replace(/<[^>]+>/g, ' '))
  if (!pageText) return false
  if (/\b(page not found|not found|no results found|sorry, there is a problem)\b/i.test(pageText)) {
    return false
  }

  const normalizedTitle = normalizeReferenceText(title)
  if (normalizedTitle && pageText.includes(normalizedTitle)) {
    return true
  }

  const tokens = extractReferenceTokens(title)
  if (tokens.length === 0) return false

  const matchedCount = tokens.filter((token) => pageText.includes(token)).length
  const requiredMatches = tokens.length <= 2 ? tokens.length : Math.min(tokens.length, 3)
  return matchedCount >= requiredMatches
}

const resolveVerifiedLegislationUrl = async (title: string, searchHtml: string) => {
  const candidates = extractLegislationUrls(searchHtml).slice(0, 3)
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { headers: { 'User-Agent': 'MyMcKenzieCS/1.0' } })
      if (!response.ok) continue
      const html = await response.text()
      if (isVerifiedLegislationPage(title, html)) {
        return candidate
      }
    } catch {
      continue
    }
  }
  return null
}

export const clearLegislationLookupCacheForTests = () => {
  cache.clear()
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawTitle = searchParams.get('title')?.trim()
  if (!rawTitle) {
    return NextResponse.json({ message: 'title is required' }, { status: 400 })
  }

  if (cache.has(rawTitle)) {
    return NextResponse.json({ url: cache.get(rawTitle) }, { status: 200 })
  }

  try {
    const cprOrPdUrl = resolveCprOrPdUrl(rawTitle)
    if (cprOrPdUrl) {
      cache.set(rawTitle, cprOrPdUrl)
      return NextResponse.json({ url: cprOrPdUrl }, { status: 200 })
    }

    const searchUrl = buildSearchUrl(rawTitle)
    const response = await fetch(searchUrl, { headers: { 'User-Agent': 'MyMcKenzieCS/1.0' } })
    if (!response.ok) {
      return NextResponse.json({ url: searchUrl }, { status: 200 })
    }

    const html = await response.text()
    const resolved = (await resolveVerifiedLegislationUrl(rawTitle, html)) || searchUrl
    cache.set(rawTitle, resolved)
    return NextResponse.json({ url: resolved }, { status: 200 })
  } catch (_error: any) {
    const fallback = resolveCprOrPdUrl(rawTitle) || buildSearchUrl(rawTitle)
    return NextResponse.json({ url: fallback }, { status: 200 })
  }
}
