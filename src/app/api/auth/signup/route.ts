import { NextRequest, NextResponse } from 'next/server'
import { getAppUrl } from '@/lib/app-url'
import { authRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { sendResendEmail } from '@/lib/email/resend'
import { createHash, randomBytes } from 'node:crypto'
import { renderPlainEmail } from '@/lib/email/plain-template'
import { findPlanByAnyPriceId, getBillingMarketFromCountryCode } from '@/constants'
import type { BillingMarket } from '@/constants'
import { getAppRouteForMarket } from '@/lib/markets/app-routes'
import {
  acceptClientInvitationForUser,
  getClientInvitationByToken,
  isClientInvitationExpired,
  normalizePortalEmail,
} from '@/lib/client-portal/invitations'
import {
  getCountryOption,
  getJurisdictionLabel,
  isSupportedCountryCode,
  isSupportedJurisdictionCode,
} from '@/lib/legal/jurisdictions'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function safeRedirectPath(input?: string, fallback = '/dashboard') {
  if (!input) return fallback
  const normalized = input.trim()
  return normalized.startsWith('/') ? normalized : fallback
}

function normalizeBusinessPlan(value: unknown): 'Solo' | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'solo') return 'Solo'
  return null
}

function getEdgeCountryCode(headers: Headers): string {
  return String(
    headers.get('x-vercel-ip-country') ||
    headers.get('cf-ipcountry') ||
    headers.get('x-country-code') ||
    ''
  ).trim().toUpperCase()
}

function getEdgeRegionCode(headers: Headers): string {
  return String(
    headers.get('x-vercel-ip-country-region') ||
    headers.get('x-vercel-ip-region') ||
    headers.get('x-region-code') ||
    ''
  ).trim().toUpperCase()
}

