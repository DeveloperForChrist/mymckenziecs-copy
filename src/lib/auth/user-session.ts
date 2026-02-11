import { createSupabaseRouteClient } from '@/lib/database/supabase-route'

const COOKIE_NAME = 'user_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 5

export const getUserSessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_SECONDS
})

export const createUserSessionCookie = async (idToken: string) => {
  // Supabase handles session cookies automatically
  void idToken
  return ''
}

export const getUserSessionFromCookies = async () => {
  const supabase = await createSupabaseRouteClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  return { uid: data.user.id, email: data.user.email }
}

export const getUserFromRequest = async (request: Request) => {
  void request
  return getUserSessionFromCookies()
}

export const userSessionCookieName = COOKIE_NAME
