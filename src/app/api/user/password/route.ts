import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { sendResendEmail } from '@/lib/email/resend'
import { formatLondonDateTime } from '@/lib/utils/london-time'
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

const formatChangedAt = formatLondonDateTime

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'Please choose a password that is at least 8 characters long.'
  }

  if (!/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Please include at least one number and one special character.'
  }

  return null
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const password = typeof body?.password === 'string' ? body.password : ''
    const currentEmail = (data.user.email || '').trim()
    if (!currentEmail) {
      return NextResponse.json({ error: 'Unable to verify account email for this account' }, { status: 400 })
    }

    const passwordValidationError = validatePassword(password)
    if (passwordValidationError) {
      return NextResponse.json({ error: passwordValidationError }, { status: 400 })
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      return NextResponse.json({ error: updateError.message || 'Failed to update password' }, { status: 400 })
    }

    const changedAt = new Date()
    const { datePart, timePart } = formatChangedAt(changedAt)
    const supportEmail = process.env.SUPPORT_EMAIL || 'jordan@lenjordan.tech'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const resetUrl = `${appUrl}/auth/reset-password`
    const firstName =
      String(data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || 'there')
        .trim()
        .split(/\s+/)[0] || 'there'

    try {
      const htmlBody = renderTemplate('24-password-changed.html', {
        name: firstName,
        email: currentEmail,
        changed_date: datePart,
        changed_time: timePart,
        reset_url: resetUrl,
        support_email: supportEmail,
      })
      await sendResendEmail({
        to: currentEmail,
        subject: 'Your MyMcKenzieCS password was changed',
        htmlBody,
        tag: 'password-changed-confirmation',
      })
    } catch (emailError) {
      console.error('Failed to send password change confirmation email:', emailError)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating password:', error)
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
  }
}
