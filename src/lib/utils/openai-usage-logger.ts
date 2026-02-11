// Simple OpenAI usage logger for admin panel integration
import { estimateOpenAICost, logApiUsage } from './api-usage-logger'
import fs from 'fs'
import path from 'path'

const LOG_PATH = path.join(process.cwd(), 'data/logs/openai-usage.log.jsonl')

export async function logOpenAIUsage(entry: {
  model: string
  usage: any
  messages: any
  timestamp: string
  success: boolean
  error?: string
}) {
  const costUsd = estimateOpenAICost(entry.model, entry.usage)
  const logEntry = JSON.stringify({ ...entry, costUsd })

  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
    fs.appendFileSync(LOG_PATH, logEntry + '\n', { encoding: 'utf8' })
  } catch {
    // Fails silently to avoid breaking app
  }

  void logApiUsage({
    provider: 'openai',
    endpoint: 'chat.completions',
    model: entry.model,
    requestType: 'chat',
    success: entry.success,
    promptTokens: entry.usage?.prompt_tokens,
    completionTokens: entry.usage?.completion_tokens,
    totalTokens: entry.usage?.total_tokens,
    costUsd,
    error: entry.error,
    metadata: {
      messagesCount: Array.isArray(entry.messages) ? entry.messages.length : undefined,
    },
    createdAt: entry.timestamp,
  })
}
