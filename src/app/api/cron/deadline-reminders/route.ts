import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { sendResendEmail } from '@/lib/email/resend';
import fs from 'fs';
import path from 'path';

type CalendarEventRow = {
  id: string;
  user_id: string;
  title: string;
  date: string;
  completed?: boolean;
};

const TEMPLATE_DIR = path.join(process.cwd(), 'src', 'emails', 'templates');
const TEMPLATE_BY_DAY: Record<number, string> = {
  21: 'deadline-3weeks.html',
  14: 'deadline-2weeks.html',
  7: 'deadline-1week.html',
  5: 'deadline-5days.html',
  3: 'deadline-3days.html',
  1: 'deadline-1day.html',
};

function renderTemplate(templateName: string, vars: Record<string, string>) {
  const templatePath = path.join(TEMPLATE_DIR, templateName);
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v);
  }
  return html;
}

function datePartsInLondon(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return { y: get('year'), m: get('month'), d: get('day') };
}

function daysUntilInLondon(target: Date) {
  const t = datePartsInLondon(target);
  const n = datePartsInLondon(new Date());
  const targetDay = new Date(`${t.y}-${t.m}-${t.d}T00:00:00Z`);
  const nowDay = new Date(`${n.y}-${n.m}-${n.d}T00:00:00Z`);
  return Math.ceil((targetDay.getTime() - nowDay.getTime()) / (24 * 60 * 60 * 1000));
}

function formatDateLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', {
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
    const end = new Date(now);
    end.setDate(end.getDate() + 21);

    const { data: events, error: eventsError } = await supabaseAdmin
      .from('calendar_events')
      .select('id, user_id, title, date, completed')
      .gte('date', now.toISOString())
      .lte('date', end.toISOString())
      .eq('completed', false)
      .order('date', { ascending: true });

    if (eventsError) {
      console.error('Deadline reminders: failed to fetch events', eventsError);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    const eventsByUser = new Map<string, CalendarEventRow[]>();
    for (const ev of (events || []) as CalendarEventRow[]) {
      const daysLeft = daysUntilInLondon(new Date(ev.date));
      if (!TEMPLATE_BY_DAY[daysLeft]) continue;
      if (!eventsByUser.has(ev.user_id)) eventsByUser.set(ev.user_id, []);
      eventsByUser.get(ev.user_id)!.push(ev);
    }

    const userIds = Array.from(eventsByUser.keys());
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, users: 0, events: 0 });
    }

    const [{ data: users, error: usersError }, { data: prefs, error: prefsError }] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id, email, name')
        .in('id', userIds),
      supabaseAdmin
        .from('user_preferences')
        .select('user_id, email_notifications, deadline_reminders')
        .in('user_id', userIds),
    ]);

    if (usersError) {
      console.error('Deadline reminders: failed to fetch users', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    if (prefsError) {
      console.error('Deadline reminders: failed to fetch user preferences', prefsError);
      return NextResponse.json({ error: 'Failed to fetch user preferences' }, { status: 500 });
    }

    const prefsByUser = new Map<string, { email_notifications: boolean; deadline_reminders: boolean }>();
    for (const p of (prefs || []) as any[]) {
      prefsByUser.set(p.user_id, {
        email_notifications: p.email_notifications !== false,
        deadline_reminders: p.deadline_reminders !== false,
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let sent = 0;

    for (const user of (users || []) as any[]) {
      const userEvents = eventsByUser.get(user.id) || [];
      if (!user.email || userEvents.length === 0) continue;

      const pref = prefsByUser.get(user.id) || {
        email_notifications: true,
        deadline_reminders: true,
      };
      if (!pref.email_notifications || !pref.deadline_reminders) continue;

      for (const ev of userEvents) {
        const daysLeft = daysUntilInLondon(new Date(ev.date));
        const templateName = TEMPLATE_BY_DAY[daysLeft];
        if (!templateName) continue;

        const htmlBody = renderTemplate(templateName, {
          name: user.name || user.email.split('@')[0] || 'there',
          deadline_title: ev.title,
          deadline_date: formatDateLabel(ev.date),
          days_left: String(daysLeft),
          action_url: `${appUrl}/dashboard/calendar`,
        });

        await sendResendEmail({
          from: process.env.RESEND_ALERT_FROM_EMAIL || 'alerts@mymckenziecs.com',
          to: user.email,
          subject: `${daysLeft} day${daysLeft === 1 ? '' : 's'} until event: ${ev.title}`,
          htmlBody,
          tag: `deadline-${daysLeft}d-reminder`,
        });

        sent += 1;
      }
    }

    return NextResponse.json({ ok: true, sent, users: userIds.length, events: (events || []).length });
  } catch (error: any) {
    console.error('Deadline reminders cron failed', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
