Email templates and senders

Placeholders in templates use {{key}} syntax (e.g. {{name}}, {{action_url}}).

Env vars required:
- RESEND_API_KEY
- FROM_EMAIL (e.g. noreply@yourdomain)
- RESEND_ALERT_FROM_EMAIL (e.g. alerts@yourdomain)

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

Automatic server run via GitHub Actions
- A GitHub Actions workflow is included at `.github/workflows/deadline-reminders-cron.yml` which calls the server endpoint daily at 08:00 UTC.

Required repository secrets:
- `SITE_URL` — the public base URL of your deployed site (e.g. `https://www.mymckenziecs.com`).
- `CRON_SECRET` — secret string that matches `CRON_SECRET` env var used by the server (set in your deployment environment).

To enable automatic reminders:
1. Deploy your app and set `CRON_SECRET` in the deployment environment (same value in GitHub Actions secrets).
2. Add `SITE_URL` and `CRON_SECRET` to the repository secrets.
3. The workflow can be manually triggered from Actions or will run on schedule.

Supabase Scheduled Function (recommended if you use Supabase)
- Instead of GitHub Actions you can use Supabase Functions scheduling. Create an Edge Function that performs the same logic as `src/app/api/cron/deadline-reminders/route.ts` and schedule it in the Supabase Dashboard.

Quick steps:
1. Install & login to Supabase CLI: `npm i -g supabase && supabase login`.
2. Create a function folder: `supabase/functions/cron-deadline-reminders` and add the `index.ts` file (an example is included at `supabase/functions/cron-deadline-reminders/index.ts`).
3. Set required environment variables in Supabase project: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_ALERT_FROM_EMAIL`.
4. Deploy the function: `supabase functions deploy cron-deadline-reminders --project-ref <your-project-ref>`.
5. In the Supabase Dashboard go to Functions > Schedules and add a schedule (cron expression) pointing to the function. Set the schedule to run daily or as needed.

Notes:
- The provided function uses the Supabase service role key to read `calendar_events` and the Resend SDK to send emails. It sends the same consolidated per-user reminder that the server route produces.
- Using Supabase native scheduling keeps everything in one platform and avoids cross-service secrets.


Install helpers (example):
```bash
npm install resend postmark
```
