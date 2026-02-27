import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const cache = new Map<string, string>()

const buildSearchUrl = (title: string) =>
  `https://www.legislation.gov.uk/all?title=${encodeURIComponent(title)}`

const buildJusticeSearchUrl = (query: string) =>
  `https://www.justice.gov.uk/courts/procedure-rules/civil/search?query=${encodeURIComponent(query)}&profile=_default`

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

const extractLegislationUrl = (html: string) => {
  const match = html.match(/href="(\/(?:ukpga|uksi|ukla|asp|anaw|mwa|nia|ukdsi)\/\d{4}\/\d+(?:\/contents)?)"/i)
  return match ? `https://www.legislation.gov.uk${match[1]}` : null
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
    const resolved = extractLegislationUrl(html) || searchUrl
    cache.set(rawTitle, resolved)
    return NextResponse.json({ url: resolved }, { status: 200 })
  } catch (error: unknown) {
    const fallback = resolveCprOrPdUrl(rawTitle) || buildSearchUrl(rawTitle)
    return NextResponse.json({ url: fallback }, { status: 200 })
  }
}
