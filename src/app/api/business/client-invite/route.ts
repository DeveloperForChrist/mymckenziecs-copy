import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { sendResendEmail } from '@/lib/email/resend'
import { getAppUrl } from '@/lib/app-url'
import nodemailer from 'nodemailer'
import { createBusinessAlert } from '@/lib/business/alerts'
import { renderPlainEmail } from '@/lib/email/plain-template'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ClientInviteFormData {
  email: string
  name?: string
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ClientInviteFormData
    const invitedEmail = normalizeEmail(body.email)

    if (!invitedEmail) {
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

    const inviterEmail = normalizeEmail(user.email)

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
      .eq('invited_email', invitedEmail)
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
        inviter_email: inviterEmail || null,
        invited_email: invitedEmail,
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
    const appUrl = getAppUrl(request)
    const signupUrl = `${appUrl}/auth/signup?token=${encodeURIComponent(invitation.token)}&redirect=${encodeURIComponent('/client-portal')}`

    const subject = `${businessData.name} invited you to a secure MyMcKenzieCS portal`
    const textBody = [
      `Hello ${body.name || invitedEmail},`,
      '',
      `${businessData.name} has invited you to a secure client portal on MyMcKenzieCS.`,
      '',
      `Use the link below to sign in or create your account and access your private workspace:`,
      signupUrl,
      '',
      `If you were not expecting this invitation, you can safely ignore this email.`,
      '',
      `Kind regards,`,
      businessData.name,
    ].join('\n')
    const htmlBody = renderPlainEmail({
      preheader: `${businessData.name} invited you to a private MyMcKenzieCS workspace.`,
      title: 'You have been invited to a secure client portal',
      greeting: `Hello ${body.name || invitedEmail},`,
      intro: `${businessData.name} has invited you to a secure client portal on MyMcKenzieCS. Your portal is a private workspace for messages, meetings, shared documents, and updates from your professional.`,
      detailsTitle: 'Invitation details',
      details: [
        { label: 'Business', value: businessData.name },
        { label: 'Invited email', value: invitedEmail },
      ],
      bodyHtml: `<p style="margin:0 0 16px;">Use the button below to sign in or create your account and access your private workspace.</p>`,
      ctaLabel: 'Open secure portal',
      ctaUrl: signupUrl,
      note: 'If you were not expecting this invitation, you can safely ignore this email.',
      closing: `Kind regards,\n${businessData.name}`,
    })

    const inviteSenderName =
      String(user.user_metadata?.full_name || user.user_metadata?.display_name || '').trim() ||
      String(user.email || '').split('@')[0] ||
      businessData.name ||
      'Legal support professional'

    const { error: inboxError } = await supabase
      .from('inbox_messages')
      .insert({
        sender_id: user.id,
        sender_email: inviterEmail || null,
        sender_name: inviteSenderName,
        recipient_email: invitedEmail,
        subject: `Client portal invite from ${businessData.name}`,
        content: `${businessData.name} invited you to join their client portal. Use this secure link to sign in or create your account: ${signupUrl}`,
        type: 'client_invite',
        metadata: {
          invitation_id: invitation.id,
          business_id: businessData.id,
          invited_email: invitedEmail,
          inviter_email: inviterEmail || null,
          status: 'pending',
          signup_url: signupUrl,
        },
      })

    if (inboxError) {
      console.error('Failed to create inbox message for client invite:', inboxError)
      return NextResponse.json(
        { message: 'Invitation created, but inbox message could not be created.' },
        { status: 500 }
      )
    }

    const canUseResend = Boolean(process.env.RESEND_API_KEY)
    const gmailUser = process.env.GMAIL_USER
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD
    let messageSent = false

    if (canUseResend) {
      try {
        await sendResendEmail({
          to: invitedEmail,
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
        to: invitedEmail,
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

    await createBusinessAlert({
      businessId: String(businessData.id),
      type: 'lead',
      priority: 'low',
      title: 'Client invite sent',
      body: `Invite sent to ${invitedEmail}.`,
      clientName: body.name || null,
      actionLabel: 'View Invites',
      metadata: { invitationId: invitation.id, invitedEmail },
    })

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
