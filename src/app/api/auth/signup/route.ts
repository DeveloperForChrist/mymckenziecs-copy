import { NextRequest, NextResponse } from 'next/server'
import { authRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { sendResendEmail } from '@/lib/email/resend'
import { createHash, randomBytes } from 'node:crypto'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function safeRedirectPath(input?: string) {
  if (!input) return '/pricing'
  const normalized = input.trim()
  return normalized.startsWith('/') ? normalized : '/pricing'
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers)
    const identifier = `auth:signup:${getIdentifier(undefined, ip)}`
    const limit = await rateLimit(authRateLimiter, identifier, 5, 5 * 60 * 1000)
    if (!limit.success) {
      return rateLimitExceededResponse(limit, 'Too many sign-up attempts. Please try again later.')
    }

    const body = await request.json()
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : ''
    const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : ''
    const lastName = typeof body?.lastName === 'string' ? body.lastName.trim() : ''
    const redirect = safeRedirectPath(typeof body?.redirect === 'string' ? body.redirect : undefined)

    if (!fullName) {
      return NextResponse.json({ message: 'Full name is required.' }, { status: 400 })
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ message: 'Please enter a valid email address.' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ message: 'Please choose a stronger password.' }, { status: 400 })
    }

    const metadata = {
      full_name: fullName,
      first_name: firstName || fullName.split(' ')[0] || '',
      last_name: lastName,
      display_name: fullName,
    }

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      // Verification is handled by our custom link, but access is not blocked.
      email_confirm: true,
      user_metadata: metadata,
    })

    if (createError || !createdUser.user?.id) {
      const message = (createError?.message || '').toLowerCase()
      if (message.includes('already') || message.includes('exists') || message.includes('registered')) {
        return NextResponse.json({ message: 'An account with this email already exists.' }, { status: 409 })
      }
      return NextResponse.json({ message: createError?.message || 'Unable to create account.' }, { status: 400 })
    }

    const userId = createdUser.user.id
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { error: userUpsertError } = await supabaseAdmin
      .from('users')
      .upsert(
        {
          id: userId,
          email,
          name: fullName,
          verification_token_hash: tokenHash,
          verification_token_expires_at: expiresAt,
          email_verified_at: null,
        },
        { onConflict: 'id' }
      )

    if (userUpsertError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ message: 'Unable to create account profile.' }, { status: 500 })
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (request.headers.get('origin') || '').replace(/\/$/, '') ||
      'http://localhost:3000'

    const verifyUrl = `${appUrl}/api/email/verify?token=${encodeURIComponent(rawToken)}&redirect=${encodeURIComponent(redirect)}`
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6;">
        <h2 style="margin: 0 0 12px;">Verify your email</h2>
        <p>Hi ${fullName.split(' ')[0] || 'there'},</p>
        <p>Click the button below to verify your email and continue into your workspace.</p>
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

    let verificationEmailSent = true
    try {
      await sendResendEmail({
        to: email,
        subject: 'Verify your MyMcKenzieCS email',
        htmlBody,
        tag: 'verify-email',
      })
    } catch (sendError) {
      verificationEmailSent = false
      console.error('Sign-up verification email send failed:', sendError)
    }

    return NextResponse.json({
      success: true,
      verificationEmailSent,
    })
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || 'Sign up failed' },
      { status: 500 }
    )
  }
}
