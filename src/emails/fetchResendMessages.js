#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i);
    let v = t.slice(i+1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1,-1);
    env[k] = v;
  }
  return env;
}

async function main() {
  const env = loadEnv(path.join(__dirname, '..', '..', '.env.local'));
  const RESEND_KEY = process.env.RESEND_API_KEY || env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.error('RESEND_API_KEY not found in .env.local');
    process.exit(2);
  }

  const recipient = process.argv[2] || 'anyanwujordan@gmail.com';
  const limit = 50;
  const q = `limit=${limit}`;
  const url = `https://api.resend.com/emails?${q}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${RESEND_KEY}` } });
  if (!res.ok) {
    console.error('Failed to fetch messages', res.status, await res.text());
    process.exit(3);
  }
  const json = await res.json();
  if (!Array.isArray(json) || json.length === 0) {
    console.log('No messages returned from Resend API');
    return;
  }

  const filtered = json.filter((m) => {
    try {
      const tos = m.to || [];
      return tos.some((t) => String(t).includes(recipient));
    } catch (e) { return false; }
  });

  if (filtered.length === 0) {
    console.log('No messages found for', recipient);
    return;
  }

  for (const m of filtered) {
    console.log('---');
    console.log('id:', m.id);
    console.log('to:', JSON.stringify(m.to));
    console.log('subject:', m.subject);
    console.log('status:', m.status);
    console.log('created_at:', m.created_at);
  }

  const first = filtered[0];
  if (first && first.html) {
    const out = path.join('/tmp', `resend_${first.id}.html`);
    fs.writeFileSync(out, first.html, 'utf8');
    console.log('Saved HTML to', out);
  } else {
    console.log('No HTML content available on first matched message');
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });
