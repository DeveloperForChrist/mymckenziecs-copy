import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { sendResendEmail } from '@/lib/email/resend';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const TEMPLATE_DIR = path.join(process.cwd(), 'src', 'emails', 'templates');

function renderTemplate(templateName: string, vars: Record<string, string>) {
  const templatePath = path.join(TEMPLATE_DIR, templateName);
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v);
  }
  return html;
}

function formatDateLabel(value?: Date | number | null) {
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

function getReminderDays(): number[] {
  const raw = (process.env.BILLING_GRACE_REMINDER_DAYS || '1,2,3,5,6').trim();
  const parsed = raw
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.max(1, Math.min(30, value)));

  const uniqueSorted = Array.from(new Set(parsed)).sort((a, b) => a - b);
  return uniqueSorted.length > 0 ? uniqueSorted : [1, 2, 3, 5, 6];
}

function parseSentReminderDays(value: any): Set<number> {
  const sent = new Set<number>();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const num = Number.parseInt(String(entry), 10);
      if (Number.isFinite(num) && num > 0) sent.add(num);
    }
  }
  return sent;
}

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = (request.headers.get('x-cron-secret') || request.headers.get('authorization') || '')
      .replace(/^Bearer\s+/i, '');

    if (!cronSecret) {
      console.error('CRON_SECRET is not configured for subscription-grace-reminders cron route');
      return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
    }

    if (headerSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const reminderDays = getReminderDays();
    const highestReminderDay = reminderDays[reminderDays.length - 1];
    const manageUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/settings`
      : 'http://localhost:3000/settings';

    const { data: subs, error } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, past_due_since, grace_period_end, next_retry_at, grace_day3_sent_at, grace_day6_sent_at, grace_reminder_days_sent')
      .eq('status', 'past_due');

    if (error) {
      console.error('Grace reminders: failed to fetch subscriptions', error);
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }

    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const userIds = Array.from(new Set(subs.map((s: any) => s.user_id).filter(Boolean)));
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id, email, name')
      .in('id', userIds);

    if (usersError) {
      console.error('Grace reminders: failed to fetch users', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const usersById = new Map((users || []).map((u: any) => [u.id, u]));
    let sent = 0;

    for (const sub of subs as any[]) {
      if (!sub.user_id) continue;
      const user = usersById.get(sub.user_id);
      if (!user?.email) continue;
      if (!sub.past_due_since || !sub.grace_period_end) continue;

      const pastDueDate = new Date(sub.past_due_since);
      const daysSince = Math.floor((now.getTime() - pastDueDate.getTime()) / dayMs);
      const sentDays = parseSentReminderDays((sub as any).grace_reminder_days_sent);
      if (sub.grace_day3_sent_at) sentDays.add(3);
      if (sub.grace_day6_sent_at) sentDays.add(6);

      const dueUnsentDays = reminderDays.filter((day) => day <= daysSince && !sentDays.has(day));
      if (dueUnsentDays.length === 0) continue;

      const selectedDay = dueUnsentDays[dueUnsentDays.length - 1];
      const isFinalReminder = selectedDay >= highestReminderDay;

      const nextRetryLabel = formatDateLabel(sub.next_retry_at ? new Date(sub.next_retry_at) : null);
      const graceEndLabel = formatDateLabel(new Date(sub.grace_period_end));

      const templateName = isFinalReminder
        ? '06-payment-failed-reminder-final.html'
        : '06-payment-failed-reminder.html';
      const htmlBody = renderTemplate(templateName, {
        name: user.name || '',
        next_retry_date: nextRetryLabel,
        grace_end_date: graceEndLabel,
        manage_url: manageUrl,
      });

      const subject = isFinalReminder ? 'Final payment reminder' : 'Payment reminder';

      await sendResendEmail({
        from: process.env.RESEND_ALERT_FROM_EMAIL || 'alerts@mymckenziecs.com',
        to: user.email,
        subject,
        htmlBody,
        tag: isFinalReminder ? 'billing-payment-reminder-final' : `billing-payment-reminder-day-${selectedDay}`,
      });

      const updates: Record<string, string> = {};
      for (const day of dueUnsentDays) sentDays.add(day);
      if (sentDays.has(3)) updates.grace_day3_sent_at = now.toISOString();
      if (sentDays.has(6)) updates.grace_day6_sent_at = now.toISOString();

      const payload: Record<string, any> = {
        ...updates,
        grace_reminder_days_sent: Array.from(sentDays).sort((a, b) => a - b),
        updated_at: now.toISOString(),
      };

      if (Object.keys(payload).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from('subscriptions')
          .update(payload)
          .eq('id', sub.id);
        if (updateError) {
          console.error('Grace reminders: failed to update sent flags', updateError);
        }
      }

      sent += 1;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (error: any) {
    console.error('Grace reminders cron failed', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
