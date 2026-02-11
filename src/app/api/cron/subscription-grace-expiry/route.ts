import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = (request.headers.get('x-cron-secret') || request.headers.get('authorization') || '')
      .replace(/^Bearer\s+/i, '');

    if (cronSecret && headerSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const nowIso = new Date().toISOString();

    const { data: overdue, error } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, grace_period_end')
      .eq('status', 'past_due')
      .lte('grace_period_end', nowIso);

    if (error) {
      console.error('Grace expiry cron: failed to fetch subscriptions', error);
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }

    if (!overdue || overdue.length === 0) {
      return NextResponse.json({ ok: true, expired: 0 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'expired',
        updated_at: nowIso,
      })
      .in('id', overdue.map((row) => row.id));

    if (updateError) {
      console.error('Grace expiry cron: failed to update subscriptions', updateError);
      return NextResponse.json({ error: 'Failed to update subscriptions' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, expired: overdue.length });
  } catch (error: any) {
    console.error('Grace expiry cron failed', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
