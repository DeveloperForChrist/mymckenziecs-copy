import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_WINDOW_DAYS = 30;
const DEFAULT_WINDOW_DAYS = 7;

function parseWindowDays(raw: string | null) {
  if (!raw) return DEFAULT_WINDOW_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_WINDOW_DAYS;
  return Math.min(parsed, MAX_WINDOW_DAYS);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = authData.user.id;
    const { searchParams } = new URL(request.url);
    const windowDays = parseWindowDays(searchParams.get('windowDays'));

    const start = startOfDay(new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + windowDays);

    const { count, error } = await supabaseAdmin
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('completed', false)
      .gte('date', start.toISOString())
      .lte('date', end.toISOString());

    if (error) {
      console.error('Calendar alert count error:', error);
      return NextResponse.json({ error: 'Failed to count calendar alerts' }, { status: 500 });
    }

    return NextResponse.json(
      {
        count: Number(count || 0),
        windowDays,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Calendar alert count GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
