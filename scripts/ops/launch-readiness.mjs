#!/usr/bin/env node

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const cwd = process.cwd();
const envFiles = ['.env.local', '.env'];

for (const file of envFiles) {
  const filePath = path.join(cwd, file);
  if (existsSync(filePath)) {
    loadEnv({ path: filePath, override: false });
  }
}

const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--skip-build');
const withTests = args.has('--with-tests');

const requiredEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'OPENAI_CHAT_MODEL',
  'OPENAI_PREMIUM_PLUS_MODEL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_STRIPE_BASIC_PRICE_ID',
  'NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID',
  'NEXT_PUBLIC_STRIPE_PREMIUM_PLUS_PRICE_ID',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_ALERT_FROM_EMAIL',
  'SUPPORT_EMAIL',
];

const placeholderPatterns = [
  /^your_/i,
  /changeme/i,
  /example\.com/i,
];

const missing = [];
const placeholders = [];

for (const key of requiredEnv) {
  const raw = process.env[key];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    missing.push(key);
    continue;
  }
  if (placeholderPatterns.some((pattern) => pattern.test(value))) {
    placeholders.push(key);
  }
}

const run = (cmd, argsList) => {
  const label = `${cmd} ${argsList.join(' ')}`.trim();
  console.log(`\n> ${label}`);
  const result = spawnSync(cmd, argsList, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });
  return result.status === 0;
};

let ok = true;

console.log('Launch readiness check');
console.log(`- cwd: ${cwd}`);
console.log(`- build: ${skipBuild ? 'skipped' : 'enabled'}`);
console.log(`- tests: ${withTests ? 'enabled' : 'skipped'}`);

if (missing.length > 0) {
  ok = false;
  console.error('\nMissing required env vars:');
  for (const key of missing) console.error(`- ${key}`);
}

if (placeholders.length > 0) {
  ok = false;
  console.error('\nEnv vars still look like placeholders:');
  for (const key of placeholders) console.error(`- ${key}`);
}

ok = run('npm', ['run', 'type-check']) && ok;
ok = run('npm', ['run', 'lint', '--', '--quiet']) && ok;

if (!skipBuild) {
  ok = run('npm', ['run', 'build', '--', '--webpack']) && ok;
}

if (withTests) {
  ok = run('npm', ['run', 'test']) && ok;
}

if (!ok) {
  console.error('\nLaunch readiness check failed.');
  process.exit(1);
}

console.log('\nLaunch readiness check passed.');
