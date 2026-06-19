import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { sendResendEmail } from '@/lib/email/resend'
import { htmlEscape } from '@/lib/utils/html-escape'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const VALID_REQUEST_TYPES = new Set(['access', 'erasure', 'correction', 'restriction'])

function normalizeRequestType(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase()
  return VALID_REQUEST_TYPES.has(normalized) ? normalized : null
}

async function getCurrentUser() {
  const supabase = await createSupabaseRouteClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { user: data.user }
}

function buildNotificationHtml(payload: {
  userEmail: string
  requestType: string
  details: string
}) {
  const safeEmail = htmlEscape(payload.userEmail)
  const safeType = htmlEscape(payload.requestType)
  const safeDetails = htmlEscape(payload.details || 'No additional details provided.')

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;line-height:1.6;">
      <h2 style="margin:0 0 12px;color:#4c1d95;">New privacy request</h2>
      <p style="margin:0 0 12px;"><strong>User email:</strong> ${safeEmail}</p>
      <p style="margin:0 0 12px;"><strong>Request type:</strong> ${safeType}</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;">
        <p style="margin:0 0 8px;font-weight:700;">Details</p>
        <p style="margin:0;white-space:pre-wrap;">${safeDetails}</p>
      </div>
    </div>
  `
}

async function notifySupport(userEmail: string, requestType: string, details: string) {
  const supportEmail = process.env.SUPPORT_EMAIL || 'jordan@lenjordan.tech'
  if (!supportEmail) return false

  const subject = `Privacy request: ${requestType} - ${userEmail}`
  const textBody = [
    'New privacy request received',
    '',
    `User email: ${userEmail}`,
    `Request type: ${requestType}`,
    '',
    'Details:',
    details || 'No additional details provided.',
  ].join('\n')

  const htmlBody = buildNotificationHtml({ userEmail, requestType, details })

  try {
    await sendResendEmail({
      to: supportEmail,
      subject,
      textBody,
      htmlBody,
      tag: 'privacy-request',
    })
    return true
  } catch (error) {
    console.error('Privacy request email failed:', error)
    return false
  }
}

export async function GET() {
  try {
    const auth = await getCurrentUser()
    if ('error' in auth) return auth.error

    const { data, error } = await supabaseAdmin
      .from('privacy_requests')
      .select('id, request_type, status, details, admin_notes, submitted_at, updated_at, completed_at')
      .eq('user_id', auth.user.id)
      .order('submitted_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ requests: data || [] })
  } catch (error: any) {
    console.error('Privacy requests GET error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to load privacy requests.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getCurrentUser()
    if ('error' in auth) return auth.error

    const body = await request.json().catch(() => ({}))
    const requestType = normalizeRequestType(body?.requestType)
    const details = typeof body?.details === 'string' ? body.details.trim() : ''

    if (!requestType) {
      return NextResponse.json({ error: 'Please choose a valid request type.' }, { status: 400 })
    }

    if (details.length > 4000) {
      return NextResponse.json({ error: 'Details must be 4000 characters or fewer.' }, { status: 400 })
    }

    const userEmail = auth.user.email || ''
    if (!userEmail) {
      return NextResponse.json({ error: 'Your account does not have a verified email address.' }, { status: 400 })
    }

    const { data: inserted, error } = await supabaseAdmin
      .from('privacy_requests')
      .insert({
        user_id: auth.user.id,
        user_email: userEmail,
        request_type: requestType,
        details,
        status: 'pending',
      })
      .select('id, request_type, status, submitted_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await supabaseAdmin.from('audit_log').insert({
      user_id: auth.user.id,
      table_name: 'privacy_requests',
      record_id: inserted.id,
      action: 'privacy_request_created',
      new_data: {
        requestType,
        details,
        userEmail,
      } as any,
    })

    const notificationSent = await notifySupport(userEmail, requestType, details)

    return NextResponse.json({
      success: true,
      request: inserted,
      notificationSent,
    })
  } catch (error: any) {
    console.error('Privacy requests POST error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to submit privacy request.' }, { status: 500 })
  }
}
