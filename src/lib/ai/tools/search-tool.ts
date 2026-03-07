import { Tool } from "@langchain/core/tools";

export type RetrievalMode = 'education' | 'procedure' | 'case_specific' | 'document_review' | 'general'

export type SearchToolInput = {
  query: string
  mode?: RetrievalMode
}

export type SearchToolOutput = {
  query: string
  mode: RetrievalMode
  reviewedCount: number
  sources: string[]
  packet: string
  sourceMode?: 'engine' | 'fallback' | 'none'
}

type SearchCandidate = {
  url: string
  title: string
  fromQuery?: string
}

const SEARCH_SUBQUERY_LIMIT = 2
const SEARCH_ENGINE_RESULT_LIMIT = 10
const SEARCH_ENGINE_TIMEOUT_MS = 8000
const SEARCH_PAGE_REVIEW_LIMIT = 6
const SEARCH_PAGE_FETCH_TIMEOUT_MS = 5000
const SEARCH_PACKET_RESULT_LIMIT = 6

const safeJsonParse = <T,>(value: string): T | null => {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'at', 'by', 'is', 'are', 'was', 'were',
  'what', 'how', 'when', 'where', 'which', 'with', 'about', 'from', 'under', 'over', 'into', 'your', 'their'
])

type InfoNeed = 'definition' | 'procedure' | 'comparison' | 'examples' | 'code'

