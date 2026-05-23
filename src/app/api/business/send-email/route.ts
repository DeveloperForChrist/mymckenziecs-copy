import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { sendResendEmail } from '@/lib/email/resend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type SendEmailPayload = {
  to: string
  subject: string
  body: string
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function toHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />')
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const accessToken = authHeader.replace('Bearer ', '').trim()
    if (!accessToken) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken)
    const user = authData?.user
    if (authError || !user?.email) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const payload = (await request.json()) as SendEmailPayload
    const to = asString(payload?.to)
    const subject = asString(payload?.subject)
    const body = asString(payload?.body)
    if (!to || !subject || !body) {
      return NextResponse.json({ message: 'Recipient, subject, and message are required.' }, { status: 400 })
    }

    const senderName =
      asString(user.user_metadata?.full_name) ||
      asString(user.user_metadata?.display_name) ||
      user.email.split('@')[0] ||
      'MyMcKenzieCS Professional'

    const textBody = body
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <p>${toHtml(body)}</p>
      </div>
    `

    const canUseResend = Boolean(process.env.RESEND_API_KEY)
    const gmailUser = process.env.GMAIL_USER
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD
    let messageSent = false
    let provider = 'none'

    if (canUseResend) {
      try {
        await sendResendEmail({
          to,
          subject,
          textBody,
          htmlBody,
          tag: 'business-outbound',
          from: process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL,
        })
        messageSent = true
        provider = 'resend'
      } catch (resendError) {
        if (!gmailUser || !gmailAppPassword) {
          throw resendError
        }
      }
    }

    if (!messageSent && gmailUser && gmailAppPassword) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth: { user: gmailUser, pass: gmailAppPassword },
      })

      await transporter.sendMail({
        from: gmailUser,
        to,
        replyTo: user.email,
        subject,
        text: textBody,
        html: htmlBody,
      })
      messageSent = true
      provider = 'gmail'
    }

    if (!messageSent) {
      return NextResponse.json({ message: 'Email service is not configured.' }, { status: 500 })
    }

    const { error: insertError } = await supabaseAdmin
      .from('inbox_messages')
      .insert({
        sender_id: user.id,
        sender_email: user.email,
        sender_name: senderName,
        recipient_email: to,
        subject,
        content: body,
        type: 'email',
        metadata: {
          channel: 'external_email',
          direction: 'outbound',
          provider,
          sentByBusinessDashboard: true,
        },
      })

    if (insertError) {
      console.error('Failed to save sent email record:', insertError)
    }

    return NextResponse.json({ message: 'Email sent successfully.' })
  } catch (error) {
    console.error('Business send email error:', error)
    return NextResponse.json({ message: 'Failed to send email.' }, { status: 500 })
  }
}
