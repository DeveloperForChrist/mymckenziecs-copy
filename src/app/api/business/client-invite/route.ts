import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'

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

    // In production, you would send an actual email here using a service like Resend, SendGrid, etc.
    // For now, we'll return the signup link in the response
    console.log('Client invite link:', signupUrl)

    // TODO: Implement actual email sending
    // Example with Resend:
    // await resend.emails.send({
    //   from: 'noreply@mymckenziecs.com',
    //   to: body.email,
    //   subject: `Invitation to join ${businessData.name} portal`,
    //   html: `<p>You've been invited to join the ${businessData.name} client portal.</p><p><a href="${signupUrl}">Click here to sign up</a></p>`
    // })

    return NextResponse.json({
      message: 'Invitation created successfully',
      invitationId: invitation.id,
      signupUrl, // Only for development - remove in production
    })
  } catch (error) {
    console.error('Client invite error:', error)
    return NextResponse.json(
      { message: 'An error occurred while processing the invitation.' },
      { status: 500 }
    )
  }
}
