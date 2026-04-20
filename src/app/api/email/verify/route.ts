import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { getAppUrl } from '@/lib/app-url'
import { sendResendEmail } from '@/lib/email/resend'
import { formatLondonDateTime } from '@/lib/utils/london-time'
import { getBillingMarketFromCountryCode } from '@/constants'
import { getAppMarketFromPathname, getAppRouteForMarket } from '@/lib/markets/app-routes'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const TEMPLATE_DIR = path.join(process.cwd(), 'src', 'emails', 'templates')

function renderTemplate(templateName: string, vars: Record<string, string>) {
  const templatePath = path.join(TEMPLATE_DIR, templateName)
  let html = fs.readFileSync(templatePath, 'utf8')
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v)
  }
  return html
}

function safeRedirectPath(input?: string | null, fallback = '/dashboard') {
  if (!input) return fallback
  const normalized = input.trim()
  return normalized.startsWith('/') ? normalized : fallback
}

function buildVerifyRedirect(baseUrl: string, status: 'invalid' | 'expired', redirectPath?: string | null, fallback = '/dashboard') {
  const next = new URL('/auth/verify-email', baseUrl)
  next.searchParams.set('status', status)
  next.searchParams.set('redirect', safeRedirectPath(redirectPath, fallback))
  return next
}

function buildVerifySuccessRedirect(baseUrl: string, redirectPath?: string | null, fallback = '/dashboard') {
  const next = new URL('/auth/verify-email', baseUrl)
  next.searchParams.set('verified', 'success')
  next.searchParams.set('redirect', safeRedirectPath(redirectPath, fallback))
  return next
}

const formatChangedAt = formatLondonDateTime

