import 'server-only'

import { supabaseAdmin } from '@/lib/database/supabase-server'
import { createBusinessAlert } from '@/lib/business/alerts'

export type ClientInvitationRecord = {
  id: string
  business_id: string
  invited_email: string | null
  inviter_email: string | null
  client_name: string | null
  status: string
  expires_at: string | null
  portal_opened_at?: string | null
}

export function normalizePortalEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

export function isClientInvitationExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) return false
  const ts = Date.parse(expiresAt)
  if (Number.isNaN(ts)) return false
  return ts < Date.now()
}

export async function getClientInvitationByToken(token: string) {
  const result = await supabaseAdmin
    .from('client_invitations')
    .select('id, business_id, invited_email, inviter_email, client_name, status, expires_at, portal_opened_at')
    .eq('token', token)
    .maybeSingle()

  return result as { data: ClientInvitationRecord | null; error: unknown }
}

export async function markInvitedAccountVerified(userId: string) {
  const nowIso = new Date().toISOString()

  const { error: authVerifyError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  })
  if (authVerifyError) {
    console.error('Invitation auto-verify auth update error:', authVerifyError)
    return { ok: false as const, status: 500, message: 'Unable to verify invited account.' }
  }

  const { error: profileVerifyError } = await supabaseAdmin
    .from('users')
    .update({
      email_verified_at: nowIso,
      verification_token_hash: null,
      verification_token_expires_at: null,
    })
    .eq('id', userId)

  if (profileVerifyError) {
    console.error('Invitation auto-verify profile update error:', profileVerifyError)
    return { ok: false as const, status: 500, message: 'Unable to verify invited account.' }
  }

  return { ok: true as const, verifiedAt: nowIso }
}

export async function acceptClientInvitationForUser(params: {
  token: string
  userId: string
  userEmail: string | null | undefined
  userDisplayName?: string | null
  autoVerify?: boolean
}) {
  const invitedEmail = normalizePortalEmail(params.userEmail)
  const { data: invitation, error: invitationError } = await getClientInvitationByToken(params.token)

  if (invitationError || !invitation) {
    return { ok: false as const, status: 404, message: 'Invalid invitation token.' }
  }

  const expectedEmail = normalizePortalEmail(invitation.invited_email)
  if (!expectedEmail || expectedEmail !== invitedEmail) {
    return { ok: false as const, status: 403, message: 'This invitation is for a different email address.' }
  }

  if (invitation.status !== 'pending' && invitation.status !== 'accepted') {
    return { ok: false as const, status: 409, message: 'Invitation is no longer active.' }
  }

  if (isClientInvitationExpired(invitation.expires_at)) {
    return { ok: false as const, status: 410, message: 'Invitation link has expired.' }
  }

  const clientName =
    String(params.userDisplayName || invitation.client_name || invitedEmail.split('@')[0] || 'Client').trim() || 'Client'
  const nowIso = new Date().toISOString()

  const { error: linkError } = await supabaseAdmin
    .from('client_business_links')
    .upsert(
      {
        client_id: params.userId,
        business_id: invitation.business_id,
        client_name: clientName,
        client_email: invitedEmail || null,
        status: 'active',
        updated_at: nowIso,
      },
      { onConflict: 'client_id,business_id' },
    )

  if (linkError) {
    console.error('Invitation accept link upsert error:', linkError)
    return { ok: false as const, status: 500, message: 'Unable to link client to business.' }
  }

  if (params.autoVerify) {
    const verificationResult = await markInvitedAccountVerified(params.userId)
    if (!verificationResult.ok) {
      return verificationResult
    }
  }

  if (invitation.status === 'pending') {
    const { error: acceptError } = await supabaseAdmin
      .from('client_invitations')
      .update({ status: 'accepted', accepted_at: nowIso })
      .eq('id', invitation.id)
      .eq('status', 'pending')

    if (acceptError) {
      console.error('Invitation accept update error:', acceptError)
      return { ok: false as const, status: 500, message: 'Unable to mark invitation as accepted.' }
    }
  }

  await createBusinessAlert({
    businessId: String(invitation.business_id),
    type: 'lead',
    priority: 'medium',
    title: 'Client invitation accepted',
    body: `${params.userEmail || 'Client'} accepted their portal invitation.`,
    clientName,
    actionLabel: 'Open Client Work',
    metadata: {
      invitationId: invitation.id,
      clientId: params.userId,
      clientEmail: invitedEmail || null,
    },
  })

  return {
    ok: true as const,
    invitation,
    clientName,
  }
}
