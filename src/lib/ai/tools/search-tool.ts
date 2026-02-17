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
}

// Domain quality scoring for relevance ranking
const QUALITY_DOMAINS: Record<string, number> = {
  // Legal/Official sources
  'legislation.gov.uk': 10,
  'bailii.org': 10,
  'caselaw.nationalarchives.gov.uk': 10,
  'justice.gov.uk': 10,
  'judiciary.uk': 10,
  'supremecourt.uk': 10,
  'parliament.uk': 9,
  'gov.uk': 8,
  'citizensadvice.org.uk': 8,
  'advicenow.org.uk': 8,
  'lawworks.org.uk': 8,
  // Reputable legal/news sources
  'bbc.com': 7,
  'bbc.co.uk': 7,
  'theguardian.com': 7,
  'reuters.com': 7,
  // Legal education/commentary
  'lawsociety.org.uk': 8,
  'barcouncil.org.uk': 8,
  'wikipedia.org': 6,
  'medium.com': 5,
  'linkedin.com': 5
}

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
  // Exact match first
  if (QUALITY_DOMAINS[host]) return QUALITY_DOMAINS[host]
  // Check base domain (e.g., gov.uk in www.gov.uk)
  for (const [domain, score] of Object.entries(QUALITY_DOMAINS)) {
    if (host.includes(domain)) return score
  }
  // Default for other sources
  return 3
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

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const fetchText = async (url: string): Promise<{ title?: string; text: string } | null> => {
  try {
    const response = await fetchWithTimeout(url, 12000)
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

// Google Custom Search API
const searchViaGoogle = async (query: string): Promise<Array<{ url: string; title: string }>> => {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID
  
  if (!apiKey || !engineId) {
    return []
  }
  
  try {
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${engineId}&num=10`
    const response = await fetchWithTimeout(url, 15000)
    if (!response.ok) return []
    
    const data = await response.json() as any
    return (data.items || []).map((item: any) => ({
      url: item.link,
      title: item.title
    }))
  } catch {
    return []
  }
}

// Fallback: DuckDuckGo search
const searchViaDuckDuckGo = async (query: string): Promise<Array<{ url: string; title: string }>> => {
  try {
    const encoded = encodeURIComponent(query)
    const url = `https://html.duckduckgo.com/?q=${encoded}&t=mymckenzie`
    const response = await fetchWithTimeout(url, 15000)
    if (!response.ok) return []
    
    const html = await response.text()
    const results: Array<{ url: string; title: string }> = []
    
    // Simple HTML parsing to extract result links
    const linkPattern = /<a\s+class="[^"]*result__a[^"]*"\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi
    let match
    while ((match = linkPattern.exec(html)) !== null && results.length < 10) {
      const href = match[1]
      const title = match[2]
      if (href && title && (href.startsWith('http://') || href.startsWith('https://'))) {
        results.push({ url: href, title: stripHtml(title) })
      }
    }
    
    return results
  } catch {
    return []
  }
}

// Universal search - tries Google first, falls back to DuckDuckGo
const universalSearch = async (query: string): Promise<Array<{ url: string; title: string }>> => {
  let results = await searchViaGoogle(query)
  if (results.length === 0) {
    results = await searchViaDuckDuckGo(query)
  }
  return results
}

export class SearchTool extends Tool {
  name = "legal_search";
  description = "Searches the internet for legal guidance, case law, and legal information from suitable sources. Prefers authoritative legal sources but searches across the entire internet.";

  async _call(input: string): Promise<string> {
    try {
      console.log("🔍 Searching the internet for legal information...");

      const parsed = safeJsonParse<SearchToolInput>(input)
      const query = (parsed?.query || input || '').trim()
      const mode: RetrievalMode = parsed?.mode || 'general'

      // Perform universal internet search
      const searchResults = await universalSearch(query)

      if (searchResults.length === 0) {
        return JSON.stringify({
          query,
          mode,
          reviewedCount: 0,
          sources: [],
          packet: 'No search results found. Please try a different query.'
        } as SearchToolOutput)
      }

      // Fetch and process results, prioritizing by domain quality
      const fetched = await Promise.all(
        searchResults.slice(0, 10).map(async (result) => {
          const text = await fetchText(result.url)
          if (!text) return null
          const excerpt = buildExcerpt(text.text, query, 900)
          if (!excerpt || excerpt.length < 120) return null
          const quality = getDomainQuality(result.url)
          const title = result.title || text.title || ''
          const relevance = computeRelevanceScore(query, title, excerpt)
          const recency = computeRecencyScore(title, result.url, excerpt)
          const score = Number((relevance * 0.5 + recency * 0.2 + quality * 0.3).toFixed(2))
          return {
            url: result.url,
            title,
            quality,
            relevance,
            recency,
            score,
            excerpt,
          }
        })
      )

      // Filter and sort by blended ranking score (relevance + recency + domain quality)
      const sources = fetched
        .filter((value): value is NonNullable<typeof value> => Boolean(value))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)

      const packet = `Reviewed ${sources.length} sources from across the internet.\n\n` +
        sources.map((s, idx) => {
          const titleLine = s.title ? `Title: ${s.title}\n` : ''
          return `SOURCE ${idx + 1} (Score: ${s.score}/10 | Relevance: ${s.relevance}/10 | Recency: ${s.recency}/10 | Domain quality: ${s.quality}/10):\n${titleLine}URL: ${s.url}\nEXTRACT: ${s.excerpt}`
        }).join('\n\n')

      const output: SearchToolOutput = {
        query,
        mode,
        reviewedCount: sources.length,
        sources: sources.map((s) => s.url),
        packet: packet.slice(0, 7000)
      }

      return JSON.stringify(output)
    } catch (error: any) {
      if (error.message?.includes('rate limit') || error.status === 429) {
        return JSON.stringify({
          query: '',
          mode: 'general',
          reviewedCount: 0,
          sources: [],
          packet: "Rate limit exceeded. Please wait a moment and try again."
        } as SearchToolOutput)
      }
      console.error('Search tool error:', error);
      throw error;
    }
  }
}
