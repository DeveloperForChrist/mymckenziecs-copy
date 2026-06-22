
type ApiUsageEntry = {
  provider: string
  endpoint?: string
  model?: string
  requestType?: string
  success: boolean
  statusCode?: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costUsd?: number | null
  latencyMs?: number
  userId?: string | null
  error?: string
  metadata?: Record<string, unknown>
  createdAt?: string
}

export type AnthropicUsageLike = {
  input_tokens?: number
  inputTokens?: number
  output_tokens?: number
  outputTokens?: number
}

const toUsageValue = (value: unknown): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export const estimateAnthropicCost = (model: string, usage?: AnthropicUsageLike | null) => {
  if (!usage) return null
  const input = toUsageValue(usage.input_tokens ?? usage.inputTokens)
  const output = toUsageValue(usage.output_tokens ?? usage.outputTokens)

  let inputRate = Number(process.env.ANTHROPIC_COST_PER_1K_INPUT_TOKENS || 0)
  let outputRate = Number(process.env.ANTHROPIC_COST_PER_1K_OUTPUT_TOKENS || 0)

  const overridesRaw = process.env.ANTHROPIC_COST_OVERRIDES
  if (overridesRaw) {
    try {
      const overrides = JSON.parse(overridesRaw) as Record<
        string,
        { input?: number; output?: number }
      >
      const modelOverride = overrides?.[model]
      if (modelOverride?.input) inputRate = Number(modelOverride.input)
      if (modelOverride?.output) outputRate = Number(modelOverride.output)
    } catch {
      // ignore invalid overrides
    }
  }

  if (!inputRate && !outputRate) return null
  const cost = (input / 1000) * inputRate + (output / 1000) * outputRate
  return Number.isFinite(cost) ? Number(cost.toFixed(6)) : null
}

export async function logApiUsage(entry: ApiUsageEntry) {
  const payload = {
    provider: entry.provider,
    endpoint: entry.endpoint,
    model: entry.model,
    request_type: entry.requestType,
    success: entry.success,
    status_code: entry.statusCode,
    prompt_tokens: entry.promptTokens,
    completion_tokens: entry.completionTokens,
    total_tokens: entry.totalTokens,
    cost_usd: entry.costUsd,
    latency_ms: entry.latencyMs,
    user_id: entry.userId,
    error: entry.error,
    metadata: entry.metadata,
    created_at: entry.createdAt || new Date().toISOString(),
  }

  try {
    const { supabaseAdmin } = await import('@/lib/database/supabase-server')
    await supabaseAdmin.from('api_usage').insert(payload)
  } catch {
    // ignore supabase logging failures
  }
}
