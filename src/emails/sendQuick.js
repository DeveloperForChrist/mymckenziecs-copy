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

async function sendQuick() {
  const body = {
    from: FROM,
    to: ['anyanwujordan@gmail.com'],
    subject: 'Hello Jordan',
    html: '<p>Hello Jordan</p>',
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

sendQuick().catch((err) => { console.error(err); process.exit(1); });
