import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'node:crypto'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { sendResendEmail } from '@/lib/email/resend'
import { emailDailyRateLimiter, emailRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function safeRedirectPath(input?: string) {
  if (!input) return '/dashboard'
  const normalized = input.trim()
  return normalized.startsWith('/') ? normalized : '/dashboard'
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers)
    const ipIdentifier = `email:verify:ip:${getIdentifier(undefined, ip)}`
    const ipLimit = await rateLimit(emailRateLimiter, ipIdentifier, 3, 10 * 60 * 1000)
    if (!ipLimit.success) {
      return rateLimitExceededResponse(ipLimit, 'Too many verification requests. Please try again shortly.')
    }

    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const redirect = safeRedirectPath(typeof body?.redirect === 'string' ? body.redirect : undefined)
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const accountDailyIdentifier = `email:verify:account:${email}`
    const accountDailyLimit = await rateLimit(emailDailyRateLimiter, accountDailyIdentifier, 8, 24 * 60 * 60 * 1000)
    if (!accountDailyLimit.success) {
      return rateLimitExceededResponse(accountDailyLimit, 'Too many verification attempts for this account. Try again later.')
    }

    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id, email, name, email_verified_at')
      .ilike('email', email)
      .limit(1)
      .maybeSingle()

    // Generic success to avoid account enumeration.
    if (!userRow?.id || userRow.email_verified_at) {
      return NextResponse.json({ success: true })
    }

    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(userRow.id)
    if (authUserError || !authUserData.user?.email) {
      return NextResponse.json({ success: true })
    }

    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await supabaseAdmin
      .from('users')
      .update({
        verification_token_hash: tokenHash,
        verification_token_expires_at: expiresAt,
      })
      .eq('id', userRow.id)

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (request.headers.get('origin') || '').replace(/\/$/, '') ||
      'http://localhost:3000'

    const verifyUrl = `${appUrl}/api/email/verify?token=${encodeURIComponent(rawToken)}&redirect=${encodeURIComponent(redirect)}`
    const firstName = (userRow.name || '').trim().split(/\s+/)[0] || email.split('@')[0] || 'there'
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6;">
        <h2 style="margin: 0 0 12px;">Verify your email</h2>
        <p>Hi ${firstName},</p>
        <p>Click below to verify your email and continue into your workspace.</p>
        <p style="margin: 22px 0;">
          <a href="${verifyUrl}" style="background:#2e1065;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;">
            Verify email
          </a>
        </p>
        <p>If the button does not work, use this link:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>This link expires in 24 hours.</p>
      </div>
    `

    await sendResendEmail({
      to: authUserData.user.email,
      subject: 'Verify your MyMcKenzieCS email',
      htmlBody,
      tag: 'verify-email-resend',
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Resend verification failed', error)
    return NextResponse.json({ success: true })
  }
}