function inferLegalContextFromRequest(request: NextRequest) {
  const edgeCountryCode = getEdgeCountryCode(request.headers)
  const edgeRegionCode = getEdgeRegionCode(request.headers)
  const inferredCountryCode = isSupportedCountryCode(edgeCountryCode) ? edgeCountryCode : ''
  const inferredJurisdictionCode =
    inferredCountryCode === 'US' && /^[A-Z]{2}$/.test(edgeRegionCode)
      ? `US-${edgeRegionCode}`
      : ''
  const validInferredJurisdiction = isSupportedJurisdictionCode(inferredCountryCode, inferredJurisdictionCode)
    ? inferredJurisdictionCode
    : ''

  return {
    countryCode: inferredCountryCode,
    jurisdictionCode: validInferredJurisdiction,
  }
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
    const businessName = typeof body?.businessName === 'string' ? body.businessName.trim().slice(0, 160) : ''
    const countryCode = typeof body?.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : ''
    const jurisdictionCode = typeof body?.jurisdictionCode === 'string' ? body.jurisdictionCode.trim().toUpperCase() : ''
    const requestedRedirect = typeof body?.redirect === 'string' ? body.redirect : undefined
    const audience = (
      body?.audience ||
      body?.billingAudience ||
      body?.accountType ||
      ''
    )
    const plan = typeof body?.plan === 'string' ? body.plan.trim() : ''
    const planId = typeof body?.planId === 'string' ? body.planId.trim() : ''
    const invitationToken = typeof body?.invitationToken === 'string' ? body.invitationToken.trim() : ''
    const resolvedPlan = plan || findPlanByAnyPriceId(planId)?.name || ''
    const market = String(body?.market || '').trim().toUpperCase() === 'US' ? 'US' : 'GB'
    const selectedBusinessPlan = normalizeBusinessPlan(resolvedPlan)
    const isBusinessSignup =
      String(audience).trim().toLowerCase() === 'business' ||
      Boolean(selectedBusinessPlan)
    const isAssistantPlanSelection = resolvedPlan.toLowerCase().startsWith('assistant ')
    const isAssistantSignup =
      !isBusinessSignup &&
      (
        safeRedirectPath(requestedRedirect, '').startsWith('/assistant') ||
        String(body?.signupSource || '').trim().toLowerCase() === 'assistant' ||
        isAssistantPlanSelection
      )
    const inferredLegalContext = inferLegalContextFromRequest(request)
    const effectiveCountryCode = countryCode || (isAssistantSignup ? inferredLegalContext.countryCode : '')
    const effectiveJurisdictionCode = jurisdictionCode || (isAssistantSignup ? inferredLegalContext.jurisdictionCode : '')

    if (!fullName) {
      return NextResponse.json({ message: 'Full name is required.' }, { status: 400 })
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ message: 'Please enter a valid email address.' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ message: 'Please choose a stronger password.' }, { status: 400 })
    }

    if (!isBusinessSignup && !isAssistantSignup && !invitationToken && !isSupportedCountryCode(countryCode)) {
      return NextResponse.json({ message: 'Please select the country your legal matter is in.' }, { status: 400 })
    }

    if (!isBusinessSignup && !isAssistantSignup && !invitationToken && !isSupportedJurisdictionCode(countryCode, jurisdictionCode)) {
      return NextResponse.json(
        {
          message: `Please select a valid ${getCountryOption(countryCode)?.jurisdictionLabel.toLowerCase() || 'jurisdiction'}.`,
        },
        { status: 400 }
      )
    }

    if (invitationToken) {
      const { data: invitation, error: invitationError } = await getClientInvitationByToken(invitationToken)
      if (invitationError || !invitation) {
        return NextResponse.json({ message: 'Invalid or expired invitation link.' }, { status: 404 })
      }
      if (isClientInvitationExpired(invitation.expires_at)) {
        return NextResponse.json({ message: 'Invitation link has expired.' }, { status: 410 })
      }
      if (invitation.status !== 'pending' && invitation.status !== 'accepted') {
        return NextResponse.json({ message: 'Invitation is no longer active.' }, { status: 409 })
      }
      if (normalizePortalEmail(invitation.invited_email) !== email) {
        return NextResponse.json({ message: 'This invitation is for a different email address.' }, { status: 403 })
      }
    }

    const billingCountryCode = isSupportedCountryCode(effectiveCountryCode) ? effectiveCountryCode : market
    const billingMarket: BillingMarket = isBusinessSignup ? market : getBillingMarketFromCountryCode(billingCountryCode)
    const redirect = safeRedirectPath(
      requestedRedirect,
      isBusinessSignup ? '/business/dashboard' : getAppRouteForMarket('/dashboard', billingMarket)
    )
    const jurisdictionLabel = isBusinessSignup ? null : getJurisdictionLabel(effectiveCountryCode, effectiveJurisdictionCode)
    const profileCountryCode = isBusinessSignup ? null : (isSupportedCountryCode(effectiveCountryCode) ? effectiveCountryCode : null)
    const profileJurisdictionCode = isBusinessSignup
      ? null
      : isSupportedJurisdictionCode(effectiveCountryCode, effectiveJurisdictionCode)
        ? effectiveJurisdictionCode
        : null

    const metadata = {
      full_name: fullName,
      first_name: firstName || fullName.split(' ')[0] || '',
      last_name: lastName,
      display_name: fullName,
      business_name: isBusinessSignup ? businessName : null,
      account_type: isBusinessSignup ? 'business' : 'litigant',
      billing_audience: isBusinessSignup ? 'business' : 'litigant',
      selected_business_plan: isBusinessSignup ? (selectedBusinessPlan || 'Solo') : null,
      signup_source: isAssistantSignup ? 'assistant' : null,
      country_code: profileCountryCode,
      jurisdiction_code: profileJurisdictionCode,
      jurisdiction_label: jurisdictionLabel,
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
    const nowIso = new Date().toISOString()
    const skipEmailVerification = Boolean(invitationToken)

    const { error: userUpsertError } = await supabaseAdmin
      .from('users')
      .upsert(
        {
          id: userId,
          email,
          name: fullName,
          account_type: isBusinessSignup ? 'business' : 'litigant',
          billing_audience: isBusinessSignup ? 'business' : 'litigant',
          country_code: profileCountryCode,
          jurisdiction_code: profileJurisdictionCode,
          jurisdiction_label: jurisdictionLabel,
          verification_token_hash: skipEmailVerification ? null : tokenHash,
          verification_token_expires_at: skipEmailVerification ? null : expiresAt,
          email_verified_at: skipEmailVerification ? nowIso : null,
        },
        { onConflict: 'id' }
      )

    if (userUpsertError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ message: 'Unable to create account profile.' }, { status: 500 })
    }

    if (invitationToken) {
      const accepted = await acceptClientInvitationForUser({
        token: invitationToken,
        userId,
        userEmail: email,
        userDisplayName: fullName,
        autoVerify: true,
      })

      if (!accepted.ok) {
        await supabaseAdmin.auth.admin.deleteUser(userId)
        return NextResponse.json({ message: accepted.message }, { status: accepted.status })
      }

      return NextResponse.json({
        success: true,
        verificationEmailSent: false,
        invitationAccepted: true,
      })
    }

    const appUrl = getAppUrl(request)

    const verifyUrl = `${appUrl}/api/email/verify?token=${encodeURIComponent(rawToken)}&redirect=${encodeURIComponent(redirect)}`
    const verificationFirstName = fullName.split(' ')[0] || 'there'
    const htmlBody = renderPlainEmail({
      preheader: 'Confirm your email to finish setting up your secure MyMcKenzieCS workspace.',
      title: 'Confirm your email address',
      greeting: `Hello ${verificationFirstName},`,
      intro: 'Please confirm your email address so we can finish setting up your secure MyMcKenzieCS workspace.',
      detailsTitle: 'Account details',
      details: [
        { label: 'Email', value: email },
        { label: 'Link expires', value: '24 hours' },
      ],
      ctaLabel: 'Confirm email address',
      ctaUrl: verifyUrl,
      note: 'If you did not create a MyMcKenzieCS account, you can safely ignore this email.',
      closing: 'Kind regards,\nThe MyMcKenzieCS team',
    })

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sign up failed'
    return NextResponse.json(
      { message },
      { status: 500 }
    )
  }
}
