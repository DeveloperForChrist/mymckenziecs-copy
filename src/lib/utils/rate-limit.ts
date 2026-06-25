import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'

// In-memory rate limiting for development (when Upstash is not configured)
class InMemoryRateLimiter {
  private cache = new Map<string, { count: number; resetAt: number }>()

  async limit(identifier: string, tokens: number, windowMs: number) {
    const now = Date.now()
    const existing = this.cache.get(identifier)

    if (existing && existing.resetAt > now) {
      if (existing.count >= tokens) {
        return {
          success: false,
          limit: tokens,
          remaining: 0,
          reset: existing.resetAt,
        }
      }
      existing.count++
      return {
        success: true,
        limit: tokens,
        remaining: tokens - existing.count,
        reset: existing.resetAt,
      }
    }

    this.cache.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    })

    return {
      success: true,
      limit: tokens,
      remaining: tokens - 1,
      reset: now + windowMs,
    }
  }
}

// Create Redis client if credentials are available
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null

const PREMIUM_PROVIDER_GLOBAL_RPM = Number.isFinite(Number(process.env.PREMIUM_PROVIDER_GLOBAL_RPM))
  ? Math.max(1, Math.floor(Number(process.env.PREMIUM_PROVIDER_GLOBAL_RPM)))
  : 240
const PREMIUM_PROVIDER_QUEUE_WAIT_MS = Number.isFinite(Number(process.env.PREMIUM_PROVIDER_QUEUE_WAIT_MS))
  ? Math.max(0, Math.floor(Number(process.env.PREMIUM_PROVIDER_QUEUE_WAIT_MS)))
  : 250
const PREMIUM_PROVIDER_QUEUE_RETRIES = Number.isFinite(Number(process.env.PREMIUM_PROVIDER_QUEUE_RETRIES))
  ? Math.max(0, Math.floor(Number(process.env.PREMIUM_PROVIDER_QUEUE_RETRIES)))
  : 2
const CHAT_AI_MAX_IN_FLIGHT = Number.isFinite(Number(process.env.CHAT_AI_MAX_IN_FLIGHT))
  ? Math.max(1, Math.floor(Number(process.env.CHAT_AI_MAX_IN_FLIGHT)))
  : 120
const CHAT_AI_QUEUE_LIMIT = Number.isFinite(Number(process.env.CHAT_AI_QUEUE_LIMIT))
  ? Math.max(0, Math.floor(Number(process.env.CHAT_AI_QUEUE_LIMIT)))
  : 1_000
const CHAT_AI_QUEUE_TIMEOUT_MS = Number.isFinite(Number(process.env.CHAT_AI_QUEUE_TIMEOUT_MS))
  ? Math.max(0, Math.floor(Number(process.env.CHAT_AI_QUEUE_TIMEOUT_MS)))
  : 2_500
const ASSISTANT_FREE_CHAT_MESSAGE_LIMIT = Number.isFinite(Number(process.env.ASSISTANT_FREE_CHAT_MESSAGE_LIMIT))
  ? Math.max(1, Math.floor(Number(process.env.ASSISTANT_FREE_CHAT_MESSAGE_LIMIT)))
  : 8
const ASSISTANT_FREE_CHAT_COOLDOWN_SECONDS = Number.isFinite(Number(process.env.ASSISTANT_FREE_CHAT_COOLDOWN_MS))
  ? Math.max(60, Math.ceil(Number(process.env.ASSISTANT_FREE_CHAT_COOLDOWN_MS) / 1000))
  : 5 * 60 * 60
const ASSISTANT_PLUS_CHAT_DAILY_LIMIT = Number.isFinite(Number(process.env.ASSISTANT_PLUS_CHAT_DAILY_LIMIT))
  ? Math.max(1, Math.floor(Number(process.env.ASSISTANT_PLUS_CHAT_DAILY_LIMIT)))
  : 50
const ASSISTANT_PLUS_CHAT_MONTHLY_LIMIT = Number.isFinite(Number(process.env.ASSISTANT_PLUS_CHAT_MONTHLY_LIMIT))
  ? Math.max(1, Math.floor(Number(process.env.ASSISTANT_PLUS_CHAT_MONTHLY_LIMIT)))
  : 600
const ASSISTANT_PRO_CHAT_MONTHLY_LIMIT = Number.isFinite(Number(process.env.ASSISTANT_PRO_CHAT_MONTHLY_LIMIT))
  ? Math.max(1, Math.floor(Number(process.env.ASSISTANT_PRO_CHAT_MONTHLY_LIMIT)))
  : 5000
