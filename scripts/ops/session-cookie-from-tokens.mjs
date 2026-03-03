#!/usr/bin/env node

import { createServerClient } from '@supabase/ssr';

const argv = process.argv.slice(2);

const getArg = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) return fallback;
  return v;
};

const accessToken = getArg('access-token');
const refreshToken = getArg('refresh-token');
const supabaseUrl = getArg('supabase-url', process.env.NEXT_PUBLIC_SUPABASE_URL || '');
const anonKey = getArg('anon-key', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

if (!accessToken || !refreshToken) {
  console.error('Both --access-token and --refresh-token are required.');
  process.exit(1);
}

if (!supabaseUrl || !anonKey) {
  console.error('Missing Supabase URL or anon key.');
  process.exit(1);
}

/** @type {Array<{name: string, value: string}>} */
let cookieJar = [];

const upsertCookie = (name, value) => {
  const idx = cookieJar.findIndex((c) => c.name === name);
  if (idx === -1) cookieJar.push({ name, value });
  else cookieJar[idx] = { name, value };
};

const supabase = createServerClient(supabaseUrl, anonKey, {
  cookies: {
    getAll() {
      return cookieJar;
    },
    setAll(cookiesToSet) {
      for (const cookie of cookiesToSet) {
        upsertCookie(cookie.name, cookie.value || '');
      }
    },
  },
});

const { error } = await supabase.auth.setSession({
  access_token: accessToken,
  refresh_token: refreshToken,
});

if (error) {
  console.error(`Failed to set session: ${error.message}`);
  process.exit(1);
}

const cookieHeader = cookieJar
  .filter((cookie) => cookie.value)
  .map((cookie) => `${cookie.name}=${cookie.value}`)
  .join('; ');

if (!cookieHeader) {
  console.error('No auth cookies were generated.');
  process.exit(1);
}

process.stdout.write(cookieHeader);
