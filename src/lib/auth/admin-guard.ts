import { NextResponse } from 'next/server'
import { getAdminSessionFromCookies } from '@/lib/auth/admin-session'

export const requireAdminSession = async () => {
  const session = await getAdminSessionFromCookies()
  if (!session.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  return {
    ok: true as const,
    email: session.email || null
  }
}
