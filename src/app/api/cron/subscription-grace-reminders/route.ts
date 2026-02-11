import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { sendResendEmail } from '@/lib/email/resend';
import fs from 'fs';
import path from 'path';

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

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = (request.headers.get('x-cron-secret') || request.headers.get('authorization') || '')
      .replace(/^Bearer\s+/i, '');

    if (cronSecret && headerSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const manageUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/settings`
      : 'http://localhost:3000/settings';

    const { data: subs, error } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, past_due_since, grace_period_end, next_retry_at, grace_day3_sent_at, grace_day6_sent_at')
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

      const shouldSendDay3 = daysSince >= 3 && !sub.grace_day3_sent_at;
      const shouldSendDay6 = daysSince >= 6 && !sub.grace_day6_sent_at;

      if (!shouldSendDay3 && !shouldSendDay6) continue;

      const nextRetryLabel = formatDateLabel(sub.next_retry_at ? new Date(sub.next_retry_at) : null);
      const graceEndLabel = formatDateLabel(new Date(sub.grace_period_end));

      const htmlBody = renderTemplate('06-payment-failed-reminder.html', {
        name: user.name || '',
        next_retry_date: nextRetryLabel,
        grace_end_date: graceEndLabel,
        manage_url: manageUrl,
      });

      const subject = shouldSendDay6 ? 'Final payment reminder' : 'Payment reminder';

      await sendResendEmail({
        from: process.env.RESEND_ALERT_FROM_EMAIL || 'alerts@mymckenziecs.com',
        to: user.email,
        subject,
        htmlBody,
        tag: shouldSendDay6 ? 'billing-payment-reminder-final' : 'billing-payment-reminder',
      });

      const updates: Record<string, string> = {};
      if (shouldSendDay3) updates.grace_day3_sent_at = now.toISOString();
      if (shouldSendDay6) updates.grace_day6_sent_at = now.toISOString();

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from('subscriptions')
          .update({ ...updates, updated_at: now.toISOString() })
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
