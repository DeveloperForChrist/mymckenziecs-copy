import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { createBusinessAlert } from '@/lib/business/alerts'
import {
  acceptClientInvitationForUser,
  getClientInvitationByToken,
  isClientInvitationExpired,
} from '@/lib/client-portal/invitations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function recordInvitationOpenAlert(invitation: {
  id: string
  business_id: string
  invited_email: string | null
  client_name: string | null
  status: string
  portal_opened_at?: string | null
}) {
  if (invitation.status !== 'pending') return false
  if (invitation.portal_opened_at) return false

  const openedAt = new Date().toISOString()
  const { data: updatedInvitation, error } = await supabaseAdmin
    .from('client_invitations')
    .update({ portal_opened_at: openedAt })
    .eq('id', invitation.id)
    .is('portal_opened_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Invitation portal open update error:', error)
    return false
  }

  if (!updatedInvitation?.id) return false

  const clientName = String(invitation.client_name || invitation.invited_email || 'Client').trim()

  await createBusinessAlert({
    businessId: String(invitation.business_id),
    type: 'lead',
    priority: 'medium',
    title: 'Client portal opened',
    body: `${clientName} opened their client portal invite.`,
    clientName,
    actionLabel: 'Open Client Work',
    metadata: {
      invitationId: invitation.id,
      clientEmail: invitation.invited_email || null,
      portalOpenedAt: openedAt,
    },
    dedupeKey: `client-portal-opened:${invitation.id}`,
    dedupeWindowMinutes: 60 * 24 * 7,
  })

  return true
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ message: 'Invitation token is required.' }, { status: 400 })
    }

    const { data: invitation, error } = await supabaseAdmin
      .from('client_invitations')
      .select('id, business_id, invited_email, inviter_email, client_name, status, expires_at, portal_opened_at, businesses(name)')
      .eq('token', token)
      .single()

    if (error || !invitation) {
      return NextResponse.json({ message: 'Invalid invitation token.' }, { status: 404 })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ message: 'Invitation is no longer pending.' }, { status: 409 })
    }

    if (isClientInvitationExpired(invitation.expires_at)) {
      return NextResponse.json({ message: 'Invitation link has expired.' }, { status: 410 })
    }

    await recordInvitationOpenAlert({
      id: invitation.id,
      business_id: String(invitation.business_id),
      invited_email: invitation.invited_email,
      client_name: invitation.client_name,
      status: invitation.status,
      portal_opened_at: invitation.portal_opened_at,
    })

    const businessRelation = invitation as { businesses?: { name?: string | null } | null }
    return NextResponse.json({
      invitation: {
        token,
        invitedEmail: invitation.invited_email,
        inviterEmail: invitation.inviter_email,
        clientName: invitation.client_name,
        businessName: businessRelation.businesses?.name || null,
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

    const { data: invitation, error: invitationError } = await getClientInvitationByToken(token)
    if (invitationError || !invitation) {
      return NextResponse.json({ message: 'Invalid invitation token.' }, { status: 404 })
    }

    await recordInvitationOpenAlert({
      id: invitation.id,
      business_id: String(invitation.business_id),
      invited_email: invitation.invited_email,
      client_name: invitation.client_name,
      status: invitation.status,
      portal_opened_at: invitation.portal_opened_at,
    })

    const accepted = await acceptClientInvitationForUser({
      token,
      userId: user.id,
      userEmail: user.email,
      userDisplayName:
        String(user.user_metadata?.full_name || user.user_metadata?.display_name || '').trim() ||
        user.email?.split('@')[0] ||
        'Client',
      autoVerify: true,
    })

    if (!accepted.ok) {
      return NextResponse.json({ message: accepted.message }, { status: accepted.status })
    }

    return NextResponse.json({ message: 'Invitation accepted successfully.' })
  } catch (error) {
    console.error('Invitation accept error:', error)
    return NextResponse.json({ message: 'Unable to accept invitation.' }, { status: 500 })
  }
}
