import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { sendResendEmail } from '@/lib/email/resend'
import nodemailer from 'nodemailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ClientInviteFormData {
  email: string
  name?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ClientInviteFormData

    if (!body.email) {
      return NextResponse.json(
        { message: 'Email is required.' },
        { status: 400 }
      )
    }

    const supabase = supabaseAdmin

    // Get authenticated user
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { message: 'Unauthorized.' },
        { status: 401 }
      )
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return NextResponse.json(
        { message: 'Unauthorized.' },
        { status: 401 }
      )
    }

    // Get business for the user
    const { data: businessData, error: businessError } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('owner_user_id', user.id)
      .single()

    if (businessError || !businessData) {
      return NextResponse.json(
        { message: 'Business not found.' },
        { status: 404 }
      )
    }

    // Check if invitation already exists for this email
    const { data: existingInvitation } = await supabase
      .from('client_invitations')
      .select('*')
      .eq('business_id', businessData.id)
      .eq('invited_email', body.email)
      .eq('status', 'pending')
      .single()

    if (existingInvitation) {
      return NextResponse.json(
        { message: 'An invitation has already been sent to this email.' },
        { status: 400 }
      )
    }

    // Create client invitation
    const { data: invitation, error: insertError } = await supabase
      .from('client_invitations')
      .insert({
        business_id: businessData.id,
        inviter_id: user.id,
        inviter_email: user.email,
        invited_email: body.email,
        client_name: body.name || null,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError || !invitation) {
      console.error('Failed to create invitation:', insertError)
      return NextResponse.json(
        { message: 'Failed to create invitation.' },
        { status: 500 }
      )
    }

    // Generate signup link with token
    const signupUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/signup?token=${invitation.token}`

    const subject = `Invitation to join ${businessData.name} client portal`
    const textBody =
      `You've been invited to join the ${businessData.name} client portal.\n\n` +
      `Sign up link: ${signupUrl}\n\n` +
      `If you did not expect this invite, you can ignore this email.`
    const htmlBody = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; color: #111827;">
        <h2 style="margin: 0 0 12px;">You're invited to join ${businessData.name}</h2>
        <p style="margin: 0 0 16px;">A client portal invitation was created for <strong>${body.email}</strong>.</p>
        <p style="margin: 0 0 16px;">
          <a href="${signupUrl}" style="display:inline-block;background:#5b21b6;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700;">
            Create your account
          </a>
        </p>
        <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">If the button doesn't work, copy and paste this link:</p>
        <p style="margin: 0; font-size: 13px; word-break: break-all;"><a href="${signupUrl}">${signupUrl}</a></p>
      </div>
    `

    const canUseResend = Boolean(process.env.RESEND_API_KEY)
    const gmailUser = process.env.GMAIL_USER
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD
    let messageSent = false

    if (canUseResend) {
      try {
        await sendResendEmail({
          to: body.email,
          subject,
          textBody,
          htmlBody,
          tag: 'client-invite',
          from: process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL,
        })
        messageSent = true
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
        to: body.email,
        subject,
        text: textBody,
        html: htmlBody,
      })
      messageSent = true
    }

    if (!messageSent) {
      // Still create the invitation record, but make it clear email wasn't delivered.
      console.warn('Client invitation created but email service is not configured. Invite link:', signupUrl)
      return NextResponse.json(
        {
          message: 'Invitation created, but email sending is not configured.',
          invitationId: invitation.id,
          signupUrl,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Invitation created successfully',
      invitationId: invitation.id,
      signupUrl, // helpful for dev / support; remove if you don't want to expose it
    })
  } catch (error) {
    console.error('Client invite error:', error)
    return NextResponse.json(
      { message: 'An error occurred while processing the invitation.' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = supabaseAdmin

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const { data: businessData, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_user_id', user.id)
      .single()

    if (businessError || !businessData) {
      return NextResponse.json({ message: 'Business not found.' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('client_invitations')
      .select('id, invited_email, client_name, status, created_at, accepted_at')
      .eq('business_id', businessData.id)
      .eq('inviter_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Client invite history error:', error)
      return NextResponse.json({ message: 'Failed to load invitation history.' }, { status: 500 })
    }

    return NextResponse.json({ invitations: data || [] })
  } catch (error) {
    console.error('Client invite history error:', error)
    return NextResponse.json({ message: 'An error occurred while loading invitation history.' }, { status: 500 })
  }
}
