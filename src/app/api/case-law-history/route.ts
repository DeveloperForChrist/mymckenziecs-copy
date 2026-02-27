import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';

interface SearchHistoryItem {
  query: string;
  searchedAt: string;
  resultsCount: number;
}

interface ViewedCaseHistoryItem {
  id: string;
  citation: string;
  title: string;
  court?: string;
  year?: number;
  viewedAt: string;
  case_type?: string;
  summary?: string;
  similarity: number;
  outcome?: string;
  url?: string;
  extracts?: string[];
}

const SEARCH_HISTORY_LIMIT = 10;
const VIEWED_HISTORY_LIMIT = 12;

const isMissingHistoryTableError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === 'PGRST205') return true;
  if (candidate.code === '42P01') return true;
  return typeof candidate.message === 'string' && candidate.message.includes('public.user_case_law_history');
};

const toIsoOrNow = (value: unknown): string => {
  if (typeof value !== 'string') return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const sanitizeSearchHistory = (value: unknown): SearchHistoryItem[] | null => {
  if (!Array.isArray(value)) return null;
  const items = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;
      if (typeof raw.query !== 'string') return null;
      const query = raw.query.trim();
      if (!query) return null;
      return {
        query: query.slice(0, 300),
        searchedAt: toIsoOrNow(raw.searchedAt),
        resultsCount: Number.isFinite(raw.resultsCount) ? Math.max(0, Math.floor(Number(raw.resultsCount))) : 0,
      };
    })
    .filter((item): item is SearchHistoryItem => Boolean(item))
    .sort((a, b) => new Date(b.searchedAt).getTime() - new Date(a.searchedAt).getTime());

  const deduped: SearchHistoryItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= SEARCH_HISTORY_LIMIT) break;
  }
  return deduped;
};

const sanitizeViewedHistory = (value: unknown): ViewedCaseHistoryItem[] | null => {
  if (!Array.isArray(value)) return null;
  const items: ViewedCaseHistoryItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.id !== 'string' || typeof raw.citation !== 'string' || typeof raw.title !== 'string') continue;
    const id = raw.id.trim();
    const citation = raw.citation.trim();
    const title = raw.title.trim();
    if (!id || !citation || !title) continue;

    const normalizedItem: ViewedCaseHistoryItem = {
      id: id.slice(0, 120),
      citation: citation.slice(0, 200),
      title: title.slice(0, 500),
      viewedAt: toIsoOrNow(raw.viewedAt),
      similarity: Number.isFinite(raw.similarity) ? Math.max(0, Math.min(1, Number(raw.similarity))) : 0,
    };

    if (typeof raw.court === 'string') normalizedItem.court = raw.court.slice(0, 200);
    if (Number.isFinite(raw.year)) normalizedItem.year = Math.floor(Number(raw.year));
    if (typeof raw.case_type === 'string') normalizedItem.case_type = raw.case_type.slice(0, 120);
    if (typeof raw.summary === 'string') normalizedItem.summary = raw.summary.slice(0, 4000);
    if (typeof raw.outcome === 'string') normalizedItem.outcome = raw.outcome.slice(0, 120);
    if (typeof raw.url === 'string') normalizedItem.url = raw.url.slice(0, 2048);
    if (Array.isArray(raw.extracts)) {
      normalizedItem.extracts = raw.extracts
        .filter((extract): extract is string => typeof extract === 'string')
        .slice(0, 8)
        .map((extract) => extract.slice(0, 1200));
    }

    items.push(normalizedItem);
  }

  items.sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());

  const deduped: ViewedCaseHistoryItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
    if (deduped.length >= VIEWED_HISTORY_LIMIT) break;
  }
  return deduped;
};

const ensureUserRow = async (userId: string, email: string | null | undefined) => {
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (existingUser?.id) return;

  await supabaseAdmin
    .from('users')
    .upsert(
      {
        id: userId,
        email: email || `${userId}@placeholder.local`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
};

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = authData.user.id;
    const { data, error } = await supabaseAdmin
      .from('user_case_law_history')
      .select('search_history, viewed_history, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isMissingHistoryTableError(error)) {
        return NextResponse.json({
          searchHistory: [],
          viewedHistory: [],
          updatedAt: null,
          localOnly: true,
        });
      }
      console.error('Failed to load case law history', error);
      return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
    }

    return NextResponse.json({
      searchHistory: sanitizeSearchHistory(data?.search_history) ?? [],
      viewedHistory: sanitizeViewedHistory(data?.viewed_history) ?? [],
      updatedAt: typeof data?.updated_at === 'string' ? data.updated_at : null,
    });
  } catch (error) {
    console.error('Case law history GET error', error);
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const searchHistory = sanitizeSearchHistory(body?.searchHistory);
    const viewedHistory = sanitizeViewedHistory(body?.viewedHistory);
    if (!searchHistory || !viewedHistory) {
      return NextResponse.json({ error: 'Invalid history payload' }, { status: 400 });
    }

    const userId = authData.user.id;
    await ensureUserRow(userId, authData.user.email);

    const { error: upsertError } = await supabaseAdmin
      .from('user_case_law_history')
      .upsert(
        {
          user_id: userId,
          search_history: searchHistory,
          viewed_history: viewedHistory,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      if (isMissingHistoryTableError(upsertError)) {
        return NextResponse.json({
          ok: true,
          localOnly: true,
          searchHistory,
          viewedHistory,
        });
      }
      console.error('Failed to save case law history', upsertError);
      return NextResponse.json({ error: 'Failed to save history' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      searchHistory,
      viewedHistory,
    });
  } catch (error) {
    console.error('Case law history PUT error', error);
    return NextResponse.json({ error: 'Failed to save history' }, { status: 500 });
  }
}
