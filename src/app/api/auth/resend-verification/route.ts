import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'node:crypto'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { sendResendEmail } from '@/lib/email/resend'
import { getAppUrl } from '@/lib/app-url'
import { getBillingMarketFromCountryCode } from '@/constants'
import { getAppRouteForMarket } from '@/lib/markets/app-routes'
import { emailDailyRateLimiter, emailRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit'
import { renderPlainEmail } from '@/lib/email/plain-template'

type VerificationUserRow = {
  id: string
  email?: string | null
  name?: string | null
  email_verified_at?: string | null
  country_code?: string | null
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function safeRedirectPath(input?: string, fallback = '/dashboard') {
  if (!input) return fallback
  const normalized = input.trim()
  return normalized.startsWith('/') ? normalized : fallback
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
    const requestedRedirect = typeof body?.redirect === 'string' ? body.redirect : undefined
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
      .select('id, email, name, email_verified_at, country_code')
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    const typedUserRow = userRow as VerificationUserRow | null

    // Generic success to avoid account enumeration.
    if (!typedUserRow?.id || typedUserRow.email_verified_at) {
      return NextResponse.json({ success: true })
    }

    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(typedUserRow.id)
    if (authUserError || !authUserData.user?.email) {
      return NextResponse.json({ success: true })
    }

    const authMetadata =
      authUserData.user.user_metadata &&
      typeof authUserData.user.user_metadata === 'object'
        ? (authUserData.user.user_metadata as Record<string, unknown>)
        : null
    const metadataCountryCode =
      typeof authMetadata?.country_code === 'string' ? authMetadata.country_code : undefined
    const billingMarket = getBillingMarketFromCountryCode(
      typedUserRow.country_code || metadataCountryCode
    )
    const redirect = safeRedirectPath(
      requestedRedirect,
      getAppRouteForMarket('/dashboard', billingMarket)
    )

    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await supabaseAdmin
      .from('users')
      .update({
        verification_token_hash: tokenHash,
        verification_token_expires_at: expiresAt,
      })
      .eq('id', typedUserRow.id)

    const appUrl = getAppUrl(request)

    const verifyUrl = `${appUrl}/api/email/verify?token=${encodeURIComponent(rawToken)}&redirect=${encodeURIComponent(redirect)}`
    const firstName = (typedUserRow.name || '').trim().split(/\s+/)[0] || email.split('@')[0] || 'there'
    const htmlBody = renderPlainEmail({
      preheader: 'Use this fresh link to confirm your MyMcKenzieCS email address.',
      title: 'Confirm your email address',
      greeting: `Hello ${firstName},`,
      intro: 'Here is a fresh verification link for your MyMcKenzieCS account.',
      detailsTitle: 'Account details',
      details: [
        { label: 'Email', value: email },
        { label: 'Link expires', value: '24 hours' },
      ],
      ctaLabel: 'Confirm email address',
      ctaUrl: verifyUrl,
      note: 'If you did not request this email, you can safely ignore it.',
      closing: 'Kind regards,\nThe MyMcKenzieCS team',
    })

    await sendResendEmail({
      to: authUserData.user.email,
      subject: 'Verify your MyMcKenzieCS email',
      htmlBody,
      tag: 'verify-email-resend',
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Resend verification failed', error)
    return NextResponse.json({ success: true })
  }
}
