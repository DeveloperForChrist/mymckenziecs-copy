import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { sendResendEmail } from '@/lib/email/resend'
import fs from 'fs'
import path from 'path'

const TEMPLATE_DIR = path.join(process.cwd(), 'src', 'emails', 'templates')

function renderTemplate(templateName: string, vars: Record<string, string>) {
  const templatePath = path.join(TEMPLATE_DIR, templateName)
  let html = fs.readFileSync(templatePath, 'utf8')
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v)
  }
  return html
}

export async function GET(request: NextRequest) {
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
      return NextResponse.json({
        fullName: data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || '',
        email: data.user.email || '',
        address: '',
        createdAt: data.user.created_at || new Date().toISOString(),
        lastActive: null
      })
    }

    return NextResponse.json({
      fullName: (userRow as any).fullName || (userRow as any).full_name || userRow.name || '',
      email: userRow.email || data.user.email || '',
      address: (userRow as any).address || '',
      createdAt: userRow.created_at || data.user.created_at || '',
      lastActive: (userRow as any).last_active || null
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
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const address = typeof body?.address === 'string' ? body.address.trim() : ''

    const authUid = data.user.id
    const nowIso = new Date().toISOString()

    const basePayload: Record<string, any> = {
      id: authUid,
      email: email || data.user.email || null,
      name: fullName || data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || null,
      updated_at: nowIso
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

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating user data:', error);
    return NextResponse.json(
      { error: 'Failed to update user data' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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
          subject: 'Your MymckenzieCS account was deleted',
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
