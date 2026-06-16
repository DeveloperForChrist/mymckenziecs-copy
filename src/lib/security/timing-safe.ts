import { timingSafeEqual, createHash } from 'node:crypto'

/**
 * Timing-safe secret comparison to prevent timing attacks
 * Use this for comparing CSRF tokens, API keys, cron secrets, etc.
 */
export function timingSafeCompare(provided: string, expected: string): boolean {
  // If lengths differ, use hashes to prevent length-based timing attacks
  if (provided.length !== expected.length) {
    const providedHash = createHash('sha256').update(provided).digest()
    const expectedHash = createHash('sha256').update(expected).digest()
    try {
      timingSafeEqual(providedHash, expectedHash)
      return false
    } catch {
      return false
    }
  }

  // If lengths match, compare directly
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  } catch {
    return false
  }
}

/**
 * Verify a cron job secret from request headers
 */
export function verifyCronSecret(
  headerSecret: string | null,
  envSecret: string | undefined
): boolean {
  if (!envSecret) {
    console.error('CRON_SECRET is not configured')
    return false
  }

  const provided = (headerSecret || '').replace(/^Bearer\s+/i, '').trim()
  if (!provided) {
    return false
  }

  return timingSafeCompare(provided, envSecret)
}