const detectInfoNeeds = (text: string, mode: RetrievalMode): Set<InfoNeed> => {
  const needs = new Set<InfoNeed>()
  const lower = text.toLowerCase()

  if (/\b(what is|what's|define|definition|meaning)\b/.test(lower)) needs.add('definition')
  if (/\b(how to|how do|how can|steps|process|procedure|implement|apply|file|start)\b/.test(lower)) {
    needs.add('procedure')
  }
  if (/\b(compare|comparison|difference|versus|vs)\b/.test(lower)) needs.add('comparison')
  if (/\b(example|examples|scenario|sample)\b/.test(lower)) needs.add('examples')
  if (/\b(typescript|javascript|node|react|python|java|c#|golang|go|sql)\b/.test(lower)) needs.add('code')

  if (mode === 'education') needs.add('definition')
  if (mode === 'procedure') needs.add('procedure')
  if (mode === 'case_specific') needs.add('examples')
  return needs
}

const splitOnSubIntentJoiners = (segment: string): string[] => {
  const cleaned = normalizeWhitespace(segment)
  const matcher = /\band\b\s+(what|how|why|when|where|whether|can|should|do|does|is|are)\b/i
  const match = matcher.exec(cleaned)
  if (!match || match.index < 14) return [cleaned]
  const left = normalizeWhitespace(cleaned.slice(0, match.index))
  const right = normalizeWhitespace(cleaned.slice(match.index + 4))
  const out = [left, right].filter((value) => value.length >= 8)
  return out.length > 1 ? out : [cleaned]
}

const extractSubIntents = (query: string): string[] => {
  const normalized = normalizeWhitespace(query)
  if (!normalized) return []

  const coarseParts = normalized
    .split(/\?+|;|\s+\bthen\b\s+|\s+\balso\b\s+/i)
    .map((part) => normalizeWhitespace(part))
    .filter((part) => part.length >= 8)

  const fineParts = coarseParts.flatMap((part) => splitOnSubIntentJoiners(part))
  return Array.from(new Set(fineParts)).slice(0, SEARCH_SUBQUERY_LIMIT)
}

const buildNeedSuffix = (needs: Set<InfoNeed>): string => {
  const parts: string[] = []
  if (needs.has('definition')) parts.push('definition plain English')
  if (needs.has('procedure')) parts.push('step by step')
  if (needs.has('comparison')) parts.push('comparison')
  if (needs.has('examples')) parts.push('practical examples')
  if (needs.has('code')) parts.push('implementation example')
  return normalizeWhitespace(parts.join(' '))
}

const buildSearchSubqueries = (query: string, mode: RetrievalMode): string[] => {
  const base = normalizeWhitespace(query).slice(0, 260)
  if (!base) return []

  const terms = tokenize(base).slice(0, 10)
  const compactTerms = terms.join(' ')
  const subIntents = extractSubIntents(base)
  const baseNeeds = detectInfoNeeds(base, mode)
  const baseSuffix = buildNeedSuffix(baseNeeds)

  const candidates = [base]
  if (baseSuffix) {
    candidates.push(`${base} ${baseSuffix}`)
  }

  for (const subIntent of subIntents) {
    if (subIntent.toLowerCase() === base.toLowerCase()) continue
    const subNeeds = detectInfoNeeds(subIntent, mode)
    const suffix = buildNeedSuffix(subNeeds)
    candidates.push(suffix ? `${subIntent} ${suffix}` : subIntent)
  }

  if (compactTerms) {
    candidates.push(baseSuffix ? `${compactTerms} ${baseSuffix}` : compactTerms)
  }

  const unique = Array.from(
    new Set(
      candidates
        .map((item) => normalizeWhitespace(item).slice(0, 260))
        .filter((item) => item.length > 0)
    )
  )

  // Keep search fan-out small to control latency and provider limits.
  return unique.slice(0, SEARCH_SUBQUERY_LIMIT)
}

const BASE_CURATED_SOURCES: SearchCandidate[] = [
  { url: 'https://www.legislation.gov.uk/', title: 'UK Legislation' },
  { url: 'https://www.justice.gov.uk/courts/procedure-rules/civil', title: 'Civil Procedure Rules' },
  { url: 'https://www.gov.uk/browse/justice', title: 'GOV.UK Justice and Law' },
  { url: 'https://www.citizensadvice.org.uk/', title: 'Citizens Advice' },
]

const TOPIC_CURATED_SOURCES: Array<{ pattern: RegExp; sources: SearchCandidate[] }> = [
  {
    pattern: /\b(car|vehicle|driver|road|traffic|accident|collision|mib|motor insurers|hit\s*-?\s*and\s*-?\s*run|registration|plate)\b/i,
    sources: [
      { url: 'https://www.legislation.gov.uk/ukpga/1988/52/section/170', title: 'Road Traffic Act 1988 section 170' },
      { url: 'https://www.mib.org.uk/', title: 'Motor Insurers Bureau' },
      { url: 'https://www.gov.uk/vehicle-insurance/uninsured-drivers', title: 'GOV.UK uninsured drivers guidance' },
    ],
  },
  {
    pattern: /\b(small\s+claim|money\s+claim|county\s+court|mcOL|court\s+fee)\b/i,
    sources: [
      { url: 'https://www.gov.uk/make-court-claim-for-money', title: 'Make a court claim for money' },
      { url: 'https://www.justice.gov.uk/courts/procedure-rules/civil/rules/part07', title: 'CPR Part 7' },
    ],
  },
  {
    pattern: /\b(employment|dismissal|redundancy|tribunal|acas)\b/i,
    sources: [
      { url: 'https://www.acas.org.uk/', title: 'ACAS' },
      { url: 'https://www.gov.uk/employment-tribunals', title: 'Employment tribunals' },
    ],
  },
]

const stripHtml = (html: string) => {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const text = withoutScripts
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return normalizeWhitespace(text)
}

const extractTitle = (html: string): string | undefined => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = match?.[1] ? stripHtml(match[1]) : ''
  return title ? title.slice(0, 140) : undefined
}

const getHost = (url: string): string => {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return ''
  }
}

const getDomainQuality = (url: string): number => {
  const host = getHost(url)
  if (!host) return 0
  // Keep domain quality neutral so no source family is favored by host alone.
  return 5
}

const tokenize = (value: string): string[] =>
  normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))

const computeRelevanceScore = (query: string, title: string, excerpt: string): number => {
  const terms = Array.from(new Set(tokenize(query))).slice(0, 16)
  if (terms.length === 0) return 0

  const titleLower = (title || '').toLowerCase()
  const excerptLower = (excerpt || '').toLowerCase()
  let hits = 0
  for (const term of terms) {
    if (titleLower.includes(term)) hits += 2
    else if (excerptLower.includes(term)) hits += 1
  }
  const raw = hits / (terms.length * 2)
  return Math.max(0, Math.min(10, Number((raw * 10).toFixed(2))))
}

