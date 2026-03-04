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
  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
  const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || `https://temciymgzjfgxvynfugm.supabase.co`;
  if (!SERVICE_KEY) { console.error('Service role key missing in .env.local'); process.exit(2); }

  const lookahead = Number(process.argv[2] || 7);
  const now = new Date();
  const start = now.toISOString();
  const end = new Date(now.getTime() + lookahead * 24 * 60 * 60 * 1000).toISOString();

  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // fetch events in range
  const q = `/rest/v1/calendar_events?select=id,user_id,title,notes,time,date,category,priority&date=gte.${encodeURIComponent(start)}&date=lte.${encodeURIComponent(end)}&category=eq.deadline&order=date.asc`;
  const eventsRes = await fetch(`${SUPABASE_URL}${q}`, { headers });
  const events = await eventsRes.json();
  if (!Array.isArray(events) || events.length === 0) { console.log('No events in range'); return; }

  // pick first user
  const userId = events[0].user_id;
  const userRes = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id,email,name&eq=id,${encodeURIComponent(userId)}&limit=1`, { headers });
  const users = await userRes.json();
  const user = users && users[0];
  const list = events.filter(e => e.user_id === userId);

  function escapeHtml(input) {
    return String(input || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const rowsHtml = list.map((ev) => {
    const d = new Date(ev.date);
    const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' });
    const timeLabel = ev.time ? ` ${String(ev.time).slice(0,5)}` : '';
    const notesHtml = ev.notes ? `<div style="color:#6b7280; font-size:12px; margin-top:4px;">${escapeHtml(ev.notes)}</div>` : '';
    return `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
          <div style="font-weight:700; color:#111827;">${escapeHtml(ev.title)}</div>
          <div style="color:#374151; font-size:13px;">${dateLabel}${timeLabel}</div>
          ${notesHtml}
        </td>
      </tr>`;
  }).join('');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color:#4c1d95;">Upcoming deadlines (next ${lookahead} days)</h2>
      <p>Hi${user && user.name ? ` ${escapeHtml(user.name)}` : ''},</p>
      <p>Here are your upcoming deadlines:</p>
      <table style="width:100%; border-collapse:collapse;">${rowsHtml}</table>
      <p style="margin-top:18px; color:#6b7280; font-size:12px;">MyMcKenzieCS</p>
    </div>`;

  const out = path.join('/tmp', 'rendered_deadline.html');
  fs.writeFileSync(out, htmlBody, 'utf8');
  console.log('Wrote rendered email to', out);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
