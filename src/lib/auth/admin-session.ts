import crypto from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12

type AdminSessionResult = {
  ok: boolean
  email?: string
}

const safeEqual = (a?: string, b?: string) => {
  if (!a || !b) return false
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

const getSessionSecret = () => process.env.ADMIN_SESSION_SECRET || ''

export const getAdminCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_SECONDS
})

export const createAdminSessionToken = (email: string) => {
  const secret = getSessionSecret()
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET is not set')
  }

  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = `${email}:${issuedAt}`
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const token = `${payload}:${signature}`
  return Buffer.from(token, 'utf8').toString('base64url')
}

export const verifyAdminSessionToken = (token?: string): AdminSessionResult => {
  const secret = getSessionSecret()
  if (!token || !secret) {
    return { ok: false }
  }

  let decoded = ''
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    return { ok: false }
  }

  const parts = decoded.split(':')
  if (parts.length !== 3) {
    return { ok: false }
  }

  const [email, issuedAtRaw, signature] = parts
  const issuedAt = Number(issuedAtRaw)
  if (!email || !Number.isFinite(issuedAt)) {
    return { ok: false }
  }

  const now = Math.floor(Date.now() / 1000)
  if (now - issuedAt > SESSION_TTL_SECONDS || now < issuedAt) {
    return { ok: false }
  }

  const payload = `${email}:${issuedAt}`
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  if (!safeEqual(signature, expectedSignature)) {
    return { ok: false }
  }

  return { ok: true, email }
}

export const getAdminSessionFromCookies = (): AdminSessionResult => {
  const token = cookies().get(COOKIE_NAME)?.value
  return verifyAdminSessionToken(token)
}

export const adminSessionCookieName = COOKIE_NAME