const extractLatestYear = (...values: string[]): number | null => {
  const currentYear = new Date().getFullYear()
  let latest: number | null = null

  for (const value of values) {
    const matches = value.match(/\b(19|20)\d{2}\b/g) || []
    for (const match of matches) {
      const year = Number(match)
      if (year >= 1990 && year <= currentYear + 1) {
        if (latest === null || year > latest) latest = year
      }
    }
  }

  return latest
}

const computeRecencyScore = (title: string, url: string, excerpt: string): number => {
  const latestYear = extractLatestYear(title || '', url || '', excerpt || '')
  if (!latestYear) return 4.5

  const age = new Date().getFullYear() - latestYear
  if (age <= 1) return 10
  if (age <= 3) return 8.5
  if (age <= 5) return 7
  if (age <= 10) return 5.5
  return 3.5
}

const fetchWithTimeout = async (url: string, timeoutMs: number, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      ...(init || {}),
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}

const fetchText = async (url: string): Promise<{ title?: string; text: string } | null> => {
  try {
    const response = await fetchWithTimeout(url, SEARCH_PAGE_FETCH_TIMEOUT_MS)
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') || ''
    const raw = await response.text()
    if (contentType.includes('text/html')) {
      return { title: extractTitle(raw), text: stripHtml(raw) }
    }
    return { title: undefined, text: normalizeWhitespace(raw) }
  } catch {
    return null
  }
}

const buildExcerpt = (text: string, query: string, maxChars: number) => {
  const cleaned = normalizeWhitespace(text)
  if (!cleaned) return ''
  const lower = cleaned.toLowerCase()
  const q = query.trim().toLowerCase()
  const idx = q ? lower.indexOf(q.split(/\s+/)[0] || q) : -1
  if (idx < 0) return cleaned.slice(0, maxChars)
  const half = Math.floor(maxChars / 2)
  const start = Math.max(0, idx - half)
  const end = Math.min(cleaned.length, start + maxChars)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < cleaned.length ? '…' : ''
  return `${prefix}${cleaned.slice(start, end)}${suffix}`
}

const getCuratedFallbackSources = (query: string, mode: RetrievalMode): SearchCandidate[] => {
  const picked: SearchCandidate[] = []

  for (const topic of TOPIC_CURATED_SOURCES) {
    if (topic.pattern.test(query)) {
      picked.push(...topic.sources)
    }
  }

  if (mode === 'procedure') {
    picked.push({ url: 'https://www.justice.gov.uk/courts/procedure-rules/civil', title: 'Civil Procedure Rules' })
  }

  picked.push(...BASE_CURATED_SOURCES)

  const seen = new Set<string>()
  return picked.filter((entry) => {
    if (!entry.url || seen.has(entry.url)) return false
    seen.add(entry.url)
    return true
  }).slice(0, 10)
}

