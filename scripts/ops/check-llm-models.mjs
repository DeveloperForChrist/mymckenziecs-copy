#!/usr/bin/env node

import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
for (const file of ['.env.local', '.env']) {
  const filePath = path.join(cwd, file)
  if (existsSync(filePath)) loadEnv({ path: filePath, override: false })
}

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim()

const unique = (items) => Array.from(new Set(items.filter(Boolean).map((v) => String(v).trim()).filter(Boolean)))

const openAiModels = unique([
  process.env.OPENAI_BASIC_MODEL,
  process.env.OPENAI_BASIC_FALLBACK_MODEL,
  process.env.OPENAI_PREMIUM_MODEL,
  process.env.OPENAI_PREMIUM_FALLBACK_MODEL,
  process.env.OPENAI_CHAT_MODEL,
  process.env.OPENAI_CHAT_FALLBACK_MODEL,
])

const groqModels = unique([
  process.env.BASIC_GROQ_MODEL,
  process.env.BASIC_GROQ_FALLBACK_MODEL,
  process.env.GROQ_BASIC_MODEL,
  process.env.GROQ_BASIC_FALLBACK_MODEL,
])

const shorten = (value, max = 140) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

async function checkOpenAiModel(model) {
  const normalized = model.toLowerCase()
  const payload = {
    model,
    messages: [{ role: 'user', content: 'Reply with OK.' }],
  }
  if (normalized.startsWith('o') || normalized.startsWith('gpt-5')) {
    payload.max_completion_tokens = 12
  } else {
    payload.max_tokens = 12
    payload.temperature = 0
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${shorten(body)}`)
  }
}

async function checkGroqModel(model) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 12,
      temperature: 0,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${shorten(body)}`)
  }
}

const checks = []
if (OPENAI_API_KEY) {
  for (const model of [...openAiModels, process.env.PREMIUM_PLUS_OPENAI_MODEL, process.env.PREMIUM_PLUS_OPENAI_FALLBACK_MODEL].filter(Boolean)) {
    checks.push({ provider: 'openai', model, run: () => checkOpenAiModel(model) })
  }
}
if (GROQ_API_KEY) {
  for (const model of groqModels) checks.push({ provider: 'groq', model, run: () => checkGroqModel(model) })
}

if (checks.length === 0) {
  console.log('No provider keys/models found in env. Nothing to check.')
  process.exit(0)
}

console.log('LLM provider/model health check')
console.log(`- checks: ${checks.length}`)

let hasFailure = false
for (const check of checks) {
  const label = `[${check.provider}] ${check.model}`
  const startedAt = Date.now()
  try {
    await check.run()
    console.log(`PASS ${label} (${Date.now() - startedAt}ms)`)
  } catch (error) {
    hasFailure = true
    const msg = error instanceof Error ? error.message : String(error)
    console.log(`FAIL ${label} (${Date.now() - startedAt}ms) -> ${shorten(msg)}`)
  }
}

if (hasFailure) {
  process.exit(1)
}

console.log('All configured models responded successfully.')