const ASSISTANT_PLUS_UPLOAD_DAILY_LIMIT = Number.isFinite(Number(process.env.ASSISTANT_PLUS_UPLOAD_DAILY_LIMIT))
  ? Math.max(1, Math.floor(Number(process.env.ASSISTANT_PLUS_UPLOAD_DAILY_LIMIT)))
  : 10
const ASSISTANT_PLUS_UPLOAD_MONTHLY_LIMIT = Number.isFinite(Number(process.env.ASSISTANT_PLUS_UPLOAD_MONTHLY_LIMIT))
  ? Math.max(1, Math.floor(Number(process.env.ASSISTANT_PLUS_UPLOAD_MONTHLY_LIMIT)))
  : 100
const ASSISTANT_PRO_UPLOAD_DAILY_LIMIT = Number.isFinite(Number(process.env.ASSISTANT_PRO_UPLOAD_DAILY_LIMIT))
  ? Math.max(1, Math.floor(Number(process.env.ASSISTANT_PRO_UPLOAD_DAILY_LIMIT)))
  : 75
const ASSISTANT_PRO_UPLOAD_MONTHLY_LIMIT = Number.isFinite(Number(process.env.ASSISTANT_PRO_UPLOAD_MONTHLY_LIMIT))
  ? Math.max(1, Math.floor(Number(process.env.ASSISTANT_PRO_UPLOAD_MONTHLY_LIMIT)))
  : 750

// Fallback to in-memory if Redis is not configured
const inMemoryLimiter = new InMemoryRateLimiter()

type LocalConcurrencyLease = {
  success: true
  active: number
  queuedMs: number
  release: () => void
}

type LocalConcurrencyRejection = {
  success: false
  active: number
  queued: number
  retryAfterMs: number
  reason: 'queue_full' | 'queue_timeout'
}

type QueuedConcurrencyRequest = {
  enqueuedAt: number
  resolve: (lease: LocalConcurrencyLease | LocalConcurrencyRejection) => void
  timeout: ReturnType<typeof setTimeout> | null
}

class LocalConcurrencyLimiter {
  private active = 0
  private queue: QueuedConcurrencyRequest[] = []

  constructor(
    private readonly maxActive: number,
    private readonly maxQueue: number,
    private readonly queueTimeoutMs: number
  ) {}

  acquire(): Promise<LocalConcurrencyLease | LocalConcurrencyRejection> {
    if (this.active < this.maxActive) {
      return Promise.resolve(this.createLease(Date.now()))
    }

    if (this.queue.length >= this.maxQueue || this.queueTimeoutMs <= 0) {
      return Promise.resolve(this.reject('queue_full'))
    }

    return new Promise((resolve) => {
      const request: QueuedConcurrencyRequest = {
        enqueuedAt: Date.now(),
        resolve,
        timeout: null,
      }

      request.timeout = setTimeout(() => {
        const index = this.queue.indexOf(request)
        if (index !== -1) this.queue.splice(index, 1)
        resolve(this.reject('queue_timeout'))
      }, this.queueTimeoutMs)

      this.queue.push(request)
    })
  }

  private createLease(enqueuedAt: number): LocalConcurrencyLease {
    this.active += 1
    let released = false

    return {
      success: true,
      active: this.active,
      queuedMs: Math.max(0, Date.now() - enqueuedAt),
      release: () => {
        if (released) return
        released = true
        this.active = Math.max(0, this.active - 1)
        this.drainQueue()
      },
    }
  }

  private reject(reason: LocalConcurrencyRejection['reason']): LocalConcurrencyRejection {
    return {
      success: false,
      active: this.active,
      queued: this.queue.length,
      retryAfterMs: Math.max(1000, this.queueTimeoutMs || 1000),
      reason,
    }
  }

  private drainQueue() {
    while (this.active < this.maxActive && this.queue.length > 0) {
      const request = this.queue.shift()
      if (!request) return
      if (request.timeout) clearTimeout(request.timeout)
      request.resolve(this.createLease(request.enqueuedAt))
    }
  }
}

const chatAiConcurrencyLimiter = new LocalConcurrencyLimiter(
  CHAT_AI_MAX_IN_FLIGHT,
  CHAT_AI_QUEUE_LIMIT,
  CHAT_AI_QUEUE_TIMEOUT_MS
)

/**
 * Rate limiter for AI/expensive operations
 * 10 requests per 60 seconds per user
 */
export const aiRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      analytics: true,
      prefix: 'ratelimit:ai',
    })
  : null

/**
 * IP-wide AI limiter (defense in depth)
 * 60 requests per 10 minutes per IP
 */
