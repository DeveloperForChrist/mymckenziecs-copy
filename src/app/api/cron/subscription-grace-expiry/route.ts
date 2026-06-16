import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { buildLifecycleSchedule } from '@/lib/payments/subscription-lifecycle';
import { verifyCronSecret } from '@/lib/security/timing-safe';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = request.headers.get('x-cron-secret') || request.headers.get('authorization');

    if (!verifyCronSecret(headerSecret, cronSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const nowIso = new Date().toISOString();

    const { data: overdue, error } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, grace_period_end, lifecycle_lapsed_at, lifecycle_archive_at, lifecycle_delete_at')
      .eq('status', 'past_due')
      .lte('grace_period_end', nowIso);

    if (error) {
      console.error('Grace expiry cron: failed to fetch subscriptions', error);
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }

    if (!overdue || overdue.length === 0) {
      return NextResponse.json({ ok: true, expired: 0 });
    }

    let expired = 0;
    for (const row of overdue) {
      const schedule = row.lifecycle_lapsed_at
        ? {
            lapsedAt: new Date(row.lifecycle_lapsed_at),
            archiveAt: row.lifecycle_archive_at ? new Date(row.lifecycle_archive_at) : buildLifecycleSchedule(row.lifecycle_lapsed_at).archiveAt,
            deleteAt: row.lifecycle_delete_at ? new Date(row.lifecycle_delete_at) : buildLifecycleSchedule(row.lifecycle_lapsed_at).deleteAt,
          }
        : buildLifecycleSchedule(new Date());

      const { error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'expired',
          lifecycle_lapsed_at: schedule.lapsedAt.toISOString(),
          lifecycle_archive_at: schedule.archiveAt.toISOString(),
          lifecycle_delete_at: schedule.deleteAt.toISOString(),
          lifecycle_archived_at: null,
          lifecycle_deleted_at: null,
          lifecycle_archive_notice_sent_at: null,
          lifecycle_delete_notice_sent_at: null,
          lifecycle_archive_warning_days_sent: [],
          lifecycle_delete_warning_days_sent: [],
          lifecycle_reminder_days_sent: [],
          updated_at: nowIso,
        })
        .eq('id', row.id);

      if (updateError) {
        console.error('Grace expiry cron: failed to update subscription', row.id, updateError);
        continue;
      }
      expired += 1;
    }

    return NextResponse.json({ ok: true, expired });
  } catch (error: any) {
    console.error('Grace expiry cron failed', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
