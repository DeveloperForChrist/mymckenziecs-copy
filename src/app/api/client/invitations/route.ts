import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { createBusinessAlert } from '@/lib/business/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

function isExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) return false
  const ts = Date.parse(expiresAt)
  if (Number.isNaN(ts)) return false
  return ts < Date.now()
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ message: 'Invitation token is required.' }, { status: 400 })
    }

    const { data: invitation, error } = await supabaseAdmin
      .from('client_invitations')
      .select('id, invited_email, inviter_email, client_name, status, expires_at, businesses(name)')
      .eq('token', token)
      .single()

    if (error || !invitation) {
      return NextResponse.json({ message: 'Invalid invitation token.' }, { status: 404 })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ message: 'Invitation is no longer pending.' }, { status: 409 })
    }

    if (isExpired(invitation.expires_at)) {
      return NextResponse.json({ message: 'Invitation link has expired.' }, { status: 410 })
    }

    return NextResponse.json({
      invitation: {
        invitedEmail: invitation.invited_email,
        inviterEmail: invitation.inviter_email,
        clientName: invitation.client_name,
        businessName: (invitation as any).businesses?.name || null,
      },
    })
  } catch (error) {
    console.error('Invitation lookup error:', error)
    return NextResponse.json({ message: 'Unable to load invitation.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const token = typeof body?.token === 'string' ? body.token : ''
    if (!token) {
      return NextResponse.json({ message: 'Invitation token is required.' }, { status: 400 })
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const accessToken = authHeader.replace('Bearer ', '').trim()
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (userError || !user) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from('client_invitations')
      .select('id, business_id, invited_email, client_name, status, expires_at')
      .eq('token', token)
      .single()

    if (invitationError || !invitation) {
      return NextResponse.json({ message: 'Invalid invitation token.' }, { status: 404 })
    }

    const invitedEmail = normalizeEmail(invitation.invited_email)
    const userEmail = normalizeEmail(user.email)
    if (!invitedEmail || invitedEmail !== userEmail) {
      return NextResponse.json(
        { message: 'This invitation is for a different email address.' },
        { status: 403 },
      )
    }

    if (invitation.status !== 'pending' && invitation.status !== 'accepted') {
      return NextResponse.json({ message: 'Invitation is no longer active.' }, { status: 409 })
    }

    if (isExpired(invitation.expires_at)) {
      return NextResponse.json({ message: 'Invitation link has expired.' }, { status: 410 })
    }

    const clientName =
      invitation.client_name ||
      String(user.user_metadata?.full_name || user.user_metadata?.display_name || '').trim() ||
      user.email?.split('@')[0] ||
      'Client'

    const { error: linkError } = await supabaseAdmin
      .from('client_business_links')
      .upsert(
        {
          client_id: user.id,
          business_id: invitation.business_id,
          client_name: clientName,
          client_email: user.email || null,
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id,business_id' },
      )

    if (linkError) {
      console.error('Invitation accept link upsert error:', linkError)
      return NextResponse.json({ message: 'Unable to link client to business.' }, { status: 500 })
    }

    if (invitation.status === 'pending') {
      const { error: acceptError } = await supabaseAdmin
        .from('client_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)
        .eq('status', 'pending')

      if (acceptError) {
        console.error('Invitation accept update error:', acceptError)
        return NextResponse.json({ message: 'Unable to mark invitation as accepted.' }, { status: 500 })
      }
    }

    await createBusinessAlert({
      businessId: String(invitation.business_id),
      type: 'lead',
      priority: 'medium',
      title: 'Client invitation accepted',
      body: `${user.email || 'Client'} accepted their portal invitation.`,
      clientName: clientName,
      actionLabel: 'Open Client Work',
      metadata: {
        invitationId: invitation.id,
        clientId: user.id,
        clientEmail: user.email || null,
      },
    })

    return NextResponse.json({ message: 'Invitation accepted successfully.' })
  } catch (error) {
    console.error('Invitation accept error:', error)
    return NextResponse.json({ message: 'Unable to accept invitation.' }, { status: 500 })
  }
}
