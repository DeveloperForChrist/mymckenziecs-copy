#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

function loadLocalEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const k = trimmed.slice(0, idx);
    let v = trimmed.slice(idx + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

const env = loadLocalEnv(path.join(__dirname, '..', '..', '.env.local'));
const RESEND_KEY = process.env.RESEND_API_KEY || env.RESEND_API_KEY || '';
const RAW_FROM = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || env.RESEND_FROM_EMAIL || env.FROM_EMAIL || 'noreply@mymckenziecs.com';
const FROM_NAME = process.env.RESEND_FROM_NAME || env.RESEND_FROM_NAME || 'MymckenzieCS';
const FROM = RAW_FROM.includes('<') ? RAW_FROM : `${FROM_NAME} <${RAW_FROM}>`;

if (!RESEND_KEY) {
  console.error('No RESEND_API_KEY found in environment or .env.local — aborting.');
  process.exit(2);
}

function renderTemplate(templatePath, vars) {
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) html = html.split(`{{${k}}}`).join(v);
  return html;
}

async function send() {
  const templatePath = path.join(__dirname, 'templates', 'deadline-3days.html');
  const vars = {
    name: 'Anyanwu Jordan',
    case_title: 'State v. Example',
    deadline_title: 'Opposition Brief Due',
    deadline_time: '16:00',
    deadline_notes: 'Finalize exhibits and file before close of business.',
    deadline_priority: 'high',
    deadline_date: '2026-03-01',
    days_left: '3',
    action_url: 'https://www.mymckenziecs.com/cases/123',
  };
  const html = renderTemplate(templatePath, vars);
  const body = {
    from: FROM,
    to: ['anyanwujordan@gmail.com'],
    subject: `Reminder: 3 days until ${vars.deadline_title}`,
    html,
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  console.log('Send response:', json);
}

send().catch((err) => { console.error(err); process.exit(1); });
