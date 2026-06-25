// Supabase Edge Function: cron-deadline-reminders
// Deploy with: `supabase functions deploy cron-deadline-reminders`
// This function uses the Supabase service role key to query calendar_events
// and sends reminder emails via Resend. Schedule it in Supabase Dashboard > Functions > Schedules.

import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js';
import { ALERT_FAILURE_TEMPLATE, REMINDER_TEMPLATE } from './templates.ts';

type CalendarEventRow = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  time: string | null;
  date: string;
  category: string | null;
  priority: string | null;
  completed: boolean;
};

type SendFailure = {
  user_id: string;
  email: string;
  error: string;
};

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
};

type UserPreferenceRow = {
  user_id: string;
  deadline_reminders: boolean | null;
};

type SubscriptionRow = {
  user_id: string;
  plan_type: string | null;
  status: string | null;
  updated_at: string | null;
};

type ReminderJob = {
  user: UserRow;
  events: CalendarEventRow[];
};

type DeliveryClaim = {
  should_send: boolean;
  reason: string;
  attempt_count: number;
  status: string;
};

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderTemplate(template: string, vars: Record<string, string | number>) {
  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    output = output.split(`{{${key}}}`).join(String(value));
  }
  return output;
}

function parseIntWithBounds(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseReminderOffsets(value: string | undefined) {
  const raw = (value || '')
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item >= 0 && item <= 30);

  if (raw.length === 0) return [];
  const unique = Array.from(new Set(raw));
  unique.sort((a, b) => b - a);
  return unique;
}