export const aiIpRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '600 s'),
      analytics: true,
      prefix: 'ratelimit:ai_ip',
    })
  : null

export const assistantFreeChatRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        ASSISTANT_FREE_CHAT_MESSAGE_LIMIT,
        `${ASSISTANT_FREE_CHAT_COOLDOWN_SECONDS} s`
      ),
      analytics: true,
      prefix: 'ratelimit:assistant_free_chat',
    })
  : null

export const assistantPlusChatDailyRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ASSISTANT_PLUS_CHAT_DAILY_LIMIT, '86400 s'),
      analytics: true,
      prefix: 'ratelimit:assistant_plus_chat_daily',
    })
  : null

export const assistantPlusChatMonthlyRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ASSISTANT_PLUS_CHAT_MONTHLY_LIMIT, '2592000 s'),
      analytics: true,
      prefix: 'ratelimit:assistant_plus_chat_monthly',
    })
  : null

export const assistantProChatMonthlyRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ASSISTANT_PRO_CHAT_MONTHLY_LIMIT, '2592000 s'),
      analytics: true,
      prefix: 'ratelimit:assistant_pro_chat_monthly',
    })
  : null

export const assistantPlusUploadDailyRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ASSISTANT_PLUS_UPLOAD_DAILY_LIMIT, '86400 s'),
      analytics: true,
      prefix: 'ratelimit:assistant_plus_upload_daily',
    })
  : null

export const assistantPlusUploadMonthlyRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ASSISTANT_PLUS_UPLOAD_MONTHLY_LIMIT, '2592000 s'),
      analytics: true,
      prefix: 'ratelimit:assistant_plus_upload_monthly',
    })
  : null

export const assistantProUploadDailyRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ASSISTANT_PRO_UPLOAD_DAILY_LIMIT, '86400 s'),
      analytics: true,
      prefix: 'ratelimit:assistant_pro_upload_daily',
    })
  : null

export const assistantProUploadMonthlyRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ASSISTANT_PRO_UPLOAD_MONTHLY_LIMIT, '2592000 s'),
      analytics: true,
      prefix: 'ratelimit:assistant_pro_upload_monthly',
    })
  : null

export const assistantUsageLimits = {
  plusChatDaily: ASSISTANT_PLUS_CHAT_DAILY_LIMIT,
  plusChatMonthly: ASSISTANT_PLUS_CHAT_MONTHLY_LIMIT,
  proChatMonthly: ASSISTANT_PRO_CHAT_MONTHLY_LIMIT,
  plusUploadDaily: ASSISTANT_PLUS_UPLOAD_DAILY_LIMIT,
  plusUploadMonthly: ASSISTANT_PLUS_UPLOAD_MONTHLY_LIMIT,
  proUploadDaily: ASSISTANT_PRO_UPLOAD_DAILY_LIMIT,
  proUploadMonthly: ASSISTANT_PRO_UPLOAD_MONTHLY_LIMIT,
}

/**
 * Global provider budget for paid premium chat flow.
 * Prevents sudden traffic spikes from saturating upstream LLM providers.
 */
export const premiumProviderGlobalLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(PREMIUM_PROVIDER_GLOBAL_RPM, '60 s'),
      analytics: true,
      prefix: 'ratelimit:premium_provider_global',
    })
  : null

/**
 * Rate limiter for general API operations
 * 100 requests per 60 seconds per user
 */
export const apiRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, '60 s'),
      analytics: true,
      prefix: 'ratelimit:api',
    })
  : null

/**
 * General IP limiter for API routes.
 * 120 requests per 60 seconds per IP.
 */
export const apiIpRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, '60 s'),
      analytics: true,
      prefix: 'ratelimit:api_ip',
    })
  : null

/**
 * Rate limiter for authentication attempts
 * 5 requests per 300 seconds (5 minutes) per IP
 */
export const authRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '300 s'),
      analytics: true,
      prefix: 'ratelimit:auth',
    })
  : null

/**
 * Rate limiter for email-sending actions
 * 3 requests per 10 minutes per IP/account key
 */
export const emailRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '600 s'),
      analytics: true,
      prefix: 'ratelimit:email',
    })
  : null

/**
 * Daily limiter for email actions
 * 10 requests per 24 hours per account key
 */
export const emailDailyRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '86400 s'),
      analytics: true,
      prefix: 'ratelimit:email_daily',
    })
  : null

/**
 * Rate limiter for uploads
 * 20 requests per 10 minutes per user
 */
export const uploadRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '600 s'),
      analytics: true,
      prefix: 'ratelimit:upload',
    })
  : null

/**
 * IP limiter for uploads
 * 60 requests per 10 minutes per IP
 */
