import { NextResponse } from 'next/server'
import { getAdminSessionFromCookies } from '@/lib/auth/admin-session'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET() {
  const session = await getAdminSessionFromCookies()
  return NextResponse.json({ authenticated: session.ok, email: session.email || null })
}
