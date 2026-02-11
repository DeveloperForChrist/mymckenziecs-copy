import { NextResponse } from 'next/server'
import { adminSessionCookieName, getAdminCookieOptions } from '@/lib/auth/admin-session'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(adminSessionCookieName, '', {
    ...getAdminCookieOptions(),
    maxAge: 0
  })
  return response
}
