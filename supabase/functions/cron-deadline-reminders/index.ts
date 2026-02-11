// Supabase Edge Function: cron-deadline-reminders
// Deploy with: `supabase functions deploy cron-deadline-reminders`
// This function uses the Supabase service role key to query calendar_events
// and sends reminder emails via Resend. Schedule it in Supabase Dashboard > Functions > Schedules.

import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js';

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

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

serve(async (req) => {
  try {
    const env = Deno.env;
    const SUPABASE_URL = env.get('SUPABASE_URL') || env.get('NEXT_PUBLIC_SUPABASE_URL');
    // Accept multiple secret names: prefer SUPABASE_SERVICE_ROLE_KEY, fall back to SERVICE_ROLE_KEY or SERVICE_KEY
    const SUPABASE_SERVICE_KEY = env.get('SUPABASE_SERVICE_ROLE_KEY') || env.get('SERVICE_ROLE_KEY') || env.get('SERVICE_KEY') || env.get('SUPABASE_SERVICE_KEY');
    const RESEND_API_KEY = env.get('RESEND_API_KEY') || env.get('RESEND_KEY');
    const RESEND_FROM_RAW =
      env.get('RESEND_ALERT_FROM_EMAIL') ||
      env.get('RESEND_FROM_EMAIL') ||
      env.get('FROM_EMAIL') ||
      env.get('RESEND_FROM') ||
      'alerts@mymckenziecs.com';
    const RESEND_FROM_NAME =
      env.get('RESEND_ALERT_FROM_NAME') ||
      env.get('RESEND_FROM_NAME') ||
      'MymckenzieCS';
    const RESEND_FROM = RESEND_FROM_RAW.includes('<')
      ? RESEND_FROM_RAW
      : `${RESEND_FROM_NAME} <${RESEND_FROM_RAW}>`;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { status: 500 });
    }
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

    const url = new URL(req.url);
    const lookaheadDays = Math.min(Math.max(Number(url.searchParams.get('days') || 7), 1), 30);

    const now = new Date();
    const start = now.toISOString();
    const end = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: events, error: eventsError } = await supabase
      .from('calendar_events')
      .select('id, user_id, title, notes, time, date, category, priority')
      .gte('date', start)
      .lte('date', end)
      .eq('category', 'deadline')
      .order('date', { ascending: true });

    if (eventsError) {
      console.error('Failed to fetch events', eventsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch events' }), { status: 500 });
    }

    const byUser = new Map<string, CalendarEventRow[]>();
    for (const ev of (events || []) as CalendarEventRow[]) {
      if (!byUser.has(ev.user_id)) byUser.set(ev.user_id, []);
      byUser.get(ev.user_id)!.push(ev);
    }

    if (byUser.size === 0) return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });

    const userIds = Array.from(byUser.keys());
    const { data: users } = await supabase.from('users').select('id, email, name').in('id', userIds);

    // dynamic import of Resend in Edge Function (use npm: prefix for Deno bundler)
    const { Resend } = await import('npm:resend');
    const resend = new Resend(RESEND_API_KEY!);

    let sent = 0;
    for (const user of users || []) {
      const list = byUser.get(user.id) || [];
      if (!user.email || list.length === 0) continue;

      const rowsHtml = list
        .map((ev) => {
          const d = new Date(ev.date);
          const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' });
          const timeLabel = ev.time ? ` ${String(ev.time).slice(0, 5)}` : '';
          const notesHtml = ev.notes ? `<div style="color:#6b7280; font-size:12px; margin-top:4px;">${escapeHtml(ev.notes)}</div>` : '';
          return `
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                <div style="font-weight:700; color:#111827;">${escapeHtml(ev.title)}</div>
                <div style="color:#374151; font-size:13px;">${dateLabel}${timeLabel}</div>
                ${notesHtml}
              </td>
            </tr>`;
        })
        .join('');

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color:#4c1d95;">Upcoming deadlines (next ${lookaheadDays} days)</h2>
          <p>Hi${user.name ? ` ${escapeHtml(user.name)}` : ''},</p>
          <p>Here are your upcoming deadlines:</p>
          <table style="width:100%; border-collapse:collapse;">${rowsHtml}</table>
          <p style="margin-top:18px; color:#6b7280; font-size:12px;">MymckenzieCS</p>
        </div>`;

      await resend.emails.send({ from: RESEND_FROM, to: [user.email], subject: `Upcoming deadlines (next ${lookaheadDays} days)`, html: htmlBody });
      sent += 1;
    }

    return new Response(JSON.stringify({ ok: true, sent }), { status: 200 });
  } catch (err) {
    console.error('Function error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
