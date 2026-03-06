import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimiter, rateLimit, getIdentifier } from '@/lib/utils/rate-limit';
import { caseLawSearchSchema } from '@/validators/index';
import { searchByText } from '@/lib/vector/milvus';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { z } from 'zod';
import {
  applyFilters,
  enrichResultsWithSupabase,
  enrichResultsWithUrlSummaries,
  removeDuplicates,
  searchFindCaseLawAPI,
  searchFindCaseLawAtom,
} from '@/lib/case-law/search-helpers';
import { captureServerException } from '@/lib/monitoring/error-logger';
import { hasCaseLawAccess } from '@/lib/plans/access';

const caseLawRequestSchema = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(100).optional(),
  filters: z
    .object({
      court: z.string().optional(),
      case_type: z.string().optional(),
      outcome: z.string().optional(),
      year_from: z.union([z.string(), z.number()]).optional(),
      year_to: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
}).passthrough();

const tokenizeQuery = (query: string): string[] =>
  Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
    )
  ).slice(0, 12);

const toText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
};

const computeFallbackSimilarity = (query: string, title: string, citation: string, summary: string, extracts: string[]): number => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const tokens = tokenizeQuery(normalizedQuery);
  const combined = `${title} ${citation} ${summary} ${extracts.join(' ')}`.toLowerCase();
  if (!combined.trim()) return 0;

  let score = 0;
  if (combined.includes(normalizedQuery)) score += 8;
  if (title.toLowerCase().includes(normalizedQuery)) score += 3;
  if (citation.toLowerCase().includes(normalizedQuery)) score += 3;

  for (const token of tokens) {
    if (combined.includes(token)) score += 1;
  }

  if (score <= 0) return 0;
  return Math.min(0.995, Number((score / (tokens.length + 10)).toFixed(4)));
};

const searchSupabaseKeywordFallback = async (query: string, limit: number) => {
  try {
    const sampleSize = Math.min(800, Math.max(limit * 25, 250));
    const { data, error } = await supabaseAdmin
      .from('case_law')
      .select('id,citation,title,url,summary,extracts,case_type,year,court,outcome,updated_at')
      .order('updated_at', { ascending: false })
      .limit(sampleSize);

    if (error) {
      console.warn('Supabase keyword fallback query failed:', error);
      return [] as any[];
    }

    const ranked = (data || [])
      .map((row: any) => {
        const title = toText(row?.title);
        const citation = toText(row?.citation);
        const summary = toText(row?.summary);
        const extracts = Array.isArray(row?.extracts)
          ? row.extracts.map((item: unknown) => toText(item)).filter(Boolean)
          : toText(row?.extracts)
            ? [toText(row?.extracts)]
            : [];
        const similarity = computeFallbackSimilarity(query, title, citation, summary, extracts);

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
        };
      })
      .filter((row: any) => row.similarity_score > 0)
      .sort((a: any, b: any) => {
        const scoreDelta = (b.similarity_score || 0) - (a.similarity_score || 0);
        if (scoreDelta !== 0) return scoreDelta;
        return Number(b.year || 0) - Number(a.year || 0);
      })
      .slice(0, Math.max(limit * 3, 25));

    return ranked;
  } catch (error) {
    console.warn('Supabase keyword fallback failed:', error);
    return [] as any[];
  }
};

const searchWebFallback = async (query: string, limit: number) => {
  const requests = await Promise.allSettled([
    searchFindCaseLawAPI(query, Math.max(limit * 2, 12)),
    searchFindCaseLawAtom(query, Math.max(limit, 8)),
  ]);

  const merged: any[] = [];
  for (const request of requests) {
    if (request.status === 'fulfilled' && Array.isArray(request.value)) {
      merged.push(...request.value);
    }
  }

  if (merged.length === 0) return [] as any[];

  const deduped = removeDuplicates(
    merged.map((result: any) => ({
      ...result,
      source: result?.source || 'web_fallback',
    }))
  );

  return deduped
    .sort((a: any, b: any) => (Number(b?.similarity_score || 0) - Number(a?.similarity_score || 0)))
    .slice(0, Math.max(limit * 3, 25));
};

