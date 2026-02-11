import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { sendResendEmail } from '@/lib/email/resend';

type CalendarEventRow = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  time: string | null;
  date: string;
  category: string | null;
  priority: string | null;
};

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = (request.headers.get('x-cron-secret') || request.headers.get('authorization') || '')
      .replace(/^Bearer\s+/i, '');

    if (cronSecret && headerSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lookaheadDays = Math.min(
      Math.max(parseInt(searchParams.get('days') || '7', 10) || 7, 1),
      30
    );

    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    end.setDate(end.getDate() + lookaheadDays);

    const { data: events, error: eventsError } = await supabaseAdmin
      .from('calendar_events')
      .select('id, user_id, title, notes, time, date, category, priority')
      .gte('date', start.toISOString())
      .lte('date', end.toISOString())
      .eq('category', 'deadline')
      .order('date', { ascending: true });

    if (eventsError) {
      console.error('Deadline reminders: failed to fetch events', eventsError);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    const byUser = new Map<string, CalendarEventRow[]>();
    for (const ev of (events || []) as CalendarEventRow[]) {
      if (!byUser.has(ev.user_id)) byUser.set(ev.user_id, []);
      byUser.get(ev.user_id)!.push(ev);
    }

    const userIds = Array.from(byUser.keys());
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

    let sent = 0;
    for (const user of (users || []) as any[]) {
      const list = byUser.get(user.id) || [];
      if (!user.email || list.length === 0) continue;

      const pref = prefsByUser.get(user.id) || {
        email_notifications: true,
        deadline_reminders: true,
      };

      if (!pref.email_notifications || !pref.deadline_reminders) continue;

      const rowsHtml = list
        .map((ev) => {
          const d = new Date(ev.date);
          const dateLabel = d.toLocaleDateString('en-GB', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: '2-digit',
          });
          const timeLabel = ev.time ? ` ${String(ev.time).slice(0, 5)}` : '';
          const categoryLabel = ev.category || 'deadline';
          const priorityLabel = ev.priority || 'medium';
          const notesHtml = ev.notes ? `<div style="color:#6b7280; font-size: 12px; margin-top: 4px;">${escapeHtml(ev.notes)}</div>` : '';
          return `
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                <div style="font-weight: 700; color: #111827;">${escapeHtml(ev.title)}</div>
                <div style="color: #374151; font-size: 13px;">${dateLabel}${timeLabel} · ${escapeHtml(categoryLabel)} · ${escapeHtml(priorityLabel)}</div>
                ${notesHtml}
              </td>
            </tr>
          `;
        })
        .join('');

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4c1d95;">Upcoming deadlines (next ${lookaheadDays} days)</h2>
          <p>Hi${user.name ? ` ${escapeHtml(user.name)}` : ''},</p>
          <p>Here are your upcoming deadlines from MyCalendar:</p>
          <table style="width: 100%; border-collapse: collapse;">
            ${rowsHtml}
          </table>
          <p style="margin-top: 18px; color: #6b7280; font-size: 12px;">MymckenzieCS</p>
        </div>
      `;

      await sendResendEmail({
        from: process.env.RESEND_ALERT_FROM_EMAIL || 'alerts@mymckenziecs.com',
        to: user.email,
        subject: `Upcoming deadlines (next ${lookaheadDays} days)`,
        htmlBody,
        tag: 'calendar-deadline-reminders',
      });

      sent += 1;
    }

    return NextResponse.json({ ok: true, sent, users: userIds.length, events: (events || []).length });
  } catch (error: any) {
    console.error('Deadline reminders cron failed', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
