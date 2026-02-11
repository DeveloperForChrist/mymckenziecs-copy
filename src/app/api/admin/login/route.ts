import { NextResponse } from 'next/server'
import {
  adminSessionCookieName,
  createAdminSessionToken,
  getAdminCookieOptions
} from '@/lib/auth/admin-session'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
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
  } catch (error: any) {
    console.error('Admin login failed:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
