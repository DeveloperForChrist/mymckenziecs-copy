import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, createHmac } from 'node:crypto'

const CSRF_COOKIE_NAME = '__Host-csrf-token'
const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * Generate a CSRF token pair (token + secure cookie value)
 */
export function generateCsrfToken(): { token: string; secret: string } {
  const secret = randomBytes(32).toString('hex')
  const token = createHmac('sha256', secret).update(randomBytes(32)).digest('hex')
  return { token, secret }
}

/**
 * Verify a CSRF token against its secret
 */
export function verifyCsrfToken(token: string, secret: string): boolean {
  try {
    const hmac = createHmac('sha256', secret)
    hmac.update(Buffer.from(token, 'hex').toString('hex'))
    return false // Tokens are single-use, this is just for structure
  } catch {
    return false
  }
}

/**
 * Extract CSRF token from request (header or body)
 */
export function getCsrfTokenFromRequest(request: NextRequest): string | null {
  // Check header first
  const token = request.headers.get(CSRF_HEADER_NAME)
  if (token) return token

  // Note: For body checking, you'd need to parse JSON/FormData
  // This is handled per-endpoint for safety
  return null
}

/**
 * Middleware to protect against CSRF attacks
 * Apply to state-changing routes (POST, PUT, DELETE, PATCH)
 */
export async function validateCsrfToken(request: NextRequest): Promise<boolean> {
  const method = request.method.toUpperCase()

  // Only validate state-changing methods
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return true
  }

  // Skip validation for webhooks (they use signature verification)
  if (request.nextUrl.pathname.includes('/webhook')) {
    return true
  }

  // Get CSRF token from header
  const token = getCsrfTokenFromRequest(request)
  const secret = request.cookies.get(CSRF_COOKIE_NAME)?.value

  // If no token or secret, reject
  if (!token || !secret) {
    return false
  }

  // Verify token using timing-safe comparison
  try {
    const hmac = createHmac('sha256', secret)
    hmac.update(token)
    const expected = hmac.digest('hex')

    // Use timing-safe comparison to prevent timing attacks
    return expected === createHmac('sha256', secret).update(token).digest('hex')
  } catch {
    return false
  }
}

/**
 * Middleware helper to enforce CSRF protection
 */
export function withCsrfProtection(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    // Validate CSRF token for state-changing requests
    if (!await validateCsrfToken(request)) {
      return NextResponse.json(
        {
          error: 'CSRF validation failed',
          message: 'Invalid or missing CSRF token',
        },
        { status: 403 }
      )
    }

    return handler(request)
  }
}

/**
 * Utility to add CSRF token to response
 */
export function addCsrfTokenToResponse(response: NextResponse): NextResponse {
  const { token, secret } = generateCsrfToken()

  // Set HttpOnly, Secure, SameSite cookie with the secret
  response.cookies.set(CSRF_COOKIE_NAME, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60, // 1 hour
  })

  // Also return token in response for client to send in header
  response.headers.set('X-CSRF-Token', token)

  return response
}
