#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const RESEND_API = 'https://api.resend.com/emails';
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const RAW_FROM = process.env.RESEND_ALERT_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || 'alerts@mymckenziecs.com';
const FROM_NAME = process.env.RESEND_ALERT_FROM_NAME || process.env.RESEND_FROM_NAME || 'MymckenzieCS';
const FROM = RAW_FROM.includes('<') ? RAW_FROM : `${FROM_NAME} <${RAW_FROM}>`;

const templatesDir = path.join(__dirname, '..', 'templates');
const deadlinesFile = process.env.DEADLINES_FILE || path.join(__dirname, 'deadlines.example.json');

const offsets = [21, 14, 7, 5, 3, 1];
const templateMap = {
  21: 'deadline-3weeks.html',
  14: 'deadline-2weeks.html',
  7: 'deadline-1week.html',
  5: 'deadline-5days.html',
  3: 'deadline-3days.html',
  1: 'deadline-1day.html',
};

function renderTemplate(templatePath, vars) {
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) html = html.split(`{{${k}}}`).join(v);
  return html;
}

async function sendEmail({ to, subject, html }) {
  if (!RESEND_KEY) {
    console.log('[dry-run] send to', to, 'subject', subject);
    return { status: 'dry-run', to, subject };
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  const body = await res.json();
  return body;
}

function startOfDayInTZ(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const y = get('year');
  const m = get('month');
  const d = get('day');
  return new Date(`${y}-${m}-${d}T00:00:00`);
}

function daysUntil(dateStr) {
  const tz = 'Europe/London';
  const today = startOfDayInTZ(new Date(), tz);
  const d = startOfDayInTZ(new Date(`${dateStr}T00:00:00`), tz);
  const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
  return diff;
}

async function run() {
  if (!fs.existsSync(deadlinesFile)) {
    console.error('Deadlines file not found:', deadlinesFile);
    process.exit(2);
  }

  const raw = fs.readFileSync(deadlinesFile, 'utf8');
  let entries = [];
  try { entries = JSON.parse(raw); } catch (e) { console.error('Invalid JSON in deadlines file'); process.exit(2); }

  for (const e of entries) {
    const { recipient, name, case_title, deadline_date, action_url } = e;
    const deadline_title = e.title || e.deadline_title || e.deadline_name || case_title || 'Deadline';
    const deadline_time = e.time || e.deadline_time || 'Not set';
    const deadline_notes = e.notes || e.deadline_notes || '—';
    const deadline_priority = e.priority || e.deadline_priority || 'medium';
    const days = daysUntil(deadline_date);
    if (offsets.includes(days)) {
      const templateFile = templateMap[days];
      const templatePath = path.join(templatesDir, templateFile);
      if (!fs.existsSync(templatePath)) {
        console.warn('Template missing:', templatePath);
        continue;
      }

      const vars = {
        name: name || '',
        deadline_title,
        deadline_date,
        deadline_time,
        deadline_notes,
        deadline_priority,
        days_left: String(days),
        action_url,
      };
      const html = renderTemplate(templatePath, vars);
      const subject = `Reminder: ${days} day(s) until ${deadline_title}`;
      console.log('Sending reminder:', recipient, 'days:', days, 'template:', templateFile);
      const res = await sendEmail({ to: recipient, subject, html });
      console.log('Send result:', res);
    } else {
      console.log('No reminder for', e.id || e.case_title, 'days until:', days);
    }
  }
}

if (require.main === module) {
  run().catch((err) => { console.error(err); process.exit(1); });
}
