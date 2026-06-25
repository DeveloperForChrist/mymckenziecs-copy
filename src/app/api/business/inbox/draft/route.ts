import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'

async function getBusinessUser() {
  const supabase = await createSupabaseRouteClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    return { error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }) }
  }

  try {
    await ensureBusinessContext(data.user)
  } catch (error) {
    if (error instanceof BusinessWorkspaceError) {
      return { error: NextResponse.json({ message: error.message }, { status: error.status }) }
    }
    throw error
  }

  return { user: data.user }
}

export async function GET() {
  try {
    const auth = await getBusinessUser()
    if (auth.error) return auth.error

    const { data, error } = await supabaseAdmin
      .from('business_inbox_drafts')
      .select('recipient_email, subject, body, updated_at')
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ message: error.message || 'Unable to load draft.' }, { status: 500 })
    }

    if (!data) return NextResponse.json({ draft: null })

    return NextResponse.json({
      draft: {
        to: String(data.recipient_email || ''),
        subject: String(data.subject || ''),
        body: String(data.body || ''),
        updatedAt: String(data.updated_at || new Date().toISOString()),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load draft.'
    return NextResponse.json({ message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await getBusinessUser()
    if (auth.error) return auth.error

    const body = await request.json().catch(() => ({}))
    const draft = {
      to: String(body?.to || ''),
      subject: String(body?.subject || ''),
      body: String(body?.body || ''),
      updatedAt: new Date().toISOString(),
    }

    const { error } = await supabaseAdmin
      .from('business_inbox_drafts')
      .upsert({
        user_id: auth.user.id,
        recipient_email: draft.to,
        subject: draft.subject,
        body: draft.body,
        updated_at: draft.updatedAt,
      }, { onConflict: 'user_id' })

    if (error) {
      return NextResponse.json({ message: error.message || 'Unable to save draft.' }, { status: 500 })
    }

    return NextResponse.json({ draft })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save draft.'
    return NextResponse.json({ message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const auth = await getBusinessUser()
    if (auth.error) return auth.error

    const { error } = await supabaseAdmin
      .from('business_inbox_drafts')
      .delete()
      .eq('user_id', auth.user.id)

    if (error) {
      return NextResponse.json({ message: error.message || 'Unable to clear draft.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to clear draft.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
