#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);

const getArg = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) return fallback;
  return v;
};

const toInt = (value, fallback) => {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const baseUrl = getArg('base-url', process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const target = getArg('target', 'chat').toLowerCase();
const seconds = toInt(getArg('seconds', process.env.LOAD_TEST_SECONDS || '30'), 30);
const concurrency = toInt(getArg('concurrency', process.env.LOAD_TEST_CONCURRENCY || '20'), 20);
const timeoutMs = toInt(getArg('timeout-ms', process.env.LOAD_TEST_TIMEOUT_MS || '15000'), 15000);
const authCookie = getArg('auth-cookie', process.env.LOAD_TEST_AUTH_COOKIE || '');
const rotateIp = getArg('rotate-ip', process.env.LOAD_TEST_ROTATE_IP || '0') === '1';
const chatPromptMode = getArg('chat-prompt', process.env.LOAD_TEST_CHAT_PROMPT || 'support').toLowerCase();

const percentile = (sorted, p) => {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};

const randomIp = () => {
  const a = 10 + Math.floor(Math.random() * 200);
  const b = 1 + Math.floor(Math.random() * 254);
  const c = 1 + Math.floor(Math.random() * 254);
  const d = 1 + Math.floor(Math.random() * 254);
  return `${a}.${b}.${c}.${d}`;
};

const buildRequest = (mode) => {
  const forwardedHeaders = rotateIp ? { 'x-forwarded-for': randomIp(), 'x-real-ip': randomIp() } : {};

  if (mode === 'plan') {
    return {
      url: `${baseUrl}/api/user/plan`,
      init: {
        method: 'GET',
        headers: {
          ...forwardedHeaders,
          ...(authCookie ? { cookie: authCookie } : {}),
          'cache-control': 'no-store',
        },
      },
    };
  }

  if (mode === 'documents') {
    return {
      url: `${baseUrl}/api/documents?limit=25&offset=0`,
      init: {
        method: 'GET',
        headers: {
          ...forwardedHeaders,
          ...(authCookie ? { cookie: authCookie } : {}),
          'cache-control': 'no-store',
        },
      },
    };
  }

  const conversationId = `load-${crypto.randomUUID()}`;
  const chatMessage =
    chatPromptMode === 'full'
      ? 'Give me a short legal guidance summary in one sentence.'
      : 'I need billing support. How do I contact support?';

  return {
    url: `${baseUrl}/api/chat`,
    init: {
      method: 'POST',
      headers: {
        ...forwardedHeaders,
        'content-type': 'application/json',
        ...(authCookie ? { cookie: authCookie } : {}),
      },
      body: JSON.stringify({
        message: chatMessage,
        history: [],
        conversationId,
      }),
    },
  };
};

const pickMode = () => {
  if (target !== 'mixed') return target;
  if (!authCookie) return 'chat';
  const modes = ['chat', 'plan', 'documents'];
  const idx = Math.floor(Math.random() * modes.length);
  return modes[idx];
};

const shouldSkipAuthTarget = (mode) => (mode === 'plan' || mode === 'documents') && !authCookie;

const run = async () => {
  const endAt = Date.now() + seconds * 1000;
  const latencies = [];
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  const statusCounts = new Map();

  const worker = async () => {
    while (Date.now() < endAt) {
      const mode = pickMode();
      if (shouldSkipAuthTarget(mode)) {
        skipped += 1;
        continue;
      }

      const { url, init } = buildRequest(mode);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = performance.now();

      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        const ms = performance.now() - started;
        latencies.push(ms);
        const key = String(res.status);
        statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
        if (res.ok) ok += 1;
        else failed += 1;
        await res.arrayBuffer();
      } catch {
        failed += 1;
        statusCounts.set('ERR', (statusCounts.get('ERR') || 0) + 1);
      } finally {
        clearTimeout(timer);
      }
    }
  };

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedMs = performance.now() - startedAt;

  const total = ok + failed;
  const sorted = [...latencies].sort((a, b) => a - b);
  const rps = elapsedMs > 0 ? (total / elapsedMs) * 1000 : 0;
  const errorRate = total > 0 ? (failed / total) * 100 : 0;

  console.log('Load test result');
  console.log(`- baseUrl: ${baseUrl}`);
  console.log(`- target: ${target}`);
  console.log(`- duration_s: ${seconds}`);
  console.log(`- concurrency: ${concurrency}`);
  console.log(`- rotate_ip: ${rotateIp ? 'enabled' : 'disabled'}`);
  console.log(`- chat_prompt: ${chatPromptMode}`);
  console.log(`- total_requests: ${total}`);
  console.log(`- ok: ${ok}`);
  console.log(`- failed: ${failed}`);
  console.log(`- skipped: ${skipped}`);
  console.log(`- rps: ${rps.toFixed(2)}`);
  console.log(`- error_rate_pct: ${errorRate.toFixed(2)}`);
  if (sorted.length > 0) {
    const mean = sorted.reduce((acc, n) => acc + n, 0) / sorted.length;
    console.log(`- latency_ms_p50: ${percentile(sorted, 50).toFixed(2)}`);
    console.log(`- latency_ms_p95: ${percentile(sorted, 95).toFixed(2)}`);
    console.log(`- latency_ms_p99: ${percentile(sorted, 99).toFixed(2)}`);
    console.log(`- latency_ms_mean: ${mean.toFixed(2)}`);
    console.log(`- latency_ms_max: ${sorted[sorted.length - 1].toFixed(2)}`);
  }
  console.log(`- status_counts: ${JSON.stringify(Object.fromEntries(statusCounts), null, 0)}`);

  if (total === 0) {
    console.error('No requests were executed.');
    process.exit(1);
  }
};

run().catch((error) => {
  console.error('Load test failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
