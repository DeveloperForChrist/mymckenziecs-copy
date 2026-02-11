import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

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
