/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const fetch = require('node-fetch');
const path = require('path');

function loadEnv(envPath) {
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
  if (!SERVICE_KEY) throw new Error('service key not found in .env.local');

  const base = `https://${env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://','')||env.NEXT_PUBLIC_SUPABASE_URL}`;
  // fallback to known project domain
  const project = 'temciymgzjfgxvynfugm';
  const urlBase = `https://${project}.supabase.co`;

  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // 1) try to find an existing user by email
  const emailToFind = 'anyanwujordan@gmail.com';
  let userIdToUse = null;
  const rFind = await fetch(`${urlBase}/rest/v1/users?email=eq.${encodeURIComponent(emailToFind)}&select=id,email`, { headers });
  if (rFind.status === 200) {
    const found = await rFind.json();
    if (Array.isArray(found) && found.length > 0) {
      userIdToUse = found[0].id;
      console.log('found user by email', userIdToUse);
    }
  }
  if (!userIdToUse) {
    // try to pick any existing user
    const rAny = await fetch(`${urlBase}/rest/v1/users?select=id,email&limit=1`, { headers });
    if (rAny.status === 200) {
      const anyu = await rAny.json();
      if (Array.isArray(anyu) && anyu.length > 0) {
        userIdToUse = anyu[0].id;
        console.log('using existing user', userIdToUse, anyu[0].email);
      }
    }
  }

  if (!userIdToUse) {
    console.error('No existing users found in the database. Please create a user via the app or Supabase Auth and retry.');
    process.exit(1);
  }

  // 2) create calendar event 3 days from now
  const d = new Date(); d.setDate(d.getDate() + 3);
  const iso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
  const ev = { user_id: userIdToUse, title: 'Automated test deadline', notes: 'Inserted by assistant test', time: null, date: iso, category: 'deadline', priority: 'high', created_at: new Date().toISOString() };
  const r2 = await fetch(`${urlBase}/rest/v1/calendar_events`, { method: 'POST', headers, body: JSON.stringify(ev) });
  const j2 = await r2.text();
  console.log('create event status', r2.status, j2);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