export async function GET(request: NextRequest) {
  const baseUrl = getAppUrl(request)
  try {
    const token = request.nextUrl.searchParams.get('token') || ''
    const mode = (request.nextUrl.searchParams.get('mode') || '').trim().toLowerCase()
    const requestedRedirect = request.nextUrl.searchParams.get('redirect')
    const requestedMarket = getAppMarketFromPathname(requestedRedirect)

    if (!token) {
      return NextResponse.redirect(
        buildVerifyRedirect(baseUrl, 'invalid', requestedRedirect, getAppRouteForMarket('/dashboard', requestedMarket))
      )
    }

    const tokenHash = createHash('sha256').update(token).digest('hex')

    if (mode === 'email-change') {
      const { data: userRow, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, name, email, pending_email, email_change_token_expires_at, country_code')
        .eq('email_change_token_hash', tokenHash)
        .maybeSingle()

      if (userError || !userRow?.id) {
        return NextResponse.redirect(
          buildVerifyRedirect(baseUrl, 'invalid', requestedRedirect, getAppRouteForMarket('/dashboard', requestedMarket))
        )
      }

      const expiresAt = userRow.email_change_token_expires_at
        ? new Date(userRow.email_change_token_expires_at).getTime()
        : 0
      if (!expiresAt || Date.now() > expiresAt) {
        await supabaseAdmin
          .from('users')
          .update({
            pending_email: null,
            email_change_token_hash: null,
            email_change_token_expires_at: null,
          })
          .eq('id', userRow.id)
        const userMarket = getBillingMarketFromCountryCode((userRow as any)?.country_code || null)
        return NextResponse.redirect(
          buildVerifyRedirect(baseUrl, 'expired', requestedRedirect, getAppRouteForMarket('/dashboard', userMarket))
        )
      }

      const userMarket = getBillingMarketFromCountryCode((userRow as any)?.country_code || null)
      const redirectPath = safeRedirectPath(
        requestedRedirect,
        getAppRouteForMarket('/settings?tab=account', userMarket)
      )
      const pendingEmail = (userRow.pending_email || '').trim().toLowerCase()
      if (!pendingEmail) {
        return NextResponse.redirect(
          buildVerifyRedirect(baseUrl, 'invalid', requestedRedirect, getAppRouteForMarket('/dashboard', userMarket))
        )
      }

      const oldEmail = (userRow.email || '').trim().toLowerCase()
      const nowIso = new Date().toISOString()
      const { datePart, timePart } = formatChangedAt(new Date(nowIso))

      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userRow.id, {
        email: pendingEmail,
        email_confirm: true,
      })
      if (authUpdateError) {
        return NextResponse.redirect(
          buildVerifyRedirect(baseUrl, 'invalid', requestedRedirect, getAppRouteForMarket('/dashboard', userMarket))
        )
      }

      await supabaseAdmin
        .from('users')
        .update({
          email: pendingEmail,
          email_verified_at: nowIso,
          pending_email: null,
          email_change_token_hash: null,
          email_change_token_expires_at: null,
          updated_at: nowIso,
        })
        .eq('id', userRow.id)

      if (oldEmail && oldEmail !== pendingEmail) {
        const supportEmail = process.env.SUPPORT_EMAIL || 'jordan@lenjordan.tech'
        const firstName = (userRow.name || '').trim().split(/\s+/)[0] || 'there'
        try {
          const htmlBody = renderTemplate('23-email-change-confirmed-old.html', {
            name: firstName,
            old_email: oldEmail,
            new_email: pendingEmail,
            changed_date: datePart,
            changed_time: timePart,
            support_email: supportEmail,
          })
          await sendResendEmail({
            to: oldEmail,
            subject: 'Your MyMcKenzieCS account email was changed',
            htmlBody,
            tag: 'email-change-old-email-notice',
          })
        } catch (sendError) {
          console.error('Failed to send old-email change notice', sendError)
        }
      }

      return NextResponse.redirect(new URL(redirectPath, baseUrl))
    }

    const { data: userRow, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, verification_token_expires_at, email_verified_at, country_code')
      .eq('verification_token_hash', tokenHash)
      .maybeSingle()

    if (userError || !userRow?.id) {
      return NextResponse.redirect(
        buildVerifyRedirect(baseUrl, 'invalid', requestedRedirect, getAppRouteForMarket('/dashboard', requestedMarket))
      )
    }

    if (userRow.email_verified_at) {
      const userMarket = getBillingMarketFromCountryCode((userRow as any)?.country_code || null)
      return NextResponse.redirect(
        buildVerifySuccessRedirect(baseUrl, requestedRedirect, getAppRouteForMarket('/dashboard', userMarket))
      )
    }

    const expiresAt = userRow.verification_token_expires_at
      ? new Date(userRow.verification_token_expires_at).getTime()
      : 0
    if (!expiresAt || Date.now() > expiresAt) {
      await supabaseAdmin
        .from('users')
        .update({ verification_token_hash: null, verification_token_expires_at: null })
        .eq('id', userRow.id)
      const userMarket = getBillingMarketFromCountryCode((userRow as any)?.country_code || null)
      return NextResponse.redirect(
        buildVerifyRedirect(baseUrl, 'expired', requestedRedirect, getAppRouteForMarket('/dashboard', userMarket))
      )
    }

    const nowIso = new Date().toISOString()
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userRow.id, {
      email_confirm: true,
    })
    if (authUpdateError) {
      const userMarket = getBillingMarketFromCountryCode((userRow as any)?.country_code || null)
      return NextResponse.redirect(
        buildVerifyRedirect(baseUrl, 'invalid', requestedRedirect, getAppRouteForMarket('/dashboard', userMarket))
      )
    }

    await supabaseAdmin
      .from('users')
      .update({
        email_verified_at: nowIso,
        verification_token_hash: null,
        verification_token_expires_at: null,
      })
      .eq('id', userRow.id)

    const userMarket = getBillingMarketFromCountryCode((userRow as any)?.country_code || null)
    return NextResponse.redirect(
      buildVerifySuccessRedirect(baseUrl, requestedRedirect, getAppRouteForMarket('/dashboard', userMarket))
    )
  } catch {
    const requestedRedirect = request.nextUrl.searchParams.get('redirect')
    const requestedMarket = getAppMarketFromPathname(requestedRedirect)
    return NextResponse.redirect(
      buildVerifyRedirect(baseUrl, 'invalid', requestedRedirect, getAppRouteForMarket('/dashboard', requestedMarket))
    )
  }
}
