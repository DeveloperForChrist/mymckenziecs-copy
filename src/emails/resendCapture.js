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
  const RAW_FROM = process.env.RESEND_FROM_EMAIL || env.RESEND_FROM_EMAIL || 'noreply@mymckenziecs.com';
  const FROM_NAME = process.env.RESEND_FROM_NAME || env.RESEND_FROM_NAME || 'MyMcKenzieCS';
  const FROM = RAW_FROM.includes('<') ? RAW_FROM : `${FROM_NAME} <${RAW_FROM}>`;
  if (!RESEND_KEY) { console.error('RESEND_API_KEY missing'); process.exit(2); }

  const htmlPath = process.argv[2] || '/tmp/rendered_deadline.html';
  if (!fs.existsSync(htmlPath)) { console.error('Rendered HTML not found at', htmlPath); process.exit(3); }
  const html = fs.readFileSync(htmlPath, 'utf8');

  const to = process.argv[3] || 'anyanwujordan@gmail.com';
  const body = { from: FROM, to: [to], subject: `Test: upcoming deadlines`, html };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  console.log('Resend response:', JSON.stringify(j, null, 2));
}

main().catch((e)=>{ console.error(e); process.exit(1); });
