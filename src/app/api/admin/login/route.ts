import { NextResponse } from 'next/server'
import {
  adminSessionCookieName,
  createAdminSessionToken,
  getAdminCookieOptions
} from '@/lib/auth/admin-session'
import { authRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers)
    const identifier = `auth:admin:${getIdentifier(undefined, ip)}`
    const limit = await rateLimit(authRateLimiter, identifier, 5, 5 * 60 * 1000)
    if (!limit.success) {
      return rateLimitExceededResponse(limit, 'Too many admin login attempts. Please try again later.')
    }

    const { email, password } = await request.json()

    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminEmail || !adminPassword || !process.env.ADMIN_SESSION_SECRET) {
      return NextResponse.json({ error: 'Admin auth not configured' }, { status: 500 })
    }

    if (email !== adminEmail || password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const token = createAdminSessionToken(email)
    const response = NextResponse.json({ ok: true })
    response.cookies.set(adminSessionCookieName, token, getAdminCookieOptions())
    return response
  } catch (error: unknown) {
    console.error('Admin login failed:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