const searchViaBraveApi = async (query: string): Promise<SearchCandidate[]> => {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY
  if (!apiKey) return []

  try {
    const encoded = encodeURIComponent(query)
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encoded}&count=${SEARCH_ENGINE_RESULT_LIMIT}&country=GB&search_lang=en`
    const response = await fetchWithTimeout(url, SEARCH_ENGINE_TIMEOUT_MS, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en-GB,en;q=0.9',
        'X-Subscription-Token': apiKey
      }
    })
    if (!response.ok) return []

    const data = await response.json() as any
    const rawResults = Array.isArray(data?.web?.results) ? data.web.results : []
    const results: SearchCandidate[] = []
    const seen = new Set<string>()

    for (const entry of rawResults) {
      const href = typeof entry?.url === 'string'
        ? entry.url.trim()
        : typeof entry?.profile?.url === 'string'
          ? entry.profile.url.trim()
          : ''
      const title = typeof entry?.title === 'string'
        ? stripHtml(entry.title)
        : typeof entry?.meta_title === 'string'
          ? stripHtml(entry.meta_title)
          : ''
      if (!href || (!href.startsWith('http://') && !href.startsWith('https://'))) continue
      if (seen.has(href)) continue
      seen.add(href)
      results.push({
        url: href,
        title: title || getHost(href)
      })
      if (results.length >= SEARCH_ENGINE_RESULT_LIMIT) break
    }

    return results
  } catch {
    return []
  }
}

// Fallback: Brave search HTML
const searchViaBraveHtml = async (query: string): Promise<SearchCandidate[]> => {
  try {
    const encoded = encodeURIComponent(query)
    const url = `https://search.brave.com/search?q=${encoded}&source=web&country=GB&lang=en_gb`
    const response = await fetchWithTimeout(url, SEARCH_ENGINE_TIMEOUT_MS, {
      headers: {
        'Accept-Language': 'en-GB,en;q=0.9'
      }
    })
    if (!response.ok) return []

    const html = await response.text()
    const linkPattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    const blockedHosts = new Set([
      'search.brave.com',
      'cdn.search.brave.com',
      'imgs.search.brave.com',
      'tiles.search.brave.com'
    ])
    const blockedExtensions = ['.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.webmanifest']

    const results: SearchCandidate[] = []
    const seen = new Set<string>()
    let match: RegExpExecArray | null

    while ((match = linkPattern.exec(html)) !== null && results.length < SEARCH_ENGINE_RESULT_LIMIT) {
      const href = (match[1] || '').replace(/&amp;/g, '&').trim()
      const rawTitle = stripHtml(match[2] || '')
      if (!href.startsWith('http://') && !href.startsWith('https://')) continue
      if (seen.has(href)) continue

      let host = ''
      let pathname = ''
      try {
        const parsed = new URL(href)
        host = parsed.host.toLowerCase()
        pathname = parsed.pathname.toLowerCase()
      } catch {
        continue
      }

      if (blockedHosts.has(host)) continue
      if (blockedExtensions.some((ext) => pathname.endsWith(ext))) continue

      seen.add(href)
      results.push({
        url: href,
        title: rawTitle || host
      })
    }

    return results
  } catch {
    return []
  }
}

// Universal search - tries Brave API first, then Brave HTML.
const universalSearch = async (query: string): Promise<SearchCandidate[]> => {
  let results = await searchViaBraveApi(query)
  if (results.length === 0) {
    results = await searchViaBraveHtml(query)
  }
  return results
}

export class SearchTool extends Tool {
  name = "legal_search";
  description = "Searches the internet for legal guidance, case law, and legal information from suitable sources.";