export async function POST(request: NextRequest) {
  try {
    // Get user session for rate limiting
    const supabaseAuth = await createSupabaseRouteClient();
    const { data: authData } = await supabaseAuth.auth.getUser();
    const userId = authData?.user?.id;
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const safeIp = ip || undefined;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: activeSub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_type, status')
      .eq('user_id', userId)
      .in('status', ['active', 'past_due'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!hasCaseLawAccess(activeSub?.plan_type || '')) {
      return NextResponse.json(
        { error: 'Case law search is available on Premium + plans.' },
        { status: 403 }
      );
    }

    // Rate limiting
    const identifier = getIdentifier(userId ?? undefined, safeIp);
    const { success } = await rateLimit(apiRateLimiter, identifier, 10, 60000); // 10 requests per minute

    if (!success) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const parsedBody = caseLawRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsedBody.error.issues }, { status: 400 });
    }

    const { query, limit = 10, filters = {} } = parsedBody.data;

    // Validate input
    const validation = caseLawSearchSchema.safeParse({
      query,
      limit,
      court: filters?.court,
      dateFrom: filters?.year_from ? String(filters.year_from) : undefined,
      dateTo: filters?.year_to ? String(filters.year_to) : undefined,
    });

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.issues }, { status: 400 });
    }

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    let vectorResults: any[] = [];
    let method = 'vector_search';
    let backendWarning: string | null = null;
    let vectorFailure: string | null = null;

    try {
      if (!process.env.MILVUS_HOST) {
        throw new Error('MILVUS_HOST missing');
      }

      const results = await searchByText(query, Math.max(5, limit));
      vectorResults = (results || []).map((result: any) => ({
        id: result.id,
        citation: result.citation,
        title: result.title,
        url: result.url,
        summary: result.summary,
        extracts: result.extracts,
        similarity_score: result.score,
        source: 'vector',
      }));
    } catch (err) {
      console.error('Vector search error:', err);
      await captureServerException(err, { component: 'case-law-search', route: '/api/search-case-law', method: 'POST' });
      vectorFailure = String(err);
    }

    if (vectorFailure) {
      backendWarning = 'Vector backend unavailable. Served fallback results.';

      const supabaseFallbackResults = await searchSupabaseKeywordFallback(query, limit);
      if (supabaseFallbackResults.length > 0) {
        vectorResults = supabaseFallbackResults;
        method = 'supabase_keyword_fallback';
      } else {
        const webFallbackResults = await searchWebFallback(query, limit);
        vectorResults = webFallbackResults;
        method = webFallbackResults.length > 0 ? 'web_fallback' : 'fallback_empty';
      }
    }

    // Enrich missing metadata from Supabase `case_law` table where possible
    if (vectorResults.length > 0 && method !== 'supabase_keyword_fallback') {
      try {
        await enrichResultsWithSupabase(vectorResults);
      } catch (e) {
        console.warn('Supabase enrichment failed:', e);
      }
    }

    // Optional heavy enrichment: fetch external URLs + summarize.
    // Disabled by default for faster search response times.
    if (process.env.CASELAW_URL_ENRICH === '1' && vectorResults.length > 0) {
      try {
        await enrichResultsWithUrlSummaries(vectorResults);
      } catch (e) {
        console.warn('URL summarization enrichment failed:', e);
      }
    }

    const filteredResults = applyFilters(vectorResults, filters).slice(0, limit);

    return NextResponse.json({
      results: filteredResults.map((result) => ({
        ...result,
        similarity: typeof result.similarity_score === 'number' ? result.similarity_score : result.similarity
      })),
      total: filteredResults.length,
      query: query,
      method,
      warning: backendWarning,
    });

  } catch (error) {
    console.error('Search error:', error);
    await captureServerException(error, { component: 'case-law-search', route: '/api/search-case-law', method: 'POST' });
    return NextResponse.json({ error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
