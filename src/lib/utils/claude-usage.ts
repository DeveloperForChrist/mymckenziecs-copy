import { estimateAnthropicCost, logApiUsage } from './api-usage-logger'

type ClaudeUsageInput = {
  model: string
  usage?: any
  success: boolean
  latencyMs?: number
  error?: string
  requestType?: string
  endpoint?: string
}

export const logClaudeUsage = (input: ClaudeUsageInput) => {
  const costUsd = estimateAnthropicCost(input.model, input.usage)
  const inputTokens = input.usage?.input_tokens ?? input.usage?.inputTokens
  const outputTokens = input.usage?.output_tokens ?? input.usage?.outputTokens
  const totalTokens =
    typeof inputTokens === 'number' && typeof outputTokens === 'number'
      ? inputTokens + outputTokens
      : undefined

  void logApiUsage({
    provider: 'anthropic',
    endpoint: input.endpoint || 'messages.create',
    model: input.model,
    requestType: input.requestType || 'chat',
    success: input.success,
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens,
    costUsd,
    latencyMs: input.latencyMs,
    error: input.error,
  })
}