  async _call(input: string): Promise<string> {
    try {
      console.log("🔍 Searching the internet for legal information...");

      const parsed = safeJsonParse<SearchToolInput>(input)
      const query = (parsed?.query || input || '').trim()
      const mode: RetrievalMode = parsed?.mode || 'general'

      const subQueries = buildSearchSubqueries(query, mode)
      const searchRuns = await Promise.all(
        subQueries.map(async (subQuery) => {
          const results = await universalSearch(subQuery)
          return {
            subQuery,
            results: results.map((result) => ({ ...result, fromQuery: subQuery })),
          }
        })
      )

      const mergedByUrl = new Map<string, SearchCandidate>()
      for (const run of searchRuns) {
        for (const result of run.results) {
          if (!result.url) continue
          const existing = mergedByUrl.get(result.url)
          if (!existing) {
            mergedByUrl.set(result.url, result)
            continue
          }
          // Prefer entries with stronger titles or direct base-query match.
          const existingTitleLen = (existing.title || '').length
          const candidateTitleLen = (result.title || '').length
          const resultIsBase = result.fromQuery === subQueries[0]
          const existingIsBase = existing.fromQuery === subQueries[0]
          if ((resultIsBase && !existingIsBase) || candidateTitleLen > existingTitleLen) {
            mergedByUrl.set(result.url, result)
          }
        }
      }

      const mergedSearchResults = Array.from(mergedByUrl.values())
      const usedEngineResults = mergedSearchResults.length > 0
      const searchPool: SearchCandidate[] =
        usedEngineResults
          ? mergedSearchResults
          : getCuratedFallbackSources(query, mode).map((entry) => ({ ...entry, fromQuery: 'curated' }))

      if (searchPool.length === 0) {
        return JSON.stringify({
          query,
          mode,
          reviewedCount: 0,
          sources: [],
          packet: 'No search results found. Please try a different query.',
          sourceMode: 'none'
        } as SearchToolOutput)
      }

      // Fetch and process results using a neutral ranking blend.
      const fetched = await Promise.all(
        searchPool.slice(0, SEARCH_PAGE_REVIEW_LIMIT).map(async (result) => {
          const text = await fetchText(result.url)
          const excerpt = text
            ? (buildExcerpt(text.text, query, 900) || 'Content extracted but excerpt was minimal.')
            : 'Unable to fetch full page text at the moment; source retained for citation mapping.'
          const quality = getDomainQuality(result.url)
          const title = result.title || text?.title || ''
          const relevance = computeRelevanceScore(
            `${query} ${result.fromQuery || ''}`,
            title,
            excerpt
          )
          const recency = computeRecencyScore(title, result.url, excerpt)
          const score = Number((relevance * 0.5 + recency * 0.2 + quality * 0.3).toFixed(2))
          return {
            url: result.url,
            title,
            fromQuery: result.fromQuery,
            quality,
            relevance,
            recency,
            score,
            excerpt,
          }
        })
      )

      const reviewed = fetched.filter((value): value is NonNullable<typeof value> => Boolean(value))

      // Keep all pages successfully read as citation candidates.
      const citationSources = Array.from(new Set(
        reviewed.map((entry) => entry.url).filter((url) => typeof url === 'string' && url.length > 0)
      ))

      // Filter and sort by blended ranking score (relevance + recency + neutral domain factor)
      let rankedForPacket = reviewed
        .filter((value): value is NonNullable<typeof value> => Boolean(value))
        .sort((a, b) => b.score - a.score)
        .slice(0, SEARCH_PACKET_RESULT_LIMIT)

      // Fallback: if content extraction was too sparse, still provide ranked URLs
      // so citation-capable tiers can attach source links.
      if (rankedForPacket.length === 0) {
        const fallback = searchPool
          .slice(0, SEARCH_PACKET_RESULT_LIMIT)
          .map((result) => {
            const quality = getDomainQuality(result.url)
            const relevance = computeRelevanceScore(
              `${query} ${result.fromQuery || ''}`,
              result.title || '',
              ''
            )
            const recency = computeRecencyScore(result.title || '', result.url, '')
            const score = Number((relevance * 0.5 + recency * 0.2 + quality * 0.3).toFixed(2))
            return {
              url: result.url,
              title: result.title || '',
              fromQuery: result.fromQuery,
              quality,
              relevance,
              recency,
              score,
              excerpt: 'Search result summary not available; source retained for citation mapping.'
            }
          })
          .sort((a, b) => b.score - a.score)
        rankedForPacket = fallback
      }

      const packet = `${usedEngineResults ? 'Source mode: engine results.' : 'Source mode: fallback context only (no citation sources).'}\n` +
        `Executed searches: ${subQueries.join(' | ')}\n` +
        `Reviewed ${Math.max(reviewed.length, rankedForPacket.length)} sources from across the internet.\n\n` +
        rankedForPacket.map((s, idx) => {
          const titleLine = s.title ? `Title: ${s.title}\n` : ''
          const queryLine = s.fromQuery ? `Matched query: ${s.fromQuery}\n` : ''
          return `SOURCE ${idx + 1} (Score: ${s.score}/10 | Relevance: ${s.relevance}/10 | Recency: ${s.recency}/10 | Domain quality: ${s.quality}/10):\n${queryLine}${titleLine}URL: ${s.url}\nEXTRACT: ${s.excerpt}`
        }).join('\n\n')

      const output: SearchToolOutput = {
        query,
        mode,
        reviewedCount: Math.max(reviewed.length, rankedForPacket.length),
        sources: usedEngineResults
          ? (
              citationSources.length > 0
                ? citationSources
                : rankedForPacket.map((s) => s.url)
            )
          : [],
        packet: packet.slice(0, 7000),
        sourceMode: usedEngineResults ? 'engine' : 'fallback'
      }

      return JSON.stringify(output)
    } catch (error: any) {
      if (error.message?.includes('rate limit') || error.status === 429) {
        return JSON.stringify({
          query: '',
          mode: 'general',
          reviewedCount: 0,
          sources: [],
          packet: "Rate limit exceeded. Please wait a moment and try again.",
          sourceMode: 'none'
        } as SearchToolOutput)
      }
      console.error('Search tool error:', error);
      throw error;
    }
  }
}
