import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { getAppUrl } from '@/lib/app-url'
import { sendResendEmail } from '@/lib/email/resend'
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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function safeRedirectPath(input?: string) {
  if (!input) return '/settings?tab=account'
  const normalized = input.trim()
  return normalized.startsWith('/') ? normalized : '/settings?tab=account'
}

function formatChangedAt(date: Date) {
  const datePart = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/London',
  }).format(date)
  const timePart = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London',
  }).format(date)
  return { datePart, timePart: `${timePart} UK time` }
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authUid = data.user.id
    const { data: userRow, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authUid)
      .maybeSingle()

    if (userError) {
      console.error('Error fetching user data:', userError)
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 })
    }

    if (!userRow) {
      const authEmailVerifiedAt = (data.user as any)?.email_confirmed_at || null
      return NextResponse.json({
        fullName: data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || '',
        email: data.user.email || '',
        pendingEmail: null,
        address: '',
        createdAt: data.user.created_at || new Date().toISOString(),
        lastActive: null,
        emailVerifiedAt: authEmailVerifiedAt,
        emailVerified: Boolean(authEmailVerifiedAt),
      })
    }

    const emailVerifiedAt =
      (userRow as any).email_verified_at ||
      (userRow as any).emailVerifiedAt ||
      null

    return NextResponse.json({
      fullName: (userRow as any).fullName || (userRow as any).full_name || userRow.name || '',
      email: userRow.email || data.user.email || '',
      pendingEmail: (userRow as any).pending_email || null,
      address: (userRow as any).address || '',
      createdAt: userRow.created_at || data.user.created_at || '',
      lastActive: (userRow as any).last_active || null,
      emailVerifiedAt,
      emailVerified: Boolean(emailVerifiedAt),
    })
  } catch (error: any) {
    console.error('Error fetching user data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user data' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const rawAddress = typeof body?.address === 'string' ? body.address.trim() : null
    const redirect = safeRedirectPath(typeof body?.redirect === 'string' ? body.redirect : undefined)

    const authUid = data.user.id
    const nowIso = new Date().toISOString()
    const changedAt = new Date()
    const { datePart, timePart } = formatChangedAt(changedAt)
    const currentEmail = (data.user.email || '').trim().toLowerCase()
    const requestedEmail = email || currentEmail

    if (requestedEmail && !isValidEmail(requestedEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    const emailChangeRequested =
      Boolean(requestedEmail) &&
      Boolean(currentEmail) &&
      requestedEmail.toLowerCase() !== currentEmail.toLowerCase()

    const { data: existingUserRow } = await supabaseAdmin
      .from('users')
      .select('fullName, full_name, name, address, pending_email')
      .eq('id', authUid)
      .maybeSingle()

    const priorFullName = String(
      (existingUserRow as any)?.fullName ||
      (existingUserRow as any)?.full_name ||
      (existingUserRow as any)?.name ||
      data.user.user_metadata?.full_name ||
      data.user.user_metadata?.display_name ||
      ''
    ).trim()
    const priorAddress = String((existingUserRow as any)?.address || '').trim()
    const address = rawAddress ?? priorAddress
    const detailsChangeRequested =
      fullName !== priorFullName || address !== priorAddress

    let pendingEmail: string | null = ((existingUserRow as any)?.pending_email || null)
    let emailChangeTokenHash: string | null = null
    let emailChangeTokenExpiresAt: string | null = null
    let emailChangeVerifyUrl: string | null = null

    if (emailChangeRequested) {
      const { data: existingEmailOwner, error: existingEmailOwnerError } = await supabaseAdmin
        .from('users')
        .select('id')
        .or(`email.eq.${requestedEmail},pending_email.eq.${requestedEmail}`)
        .neq('id', authUid)
        .maybeSingle()

      if (existingEmailOwnerError) {
        console.error('Error checking existing email ownership:', existingEmailOwnerError)
        return NextResponse.json({ error: 'Unable to validate email availability right now.' }, { status: 500 })
      }
      if (existingEmailOwner) {
        return NextResponse.json({ error: 'That email address is already in use by another account.' }, { status: 409 })
      }

      const rawToken = randomBytes(32).toString('hex')
      emailChangeTokenHash = createHash('sha256').update(rawToken).digest('hex')
      emailChangeTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      pendingEmail = requestedEmail
      const appUrl = getAppUrl(request)
      emailChangeVerifyUrl = `${appUrl}/api/email/verify?mode=email-change&token=${encodeURIComponent(rawToken)}&redirect=${encodeURIComponent(redirect)}`
    }

    const metadataUpdateNeeded = Boolean(fullName)
    if (metadataUpdateNeeded) {
      const existingMeta = ((data.user.user_metadata as Record<string, any>) || {})
      const authUpdatePayload: { email?: string; data?: Record<string, any> } = {}

      if (metadataUpdateNeeded) {
        const parts = fullName.split(/\s+/).filter(Boolean)
        const first = parts[0] || ''
        const last = parts.slice(1).join(' ')
        authUpdatePayload.data = {
          ...existingMeta,
          full_name: fullName,
          display_name: fullName,
          first_name: first,
          last_name: last,
        }
      }

      const { error: authUpdateError } = await supabase.auth.updateUser(authUpdatePayload)
      if (authUpdateError) {
        console.error('Error updating auth profile:', authUpdateError)
        return NextResponse.json({ error: authUpdateError.message || 'Failed to update auth profile' }, { status: 400 })
      }
    }

    const persistedEmail = emailChangeRequested
      ? (currentEmail || requestedEmail || null)
      : (requestedEmail || currentEmail || null)
    const basePayload: Record<string, any> = {
      id: authUid,
      email: persistedEmail,
      name: fullName || data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || null,
      updated_at: nowIso,
    }

    if (emailChangeRequested) {
      basePayload.pending_email = pendingEmail
      basePayload.email_change_token_hash = emailChangeTokenHash
      basePayload.email_change_token_expires_at = emailChangeTokenExpiresAt
    }

    const extendedPayload: Record<string, any> = {
      ...basePayload,
      fullName: fullName || null,
      address: address || null,
      last_active: nowIso
    }

    const attemptUpsert = async (payload: Record<string, any>) => {
      return supabaseAdmin
        .from('users')
        .upsert(payload, { onConflict: 'id' })
        .select('id')
        .maybeSingle()
    }

    let upsertResult = await attemptUpsert(extendedPayload)
    if (upsertResult.error) {
      upsertResult = await attemptUpsert(basePayload)
    }

    if (upsertResult.error) {
      console.error('Error updating user data:', upsertResult.error)
      return NextResponse.json({ error: 'Failed to update user data' }, { status: 500 })
    }

    if (emailChangeRequested) {
      const supportEmail = process.env.SUPPORT_EMAIL || 'support@mymckenziecs.com'
      const firstName = (fullName || data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || 'there')
        .trim()
        .split(/\s+/)[0] || 'there'

      try {
        const newEmailHtml = renderTemplate('22-email-change-verify.html', {
          name: firstName,
          old_email: currentEmail,
          new_email: requestedEmail,
          changed_date: datePart,
          changed_time: timePart,
          support_email: supportEmail,
          verify_url: emailChangeVerifyUrl || '',
        })
        await sendResendEmail({
          to: requestedEmail,
          subject: 'Confirm your new MyMcKenzieCS email address',
          htmlBody: newEmailHtml,
          tag: 'email-change-verify',
        })
      } catch (newEmailNoticeError) {
        console.error('Failed to send new-email change notice', newEmailNoticeError)
      }
    }

    const detailsNotificationEmail = currentEmail || requestedEmail

    if (detailsChangeRequested && detailsNotificationEmail) {
      const supportEmail = process.env.SUPPORT_EMAIL || 'support@mymckenziecs.com'
      const firstName = (fullName || data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || 'there')
        .trim()
        .split(/\s+/)[0] || 'there'
      const changedFields: string[] = []
      if (fullName !== priorFullName) changedFields.push('full name')
      if (address !== priorAddress) changedFields.push('address')

      try {
        const htmlBody = renderTemplate('25-account-details-changed.html', {
          name: firstName,
          email: detailsNotificationEmail,
          changed_fields: changedFields.join(', ') || 'account details',
          changed_date: datePart,
          changed_time: timePart,
          support_email: supportEmail,
        })
        await sendResendEmail({
          to: detailsNotificationEmail,
          subject: 'Your MyMcKenzieCS account details were updated',
          htmlBody,
          tag: 'account-details-changed-notice',
        })
      } catch (detailsNoticeError) {
        console.error('Failed to send account details change notice', detailsNoticeError)
      }
    }

    return NextResponse.json({
      success: true,
      email: persistedEmail || '',
      pendingEmail,
      emailChangeRequested,
    });
  } catch (error: any) {
    console.error('Error updating user data:', error);
    return NextResponse.json(
      { error: 'Failed to update user data' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = data.user
    const userId = user.id
    const userEmail = user.email || ''
    const displayName =
      user.user_metadata?.full_name ||
      user.user_metadata?.display_name ||
      (userEmail ? userEmail.split('@')[0] : 'there')

    if (userEmail) {
      try {
        // Idempotency: if we've already sent the deletion email for this user, skip.
        const { data: alreadySent, error: sentErr } = await supabaseAdmin
          .from('audit_log')
          .select('id')
          .eq('table_name', 'users')
          .eq('record_id', userId)
          .eq('action', 'email_account_deleted_sent')
          .limit(1)

        if (sentErr) {
          console.error('Account deletion email check failed', sentErr)
        }

        if (Array.isArray(alreadySent) && alreadySent.length > 0) {
          // Continue with deletion, but don't spam emails.
        } else {
        const supportEmail = process.env.SUPPORT_EMAIL || 'support@mymckenziecs.com'
        const htmlBody = renderTemplate('18-account-deleted.html', {
          name: String(displayName),
          support_email: supportEmail,
        })
        await sendResendEmail({
          to: userEmail,
          subject: 'Your MyMcKenzieCS account was deleted',
          htmlBody,
          tag: 'account-deleted-confirmation',
        })

          // Record that we sent this email (store user_id as null to avoid FK issues).
          await supabaseAdmin.from('audit_log').insert({
            user_id: null,
            table_name: 'users',
            record_id: userId,
            action: 'email_account_deleted_sent',
            new_data: { email: userEmail } as any,
          })
        }
      } catch (emailError) {
        console.error('Account deletion email failed', emailError)
      }
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('Account deletion failed:', deleteError)
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting account:', error)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