function chunkArray<T>(items: T[], size: number) {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function userBucket(userId: string, bucketCount: number) {
  if (bucketCount <= 1) return 0;
  return hashString(userId) % bucketCount;
}

function formatLabel(input: string | null | undefined) {
  if (!input) return '';
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function isReminderEligiblePlan(planType: string | null | undefined) {
  const label = (planType || '').toLowerCase().trim();
  if (!label) return false;
  if (label.includes('basic') || label.includes('essential') || label.includes('premium cheap')) return false;
  return (
    label.includes('premium') ||
    label.includes('premium +') ||
    label.includes('premium plus') ||
    label.includes('plus') ||
    label.includes('pro')
  );
}

function daysUntil(targetDate: Date) {
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate());
  return Math.max(0, Math.ceil((target - today) / msPerDay));
}

type UrgencyTheme = {
  headerBg: string;
  ctaBg: string;
  panelBg: string;
  panelBorder: string;
  title: string;
  intro: string;
};

function getUrgencyTheme(minDays: number): UrgencyTheme {
  if (minDays <= 1) {
    return {
      headerBg: '#991b1b',
      ctaBg: '#991b1b',
      panelBg: '#fef2f2',
      panelBorder: '#fecaca',
      title: 'Deadline is tomorrow',
      intro: 'At least one event is due within 1 day. Prioritize completion now.',
    };
  }

  if (minDays <= 3) {
    return {
      headerBg: '#7c2d12',
      ctaBg: '#9a3412',
      panelBg: '#fff7ed',
      panelBorder: '#fed7aa',
      title: 'Deadline approaching',
      intro: 'At least one event is due within 3 days. Please complete final checks.',
    };
  }

  if (minDays <= 5) {
    return {
      headerBg: '#1f2937',
      ctaBg: '#1f2937',
      panelBg: '#f9fafb',
      panelBorder: '#d1d5db',
      title: 'Upcoming deadline',
      intro: 'At least one event is due within 5 days. Keep your checklist moving.',
    };
  }

  return {
    headerBg: '#0f172a',
    ctaBg: '#0f172a',
    panelBg: '#f9fafb',
    panelBorder: '#e5e7eb',
    title: 'Deadline reminder',
    intro: 'Here are your upcoming events for this reminder window.',
  };
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
      'MyMcKenzieCS';
    const APP_URL = (env.get('NEXT_PUBLIC_APP_URL') || env.get('APP_URL') || 'https://mymckenziecs.com').replace(/\/$/, '');
    const REMINDER_ALERT_EMAIL = env.get('REMINDER_ALERT_EMAIL') || env.get('ADMIN_EMAIL') || '';
    const SEND_CONCURRENCY = parseIntWithBounds(env.get('REMINDER_SEND_CONCURRENCY') || undefined, 5, 1, 20);
    const FETCH_PAGE_SIZE = parseIntWithBounds(env.get('REMINDER_FETCH_PAGE_SIZE') || undefined, 1000, 100, 5000);
    const MAX_RETRY_ATTEMPTS = parseIntWithBounds(env.get('REMINDER_MAX_RETRY_ATTEMPTS') || undefined, 3, 1, 10);
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
    const defaultOffsets = env.get('REMINDER_DAY_OFFSETS') || '21,14,7,5,3,1';
    const reminderOffsets = parseReminderOffsets(url.searchParams.get('offset_days') || defaultOffsets);
    if (reminderOffsets.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid reminder offsets configured' }), { status: 400 });
    }
    const reminderOffsetSet = new Set(reminderOffsets);
    const maxReminderOffset = Math.max(...reminderOffsets);
    const requestedLookahead = Number.parseInt(url.searchParams.get('days') || '', 10);
    const fallbackLookahead = Math.max(7, maxReminderOffset);
    const lookaheadDays = Math.min(
      Math.max(Number.isFinite(requestedLookahead) ? requestedLookahead : fallbackLookahead, maxReminderOffset),
      30,
    );
    const bucketCount = parseIntWithBounds(url.searchParams.get('bucket_count') || undefined, 1, 1, 48);
    const bucketIndexRaw = url.searchParams.get('bucket_index') || '0';
    const bucketIndex = Number.parseInt(bucketIndexRaw, 10);
    if (!Number.isFinite(bucketIndex) || bucketIndex < 0 || bucketIndex >= bucketCount) {
      return new Response(JSON.stringify({ error: `Invalid bucket_index ${bucketIndexRaw} for bucket_count ${bucketCount}` }), { status: 400 });
    }
    const maxUsersPerRun = parseIntWithBounds(url.searchParams.get('max_users') || undefined, 0, 0, 100000);

    const now = new Date();
    const runDate = now.toISOString().slice(0, 10);
    const utcDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const utcDayEndExclusive = new Date(utcDayStart.getTime() + (lookaheadDays + 1) * 24 * 60 * 60 * 1000);
    const start = utcDayStart.toISOString();
    const endExclusive = utcDayEndExclusive.toISOString();

    const byUser = new Map<string, CalendarEventRow[]>();
    let eventsCount = 0;
    let pagesFetched = 0;
    for (let page = 0; ; page += 1) {
      const from = page * FETCH_PAGE_SIZE;
      const to = from + FETCH_PAGE_SIZE - 1;
      const { data: pageEvents, error: eventsError } = await supabase
        .from('calendar_events')
        .select('id, user_id, title, notes, time, date, category, priority, completed')
        .gte('date', start)
        .lt('date', endExclusive)
        .eq('completed', false)
        .order('date', { ascending: true })
        .range(from, to);

      if (eventsError) {
        console.error('Failed to fetch events', eventsError);
        return new Response(JSON.stringify({ error: 'Failed to fetch events' }), { status: 500 });
      }

      const rows = (pageEvents || []) as CalendarEventRow[];
      pagesFetched += 1;
      eventsCount += rows.length;
      for (const ev of rows) {
        if (!byUser.has(ev.user_id)) byUser.set(ev.user_id, []);
        byUser.get(ev.user_id)!.push(ev);
      }

      if (rows.length < FETCH_PAGE_SIZE) break;
      if (page >= 999) {
        console.warn('Event fetch reached max page cap', { page, FETCH_PAGE_SIZE });
        break;
      }
    }

    const filteredByUser = new Map<string, CalendarEventRow[]>();
    let eligibleEventsCount = 0;
    for (const [userId, events] of byUser.entries()) {
      const eventsForToday = events.filter((ev) => reminderOffsetSet.has(daysUntil(new Date(ev.date))));
      if (eventsForToday.length === 0) continue;
      filteredByUser.set(userId, eventsForToday);
      eligibleEventsCount += eventsForToday.length;
    }

    if (filteredByUser.size === 0) {
      return new Response(JSON.stringify({
        ok: true,
        sent: 0,
        failed: 0,
        users: 0,
        events: eventsCount,
        eligibleEvents: 0,
        lookaheadDays,
        reminderOffsets,
        fetchPageSize: FETCH_PAGE_SIZE,
        pagesFetched,
        sendConcurrency: SEND_CONCURRENCY,
        bucketCount,
        bucketIndex,
        maxUsersPerRun,
        maxRetryAttempts: MAX_RETRY_ATTEMPTS,
        runDate,
      }), { status: 200 });
    }

    const userIds = Array.from(filteredByUser.keys());
    const users: UserRow[] = [];
    for (const userIdChunk of chunkArray(userIds, 1000)) {
      const { data: usersChunk, error: usersError } = await supabase
        .from('users')
        .select('id, email, name')
        .in('id', userIdChunk);

      if (usersError) {
        console.error('Failed to fetch users', usersError);
        return new Response(JSON.stringify({ error: 'Failed to fetch users' }), { status: 500 });
      }
      users.push(...((usersChunk || []) as UserRow[]));
    }

    const remindersEnabledByUser = new Map<string, boolean>();
    const reminderPlanEligibleByUser = new Map<string, boolean>();
    for (const userIdChunk of chunkArray(userIds, 1000)) {
      const { data: prefsChunk, error: prefsError } = await supabase
        .from('user_preferences')
        .select('user_id, deadline_reminders')
        .in('user_id', userIdChunk);

      if (prefsError) {
        console.error('Failed to fetch reminder preferences', prefsError);
        return new Response(JSON.stringify({ error: 'Failed to fetch reminder preferences' }), { status: 500 });
      }

      // Default is disabled unless explicitly enabled by user.
      for (const userId of userIdChunk) {
        remindersEnabledByUser.set(userId, false);
      }
      for (const pref of (prefsChunk || []) as UserPreferenceRow[]) {
        remindersEnabledByUser.set(pref.user_id, pref.deadline_reminders === true);
      }

      const { data: subsChunk, error: subsError } = await supabase
        .from('subscriptions')
        .select('user_id, plan_type, status, updated_at')
        .in('user_id', userIdChunk)
        .in('status', ['active', 'past_due'])
        .order('updated_at', { ascending: false });

      if (subsError) {
        console.error('Failed to fetch subscription plans', subsError);
        return new Response(JSON.stringify({ error: 'Failed to fetch subscription plans' }), { status: 500 });
      }

      for (const userId of userIdChunk) {
        reminderPlanEligibleByUser.set(userId, false);
      }
      for (const sub of (subsChunk || []) as SubscriptionRow[]) {
        if (reminderPlanEligibleByUser.get(sub.user_id)) continue;
        reminderPlanEligibleByUser.set(sub.user_id, isReminderEligiblePlan(sub.plan_type));
      }
    }

    // dynamic import of Resend in Edge Function (use npm: prefix for Deno bundler)
    const { Resend } = await import('npm:resend');
    const resend = new Resend(RESEND_API_KEY!);

    let sent = 0;
    const failures: SendFailure[] = [];
    let disabledByPreference = 0;
    let disabledByPlan = 0;
    const jobs: ReminderJob[] = (users || [])
      .map((user) => ({ user, events: filteredByUser.get(user.id) || [] }))
      .filter((job) => {
        const hasAddress = Boolean(job.user.email);
        const hasEvents = job.events.length > 0;
        const remindersEnabled = remindersEnabledByUser.get(job.user.id) === true;
        const planEligible = reminderPlanEligibleByUser.get(job.user.id) === true;
        if (hasAddress && hasEvents && !remindersEnabled) {
          disabledByPreference += 1;
        }
        if (hasAddress && hasEvents && remindersEnabled && !planEligible) {
          disabledByPlan += 1;
        }
        return hasAddress && hasEvents && remindersEnabled && planEligible;
      })
      .sort((a, b) => a.user.id.localeCompare(b.user.id));

    const jobsByUserId = new Map(jobs.map((job) => [job.user.id, job]));
    const bucketedJobs = jobs.filter((job) => userBucket(job.user.id, bucketCount) === bucketIndex);
    const retryJobs: ReminderJob[] = [];
    if (bucketIndex > 0) {
      const { data: failedStateRows, error: failedStateError } = await supabase
        .from('reminder_delivery_state')
        .select('user_id, last_attempt_bucket, attempt_count')
        .eq('run_date', runDate)
        .eq('status', 'failed')
        .lt('attempt_count', MAX_RETRY_ATTEMPTS)
        .limit(50000);

      if (failedStateError) {
        console.error('Failed to fetch retry candidates', failedStateError);
        return new Response(JSON.stringify({ error: 'Failed to fetch retry candidates' }), { status: 500 });
      }

      for (const row of (failedStateRows || []) as any[]) {
        const lastAttemptBucket = typeof row.last_attempt_bucket === 'number' ? row.last_attempt_bucket : -1;
        if (lastAttemptBucket >= bucketIndex) continue;
        const retryJob = jobsByUserId.get(row.user_id);
        if (retryJob) retryJobs.push(retryJob);
      }
    }

    const prioritizedJobs = [...retryJobs, ...bucketedJobs];
    const dedupedSelectedJobs: ReminderJob[] = [];
    const seenUserIds = new Set<string>();
    for (const job of prioritizedJobs) {
      if (seenUserIds.has(job.user.id)) continue;
      seenUserIds.add(job.user.id);
      dedupedSelectedJobs.push(job);
    }
    const selectedJobs = maxUsersPerRun > 0 ? dedupedSelectedJobs.slice(0, maxUsersPerRun) : dedupedSelectedJobs;

    let skippedByClaim = 0;
    let completionErrors = 0;
    const processJob = async (job: ReminderJob) => {
      const user = job.user;
      const list = job.events;
      const { data: claimData, error: claimError } = await supabase
        .rpc('claim_reminder_delivery', {
          p_user_id: user.id,
          p_run_date: runDate,
          p_lookahead_days: lookaheadDays,
          p_bucket_index: bucketIndex,
          p_max_attempts: MAX_RETRY_ATTEMPTS,
        })
        .single();

      if (claimError) {
        console.error('Failed to claim reminder delivery', { userId: user.id, error: claimError.message });
        failures.push({ user_id: user.id, email: user.email as string, error: `Claim failed: ${claimError.message}` });
        return;
      }

      const claim = (claimData || null) as DeliveryClaim | null;
      if (!claim?.should_send) {
        skippedByClaim += 1;
        return;
      }

      const minDueDays = Math.min(...list.map((ev) => daysUntil(new Date(ev.date))));
      const theme = getUrgencyTheme(minDueDays);

      const rowsHtml = list
        .map((ev) => {
          const d = new Date(ev.date);
          const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' });
          const timeLabel = ev.time ? ` ${String(ev.time).slice(0, 5)}` : '';
          const categoryLabel = formatLabel(ev.category);
          const priorityLabel = formatLabel(ev.priority);
          const dueInDays = daysUntil(d);
          const dueLabel = dueInDays === 0 ? 'Today' : dueInDays === 1 ? 'Tomorrow' : `In ${dueInDays} days`;
          const notesHtml = ev.notes ? `<div style="color:#6b7280; font-size:12px; margin-top:4px;">${escapeHtml(ev.notes)}</div>` : '';
          return `
            <tr>
              <td style="padding:14px 0; border-top:1px solid #edf2f7;">
                <div style="font-weight:700; color:#111827; font-size:15px;">${escapeHtml(ev.title)}</div>
                <div style="margin-top:4px; color:#374151; font-size:13px;">${dateLabel}${timeLabel ? ` at${timeLabel}` : ''}</div>
                <div style="margin-top:8px; font-size:12px; color:#4b5563;">
                  ${categoryLabel ? `<span style="display:inline-block; color:#1e3a8a; margin-right:10px;">${escapeHtml(categoryLabel)}</span>` : ''}
                  ${priorityLabel ? `<span style="display:inline-block; color:#92400e; margin-right:10px;">${escapeHtml(priorityLabel)} priority</span>` : ''}
                  <span style="display:inline-block; color:#17324d; font-weight:700;">${dueLabel}</span>
                </div>
                ${notesHtml}
              </td>
            </tr>`;
        })
        .join('');

      const calendarUrl = `${APP_URL}/dashboard/calendar`;
      const htmlBody = renderTemplate(REMINDER_TEMPLATE, {
        header_bg: theme.headerBg,
        title: theme.title,
        name_suffix: user.name ? ` ${escapeHtml(user.name)}` : '',
        events_count: list.length,
        events_plural: list.length === 1 ? '' : 's',
        lookahead_days: lookaheadDays,
        panel_border: theme.panelBorder,
        panel_bg: theme.panelBg,
        intro: theme.intro,
        rows_html: rowsHtml,
        cta_bg: theme.ctaBg,
        calendar_url: calendarUrl,
      });

      try {
        await resend.emails.send({
          from: RESEND_FROM,
          to: [user.email as string],
          subject: `Upcoming events (next ${lookaheadDays} days)`,
          html: htmlBody,
        });
        const { error: completeError } = await supabase.rpc('complete_reminder_delivery', {
          p_user_id: user.id,
          p_run_date: runDate,
          p_lookahead_days: lookaheadDays,
          p_success: true,
          p_error: null,
        });
        if (completeError) {
          completionErrors += 1;
          console.error('Failed to mark reminder delivery as sent', {
            userId: user.id,
            error: completeError.message,
          });
        }
        sent += 1;
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : String(sendError);
        console.error('Failed to send reminder email', { userId: user.id, email: user.email, error: message });
        failures.push({ user_id: user.id, email: user.email as string, error: message });
        const { error: completeError } = await supabase.rpc('complete_reminder_delivery', {
          p_user_id: user.id,
          p_run_date: runDate,
          p_lookahead_days: lookaheadDays,
          p_success: false,
          p_error: message,
        });
        if (completeError) {
          completionErrors += 1;
          console.error('Failed to mark reminder delivery as failed', {
            userId: user.id,
            error: completeError.message,
          });
        }
      }
    };

    let cursor = 0;
    const workerCount = Math.max(1, Math.min(SEND_CONCURRENCY, selectedJobs.length));
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = cursor;
        cursor += 1;
        if (currentIndex >= selectedJobs.length) break;
        await processJob(selectedJobs[currentIndex]);
      }
    });
    await Promise.all(workers);

    const summary = {
      ok: failures.length === 0,
      sent,
      failed: failures.length,
      users: selectedJobs.length,
      eligibleUsers: jobs.length,
      bucketUsers: bucketedJobs.length,
      retryCandidates: retryJobs.length,
      skippedByClaim,
      disabledByPreference,
      disabledByPlan,
      completionErrors,
      events: eventsCount,
      eligibleEvents: eligibleEventsCount,
      lookaheadDays,
      reminderOffsets,
      fetchPageSize: FETCH_PAGE_SIZE,
      pagesFetched,
      sendConcurrency: SEND_CONCURRENCY,
      bucketCount,
      bucketIndex,
      maxUsersPerRun,
      maxRetryAttempts: MAX_RETRY_ATTEMPTS,
      runDate,
    };

    if (eventsCount > 0 && sent === 0) {
      console.warn('Reminder run completed with events found but no sends', summary);
    } else {
      console.log('Reminder run summary', summary);
    }

    if (failures.length > 0) {
      if (REMINDER_ALERT_EMAIL) {
        const failuresList = failures
          .slice(0, 20)
          .map((f) => `<li style="margin-bottom:6px;"><strong>${escapeHtml(f.email)}</strong>: ${escapeHtml(f.error)}</li>`)
          .join('');
        const alertHtml = renderTemplate(ALERT_FAILURE_TEMPLATE, {
          sent,
          failed: failures.length,
          users: selectedJobs.length,
          events: eventsCount,
          lookahead_days: lookaheadDays,
          failures_list: failuresList,
        });
        try {
          await resend.emails.send({
            from: RESEND_FROM,
            to: [REMINDER_ALERT_EMAIL],
            subject: `Reminder cron partial failure (${failures.length} failed)`,
            html: alertHtml,
          });
        } catch (alertError) {
          console.error('Failed to send reminder alert email', alertError);
        }
      }

      return new Response(JSON.stringify({ ...summary, failures }), { status: 207 });
    }

    return new Response(JSON.stringify(summary), { status: 200 });
  } catch (err) {
    console.error('Function error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
