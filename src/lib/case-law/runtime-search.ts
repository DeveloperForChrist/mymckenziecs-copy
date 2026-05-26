import { supabaseAdmin } from '@/lib/database/supabase-server';
import { searchByText } from '@/lib/vector/milvus';
import type { UserLegalContext } from '@/lib/legal/jurisdictions';
import { isUnitedStatesContext } from '@/lib/legal/jurisdictions';
import {
  enrichResultsWithSupabase,
  enrichResultsWithUrlSummaries,
  removeDuplicates,
  searchFindCaseLawAPI,
  searchFindCaseLawAtom,
} from '@/lib/case-law/search-helpers';

export type RuntimeCaseLawResult = {
  id?: string
  citation?: string
  title?: string
  url?: string
  summary?: string
  extracts?: string[] | string
  case_type?: string
  year?: number | null
  court?: string | null
  court_id?: string | null
  jurisdiction?: string | null
  outcome?: string | null
  similarity_score?: number
  source?: string
}

export type RuntimeCaseLawSearchOutcome = {
  results: RuntimeCaseLawResult[]
  method: 'vector_search' | 'supabase_keyword_fallback' | 'web_fallback' | 'fallback_empty'
  warning: string | null
  vectorFailure: string | null
}

const tokenizeQuery = (query: string): string[] =>
  Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
    )
  ).slice(0, 12)

const toText = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

const computeFallbackSimilarity = (
  query: string,
  title: string,
  citation: string,
  summary: string,
  extracts: string[]
): number => {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return 0

  const tokens = tokenizeQuery(normalizedQuery)
  const combined = `${title} ${citation} ${summary} ${extracts.join(' ')}`.toLowerCase()
  if (!combined.trim()) return 0

  let score = 0
  if (combined.includes(normalizedQuery)) score += 8
  if (title.toLowerCase().includes(normalizedQuery)) score += 3
  if (citation.toLowerCase().includes(normalizedQuery)) score += 3

  for (const token of tokens) {
    if (combined.includes(token)) score += 1
  }

  if (score <= 0) return 0
  return Math.min(0.995, Number((score / (tokens.length + 10)).toFixed(4)))
}

const searchSupabaseKeywordFallback = async (query: string, limit: number): Promise<RuntimeCaseLawResult[]> => {
  try {
    const sampleSize = Math.min(800, Math.max(limit * 25, 250))
    const { data, error } = await supabaseAdmin
      .from('case_law')
      .select('id,citation,title,url,summary,extracts,case_type,year,court,outcome,updated_at')
      .order('updated_at', { ascending: false })
      .limit(sampleSize)

    if (error) {
      console.warn('Supabase keyword fallback query failed:', error)
      return []
    }

    return (data || [])
      .map((row: any) => {
        const title = toText(row?.title)
        const citation = toText(row?.citation)
        const summary = toText(row?.summary)
        const extracts = Array.isArray(row?.extracts)
          ? row.extracts.map((item: unknown) => toText(item)).filter(Boolean)
          : toText(row?.extracts)
            ? [toText(row?.extracts)]
            : []
        const similarity = computeFallbackSimilarity(query, title, citation, summary, extracts)

        return {
          id: row?.id,
          citation,
          title,
          url: toText(row?.url),
          summary,
          extracts,
          case_type: row?.case_type || 'general',
          year: row?.year || null,
          court: row?.court || null,
          outcome: row?.outcome || null,
          similarity_score: similarity,
          source: 'supabase_keyword_fallback',
        } satisfies RuntimeCaseLawResult
      })
      .filter((row) => (row.similarity_score || 0) > 0)
      .sort((a, b) => {
        const scoreDelta = (b.similarity_score || 0) - (a.similarity_score || 0)
        if (scoreDelta !== 0) return scoreDelta
        return Number(b.year || 0) - Number(a.year || 0)
      })
      .slice(0, Math.max(limit * 3, 25))
  } catch (error) {
    console.warn('Supabase keyword fallback failed:', error)
    return []
  }
}

const searchWebFallback = async (query: string, limit: number): Promise<RuntimeCaseLawResult[]> => {
  const requests = await Promise.allSettled([
    searchFindCaseLawAPI(query, Math.max(limit * 2, 12)),
    searchFindCaseLawAtom(query, Math.max(limit, 8)),
  ])

  const merged: RuntimeCaseLawResult[] = []
  for (const request of requests) {
    if (request.status === 'fulfilled' && Array.isArray(request.value)) {
      merged.push(...request.value)
    }
  }

  if (merged.length === 0) return []

  const deduped = removeDuplicates(
    merged.map((result) => ({
      ...result,
      source: result?.source || 'web_fallback',
    }))
  ) as RuntimeCaseLawResult[]

  return deduped
    .sort((a, b) => Number(b?.similarity_score || 0) - Number(a?.similarity_score || 0))
    .slice(0, Math.max(limit * 3, 25))
}

export async function searchCaseLawWithFallback(
  query: string,
  limit: number,
  options?: {
    urlEnrich?: boolean
    legalContext?: UserLegalContext | null
  }
): Promise<RuntimeCaseLawSearchOutcome> {
  let results: RuntimeCaseLawResult[] = []
  let method: RuntimeCaseLawSearchOutcome['method'] = 'vector_search'
  let warning: string | null = null
  let vectorFailure: string | null = null

  try {
    if (!process.env.MILVUS_HOST) {
      throw new Error('MILVUS_HOST missing')
    }

    const vectorResults = await searchByText(query, Math.max(5, limit), {
      legalContext: options?.legalContext,
    })
    results = (vectorResults || []).map((result: any) => ({
      id: result.id,
      citation: result.citation,
      title: result.title,
      url: result.url,
      summary: result.summary,
      extracts: result.extracts,
      court: result.court,
      court_id: result.court_id,
      jurisdiction: result.jurisdiction,
      similarity_score: result.score,
      source: result.source_provider || 'vector',
    }))
  } catch (error) {
    console.error('Vector search error:', error)
    vectorFailure = String(error)
  }

  if (vectorFailure) {
    warning = 'Vector backend unavailable. Served fallback results.'

    if (isUnitedStatesContext(options?.legalContext)) {
      return {
        results: [],
        method: 'fallback_empty',
        warning: 'U.S. case-law vector backend unavailable. No U.S. fallback database was used.',
        vectorFailure,
      }
    }

    const supabaseFallbackResults = await searchSupabaseKeywordFallback(query, limit)
    if (supabaseFallbackResults.length > 0) {
      results = supabaseFallbackResults
      method = 'supabase_keyword_fallback'
    } else {
      const webFallbackResults = await searchWebFallback(query, limit)
      results = webFallbackResults
      method = webFallbackResults.length > 0 ? 'web_fallback' : 'fallback_empty'
    }
  }

  if (results.length > 0 && method !== 'supabase_keyword_fallback') {
    try {
      await enrichResultsWithSupabase(results)
    } catch (error) {
      console.warn('Supabase enrichment failed:', error)
    }
  }

  if (options?.urlEnrich && results.length > 0) {
    try {
      await enrichResultsWithUrlSummaries(results)
    } catch (error) {
      console.warn('URL summarization enrichment failed:', error)
    }
  }

  return {
    results,
    method,
    warning,
    vectorFailure,
  }
}
