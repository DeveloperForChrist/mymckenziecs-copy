import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimiter, rateLimit, getIdentifier } from '@/lib/utils/rate-limit';
import { caseLawSearchSchema } from '@/validators/index';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { z } from 'zod';
import {
  applyFilters,
} from '@/lib/case-law/search-helpers';
import { searchCaseLawWithFallback } from '@/lib/case-law/runtime-search';
import { captureServerException } from '@/lib/monitoring/error-logger';
import { getOrSyncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
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

    const snapshot = await getOrSyncUserEntitlementSnapshot(userId);
    if (!hasCaseLawAccess(snapshot?.plan_type || '')) {
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

    const runtimeSearch = await searchCaseLawWithFallback(query, Math.max(5, limit), {
      urlEnrich: process.env.CASELAW_URL_ENRICH === '1',
    });

    if (runtimeSearch.vectorFailure) {
      await captureServerException(new Error(runtimeSearch.vectorFailure), {
        component: 'case-law-search',
        route: '/api/search-case-law',
        method: 'POST',
      });
    }

    const filteredResults = applyFilters(runtimeSearch.results, filters).slice(0, limit);

    return NextResponse.json({
      results: filteredResults.map((result) => ({
        ...result,
        similarity: typeof result.similarity_score === 'number' ? result.similarity_score : result.similarity
      })),
      total: filteredResults.length,
      query: query,
      method: runtimeSearch.method,
      warning: runtimeSearch.warning,
    });

  } catch (error) {
    console.error('Search error:', error);
    await captureServerException(error, { component: 'case-law-search', route: '/api/search-case-law', method: 'POST' });
    return NextResponse.json({ error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
