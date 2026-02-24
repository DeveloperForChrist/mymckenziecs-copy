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

// Fallback to in-memory if Redis is not configured
const inMemoryLimiter = new InMemoryRateLimiter()

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
 * Rate limiter for guest AI usage
 * 6 requests per 60 seconds per guest ID
 */
export const aiGuestRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(6, '60 s'),
      analytics: true,
      prefix: 'ratelimit:ai_guest',
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
