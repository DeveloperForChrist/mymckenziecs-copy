Email templates and senders

Placeholders in templates use {{key}} syntax (e.g. {{name}}, {{action_url}}).

Production source of truth
- Production reminder emails are sent by the Supabase Edge Function at `supabase/functions/cron-deadline-reminders/index.ts`.
- The scheduled cron job calls the edge endpoint directly (`...functions.supabase.co/cron-deadline-reminders?...`).
- The legacy Next.js cron route has been retired to keep one reminder path.
- Production reminder templates now live with the edge function at `supabase/functions/cron-deadline-reminders/templates.ts`.
- The HTML files under `src/emails/templates/deadline-*.html` are local/template assets and are not used by the live Supabase cron renderer.
- If you need to change what production reminder emails look like, update and deploy the edge function.

Env vars required:
- RESEND_API_KEY
- FROM_EMAIL (e.g. noreply@yourdomain)
- RESEND_ALERT_FROM_EMAIL (e.g. alerts@yourdomain)

Reminder edge function tuning (optional):
- REMINDER_SEND_CONCURRENCY (default: 5, range: 1-20)
- REMINDER_FETCH_PAGE_SIZE (default: 1000, range: 100-5000)
- REMINDER_MAX_RETRY_ATTEMPTS (default: 3, range: 1-10)
- REMINDER_ALERT_EMAIL (recipient for internal failure alerts)
- REMINDER_DAY_OFFSETS (default: `21,14,7,5,3,1`)

Reminder edge function sharding (optional query params):
- `bucket_count` (default: 1) splits users into deterministic buckets.
- `bucket_index` (default: 0) processes only one bucket in this run.
- `max_users` (default: 0) caps sends per run after bucket selection.
- Failed sends are eligible for retry in later buckets on the same `run_date` (via `reminder_delivery_state`).
- Sent users are idempotent per `(user_id, run_date)` and skipped on reruns.
- Example staggered schedule:
  - `09:00`: `...?days=21&bucket_count=3&bucket_index=0&max_users=400`
  - `11:00`: `...?days=21&bucket_count=3&bucket_index=1&max_users=400`
  - `12:00`: `...?days=21&bucket_count=3&bucket_index=2&max_users=400`
  - `15:00` catch-up: `...?days=21&bucket_count=1&bucket_index=0&max_users=400`

Usage:
- Load a template file and replace placeholders with values.
- Use `resendSender.send()` to dispatch.

Examples:

Single send (Resend SDK):
```ts
import { Resend } from 'resend';
import { renderTemplate } from './resendSender';
const resend = new Resend(process.env.RESEND_API_KEY);
const html = renderTemplate('src/emails/templates/deadline-3days.html', { name: 'Alex', case_title: 'State v. Smith', deadline_title: 'Motion to Dismiss Due', deadline_time: '09:00', deadline_notes: 'Draft ready; need final review.', deadline_priority: 'medium', deadline_date: '2026-03-01', days_left: '21', action_url: 'https://app...' });
await resend.emails.send({ from: process.env.FROM_EMAIL, to: 'user@example.com', subject: '3 weeks until deadline', html });
```

Batch send example (Resend batch API):
```ts
await resend.batch.send([
	{ from: process.env.FROM_EMAIL, to: ['a@ex.com'], subject: 'Welcome', html: '<p>hi</p>' },
	{ from: process.env.FROM_EMAIL, to: ['b@ex.com'], subject: 'Welcome', html: '<p>hi</p>' },
]);
```

There is an example file at `src/emails/examples/sendExamples.ts` demonstrating both single and batch sends.

Scheduler
 - A scheduler example script is included at `src/emails/scheduler/sendDeadlineReminders.js`.
 - It reads deadlines from a JSON file (default `src/emails/scheduler/deadlines.example.json` or set `DEADLINES_FILE`).
 - It will send reminders at the following offsets before a deadline: 21, 14, 7, 5, 3, 1 days. Templates used are `deadline-3weeks.html`, `deadline-2weeks.html`, `deadline-1week.html`, `deadline-5days.html`, `deadline-3days.html`, `deadline-1day.html`.

Dry-run / testing
 - If `RESEND_API_KEY` is not set the script runs in dry-run mode and prints what it would send.

Run once:
```bash
node src/emails/scheduler/sendDeadlineReminders.js
```

Run daily with cron (example runs at 08:00 UTC every day):
```cron
0 8 * * * cd /home/jcwiththelord/mymckenzie-nextjs2 && /usr/bin/env node src/emails/scheduler/sendDeadlineReminders.js >> /var/log/deadline-scheduler.log 2>&1
```

Automatic run
- Use the Supabase scheduled function flow below for automated reminders.

Supabase Scheduled Function
- Use Supabase Functions scheduling and schedule `supabase/functions/cron-deadline-reminders/index.ts` in the Supabase Dashboard.

Quick steps:
1. Install & login to Supabase CLI: `npm i -g supabase && supabase login`.
2. Create a function folder: `supabase/functions/cron-deadline-reminders` and add the `index.ts` file (an example is included at `supabase/functions/cron-deadline-reminders/index.ts`).
3. Set required environment variables in Supabase project: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_ALERT_FROM_EMAIL`.
4. Deploy the function: `supabase functions deploy cron-deadline-reminders --project-ref <your-project-ref>`.
5. In the Supabase Dashboard go to Functions > Schedules and add a schedule (cron expression) pointing to the function. Set the schedule to run daily or as needed.

Notes:
- The provided function uses the Supabase service role key to read `calendar_events` and the Resend SDK to send emails.
- Using Supabase native scheduling keeps everything in one platform and avoids cross-service secrets.


Install helpers (example):
```bash
npm install resend
```
