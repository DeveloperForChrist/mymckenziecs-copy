import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { sendResendEmail } from '@/lib/email/resend';
import { getAppUrl } from '@/lib/app-url';
import { syncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
import { daysUntil, parseReminderDaysSet, serializeReminderDaysSet } from '@/lib/payments/subscription-lifecycle';
import { invalidateUserPlanCache } from '@/lib/payments/user-plan';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const TEMPLATE_DIR = path.join(process.cwd(), 'src', 'emails', 'templates');

type TrialingSubscriptionRow = {
  id: string;
  user_id: string;
  plan_type: string;
  status: string;
  current_period_end: string | null;
  updated_at: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean;
  trial_reminder_days_sent: any;
};

function renderTemplate(templateName: string, vars: Record<string, string>) {
  const templatePath = path.join(TEMPLATE_DIR, templateName);
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v);
  }
  return html;
}

function getTrialReminderDays(): number[] {
  const raw = (process.env.TRIAL_END_REMINDER_DAYS || '3,2,1').trim();
  const parsed = raw
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.max(1, Math.min(30, value)));

  const uniqueSorted = Array.from(new Set(parsed)).sort((a, b) => b - a);
  return uniqueSorted.length > 0 ? uniqueSorted : [3, 2, 1];
}

function formatDateLabel(value?: Date | string | number | null) {
  if (!value) return 'soon';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'soon';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatDaysLabel(days: number) {
  return days === 1 ? '1 day' : `${days} days`;
}

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = (request.headers.get('x-cron-secret') || request.headers.get('authorization') || '')
      .replace(/^Bearer\s+/i, '');

    if (!cronSecret) {
      console.error('CRON_SECRET is not configured for subscription-trial-reminders cron route');
      return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
    }

    if (headerSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const reminderDays = getTrialReminderDays();
    const manageUrl = `${getAppUrl(request)}/settings?tab=billing`;
    const supportEmail = process.env.SUPPORT_EMAIL || 'jordan@lenjordan.tech';

    const { data: trialingSubs, error } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, plan_type, status, current_period_end, updated_at, stripe_subscription_id, cancel_at_period_end, trial_reminder_days_sent')
      .eq('status', 'trialing')
      .not('current_period_end', 'is', null)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Trial reminders: failed to fetch subscriptions', error);
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }

    if (!trialingSubs || trialingSubs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const latestTrialByUser = new Map<string, TrialingSubscriptionRow>();
    for (const row of trialingSubs as TrialingSubscriptionRow[]) {
      if (!row.user_id || latestTrialByUser.has(row.user_id)) continue;
      latestTrialByUser.set(row.user_id, row);
    }

    const latestUserIds = Array.from(latestTrialByUser.keys());
    const { data: latestSubs } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status')
      .in('user_id', latestUserIds)
      .order('updated_at', { ascending: false });

    const latestOverallByUser = new Map<string, { id: string; status: string }>();
    for (const row of (latestSubs || []) as Array<{ id: string; user_id: string; status: string }>) {
      if (!row.user_id || latestOverallByUser.has(row.user_id)) continue;
      latestOverallByUser.set(row.user_id, { id: row.id, status: row.status });
    }

    const targets = Array.from(latestTrialByUser.values()).filter((row) => {
      const latest = latestOverallByUser.get(row.user_id);
      if (!latest) return true;
      return latest.id === row.id && String(latest.status || '').toLowerCase() === 'trialing';
    });

    if (targets.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const userIds = targets.map((row) => row.user_id);
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id, email, name')
      .in('id', userIds);

    if (usersError) {
      console.error('Trial reminders: failed to fetch users', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const usersById = new Map((users || []).map((row: any) => [row.id, row]));
    let sent = 0;

    for (const sub of targets) {
      if (!sub.user_id || !sub.current_period_end) continue;

      if (!sub.stripe_subscription_id) {
        const trialEndMs = new Date(sub.current_period_end).getTime();
        if (Number.isFinite(trialEndMs) && trialEndMs <= now.getTime()) {
          const { error: expireError } = await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'expired',
              updated_at: now.toISOString(),
            })
            .eq('id', sub.id);

          if (expireError) {
            console.error('Trial reminders: failed to expire local trial', expireError);
            continue;
          }

          await syncUserEntitlementSnapshot(sub.user_id);
          invalidateUserPlanCache(sub.user_id);
          continue;
        }
      }

      if (sub.cancel_at_period_end || sub.stripe_subscription_id) {
        continue;
      }

      const user = usersById.get(sub.user_id);
      if (!user?.email) continue;

      const daysLeft = daysUntil(sub.current_period_end, now);
      if (daysLeft === null || daysLeft < 1) continue;

      const sentDays = parseReminderDaysSet(sub.trial_reminder_days_sent);
      const selectedDay = reminderDays.find((day) => day === daysLeft && !sentDays.has(day));
      if (!selectedDay) continue;

      const firstChargeDate = formatDateLabel(sub.current_period_end);
      const daysLeftLabel = formatDaysLabel(selectedDay);
      const htmlBody = renderTemplate('28-free-trial-ending.html', {
        name: user.name || '',
        plan_name: sub.plan_type || 'your selected plan',
        first_charge_date: firstChargeDate,
        manage_url: manageUrl,
        support_email: supportEmail,
        days_left_label: daysLeftLabel,
      });

      await sendResendEmail({
        to: user.email,
        subject: `Your MyMcKenzieCS free trial ends in ${daysLeftLabel}`,
        htmlBody,
        tag: `billing-trial-ending-day-${selectedDay}`,
      });

      sentDays.add(selectedDay);
      const { error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update({
          trial_reminder_days_sent: serializeReminderDaysSet(sentDays),
          updated_at: now.toISOString(),
        })
        .eq('id', sub.id);

      if (updateError) {
        console.error('Trial reminders: failed to update sent flags', updateError);
        continue;
      }

      sent += 1;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (error: any) {
    console.error('Trial reminders cron failed', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