export const uploadIpRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '600 s'),
      analytics: true,
      prefix: 'ratelimit:upload_ip',
    })
  : null

/**
 * Rate limiter for billing session creation
 * 10 requests per 10 minutes per user
 */
export const billingRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '600 s'),
      analytics: true,
      prefix: 'ratelimit:billing',
    })
  : null

/**
 * IP limiter for billing session creation
 * 30 requests per 10 minutes per IP
 */
export const billingIpRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '600 s'),
      analytics: true,
      prefix: 'ratelimit:billing_ip',
    })
  : null

/**
 * Apply rate limiting to a request
 */
export async function rateLimit(
  limiter: Ratelimit | null,
  identifier: string,
  fallbackTokens: number = 10,
  fallbackWindowMs: number = 60000
) {
  if (!limiter) {
    // Use in-memory fallback
    return inMemoryLimiter.limit(identifier, fallbackTokens, fallbackWindowMs)
  }

  return limiter.limit(identifier)
}

const sleep = async (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

export async function acquirePremiumProviderCapacity() {
  let attempt = 0
  let lastResult = await rateLimit(
    premiumProviderGlobalLimiter,
    'premium_provider_global',
    PREMIUM_PROVIDER_GLOBAL_RPM,
    60000
  )

  while (!lastResult.success && attempt < PREMIUM_PROVIDER_QUEUE_RETRIES) {
    attempt += 1
    if (PREMIUM_PROVIDER_QUEUE_WAIT_MS > 0) {
      await sleep(PREMIUM_PROVIDER_QUEUE_WAIT_MS)
    }
    lastResult = await rateLimit(
      premiumProviderGlobalLimiter,
      'premium_provider_global',
      PREMIUM_PROVIDER_GLOBAL_RPM,
      60000
    )
  }

  const waitedMs = attempt * PREMIUM_PROVIDER_QUEUE_WAIT_MS
  const retryAfterMs = Math.max(250, (lastResult.reset || Date.now()) - Date.now())

  return {
    ...lastResult,
    waitedMs,
    retryAfterMs,
  }
}

export async function acquireChatAiCapacity() {
  return chatAiConcurrencyLimiter.acquire()
}

/**
 * Get identifier from request (user ID or IP address)
 */
export function getIdentifier(userId?: string, ip?: string): string {
  return userId || ip || 'anonymous'
}

const normalizeIp = (raw?: string | null): string | undefined => {
  if (!raw) return undefined
  let candidate = raw.trim()
  if (!candidate) return undefined

  // Strip brackets around IPv6 literals, e.g. [::1]
  candidate = candidate.replace(/^\[|\]$/g, '')

  // Strip :port for IPv4 values.
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.split(':')[0] || candidate
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) {
    const octets = candidate.split('.').map((part) => Number.parseInt(part, 10))
    if (octets.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
      return candidate
    }
    return undefined
  }

  // Loose IPv6 validation (sufficient for rate-limit keying).
  if (candidate.includes(':') && /^[0-9a-fA-F:.]+$/.test(candidate)) {
    return candidate.toLowerCase()
  }

  return undefined
}

/**
 * Extract client IP from common forwarding headers
 */
export function getClientIp(headers: Headers): string | undefined {
  const forwardedFor = headers.get('x-forwarded-for')
  const candidates = [
    headers.get('cf-connecting-ip'),
    headers.get('x-real-ip'),
    headers.get('x-client-ip'),
    forwardedFor ? forwardedFor.split(',')[0] : null,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeIp(candidate)
    if (normalized) return normalized
  }
  return undefined
}

/**
 * Standard 429 response with limit headers
 */
export function rateLimitExceededResponse(
  result: { limit: number; remaining: number; reset: number },
  message: string = 'Too many requests. Please try again later.'
) {
  return NextResponse.json(
    {
      error: 'Too many requests',
      message,
      resetAt: new Date(result.reset).toISOString(),
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.reset),
      },
    }
  )
}

type IpRateLimitOptions = {
  key: string
  tokens?: number
  windowMs?: number
  message?: string
}

export async function enforceIpRateLimit(headers: Headers, options: IpRateLimitOptions) {
  const ip = getClientIp(headers)
  const identifier = `${options.key}:ip:${getIdentifier(undefined, ip)}`
  const result = await rateLimit(
    apiIpRateLimiter,
    identifier,
    options.tokens ?? 120,
    options.windowMs ?? 60 * 1000
  )

  if (!result.success) {
    return rateLimitExceededResponse(
      result,
      options.message || 'Too many requests from this network. Please try again shortly.'
    )
  }

  return null
}
