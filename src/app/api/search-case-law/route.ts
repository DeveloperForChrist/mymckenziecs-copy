import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimiter, rateLimit, getIdentifier } from '@/lib/utils/rate-limit';
import { caseLawSearchSchema } from '@/validators/index';
import * as Sentry from '@sentry/nextjs';
import { searchByText } from '@/lib/vector/milvus';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { z } from 'zod';
import { applyFilters, enrichResultsWithSupabase, enrichResultsWithUrlSummaries } from '@/lib/case-law/search-helpers';

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

    const planLabel = (activeSub?.plan_type || '').toString().toLowerCase();
    const isPlus = planLabel.includes('plus') || planLabel.includes('pro');
    const isEssential = planLabel.includes('essential') || planLabel.includes('premium');

    if (!isPlus && !isEssential) {
      return NextResponse.json(
        { error: 'Case law search is available on Essential and Plus plans.' },
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

    // Use vector DB search (Milvus) exclusively
    if (!process.env.MILVUS_HOST) {
      return NextResponse.json({ error: 'Vector DB not configured' }, { status: 500 });
    }

    let vectorResults: any[] = [];
    try {
      const v = await searchByText(query, Math.max(5, limit));
      vectorResults = (v || []).map((r: any) => ({
        id: r.id,
        citation: r.citation,
        title: r.title,
        url: r.url,
        summary: r.summary,
        extracts: r.extracts,
        similarity_score: r.score,
        source: 'vector'
      }));
    } catch (err) {
      console.error('Vector search error:', err);
      Sentry.captureException(err);
      return NextResponse.json({ error: 'Vector search failed', details: String(err) }, { status: 500 });
    }

    // Enrich missing metadata from Supabase `case_law` table where possible
    try {
      await enrichResultsWithSupabase(vectorResults);
    } catch (e) {
      console.warn('Supabase enrichment failed:', e);
    }

    // For results with a URL but missing summary, fetch and summarize (cache to Supabase)
    try {
      await enrichResultsWithUrlSummaries(vectorResults);
    } catch (e) {
      console.warn('URL summarization enrichment failed:', e);
    }

    const filteredResults = applyFilters(vectorResults, filters).slice(0, limit);

    return NextResponse.json({
      results: filteredResults.map((result) => ({
        ...result,
        similarity: typeof result.similarity_score === 'number' ? result.similarity_score : result.similarity
      })),
      total: filteredResults.length,
      query: query,
      method: 'vector_search'
    });

  } catch (error) {
    console.error('Search error:', error);
    if (error instanceof Error) {
      Sentry.captureException(error);
    }
    return NextResponse.json({ error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
