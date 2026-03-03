type ErrorContext = {
  component?: string
  route?: string
  userId?: string | null
  method?: string
  status?: number
  [key: string]: any
}

const DEFAULT_INGEST_URL = 'https://in.logs.betterstack.com'

const asError = (value: any): Error => {
  if (value instanceof Error) return value
  return new Error(typeof value === 'string' ? value : 'Unknown error')
}

const serializeError = (error: Error) => ({
  name: error.name,
  message: error.message,
  stack: error.stack || null,
})

const getIngestConfig = () => {
  const token = process.env.BETTER_STACK_SOURCE_TOKEN || ''
  const ingestUrl = process.env.BETTER_STACK_INGEST_URL || DEFAULT_INGEST_URL
  return { token: token.trim(), ingestUrl: ingestUrl.trim() }
}

export async function captureServerException(
  errorInput: any,
  context: ErrorContext = {}
) {
  const error = asError(errorInput)
  const payload = {
    level: 'error',
    timestamp: new Date().toISOString(),
    service: 'mymckenziecs-webapp',
    environment: process.env.NODE_ENV || 'development',
    error: serializeError(error),
    context,
  }

  // Always keep local logs for immediate debugging.
  console.error('[error-monitor]', payload)

  const { token, ingestUrl } = getIngestConfig()
  if (!token) return

  try {
    await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
  } catch (forwardError) {
    console.error('[error-monitor-forward-failed]', forwardError)
  }
}
