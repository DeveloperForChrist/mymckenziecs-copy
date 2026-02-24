import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { hasCaseProfileAccess } from '@/lib/plans/access'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const hasMeaningfulCaseProfile = (row: Record<string, unknown> | null | undefined): boolean => {
  if (!row) return false
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const externalId = typeof row.external_id === 'string' ? row.external_id.trim() : ''
  const caseType = typeof row.case_type === 'string' ? row.case_type.trim() : ''
  const description = typeof row.description === 'string' ? row.description.trim() : ''
  const normalizedTitle = title.toLowerCase()
  const hasTitle = Boolean(title) && normalizedTitle !== 'untitled case' && normalizedTitle !== 'case profile'
  return hasTitle || Boolean(externalId) || Boolean(caseType) || Boolean(description)
}

const isMissingColumnError = (error: any, columnName: string): boolean => {
  if (!error || typeof error !== 'object') return false
  const code = typeof error.code === 'string' ? error.code : ''
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : ''
  return code === 'PGRST204' && message.includes(`'${columnName.toLowerCase()}'`)
}

const requireCaseProfileAccess = async (userId: string): Promise<boolean> => {
  const { data: activeSub } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_type, status')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return hasCaseProfileAccess(activeSub?.plan_type || '')
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const body = await request.json()
    const { caseId, caseType, caseTitle, caseDescription, userId } = body || {}
    const fallbackUserId =
      typeof userId === 'string' && uuidRegex.test(userId.trim())
        ? userId.trim()
        : null
    const ownerId = authData?.user?.id || fallbackUserId

    if (!ownerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await requireCaseProfileAccess(ownerId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Premium or Premium + plan required' }, { status: 403 })
    }

    const externalId = typeof caseId === 'string' ? caseId.trim() : null
    const nextTitle = typeof caseTitle === 'string' && caseTitle.trim()
      ? caseTitle.trim()
      : (typeof caseDescription === 'string' && caseDescription.trim()
        ? caseDescription.slice(0, 80).trim()
        : 'Case profile')
    const nextCaseType = typeof caseType === 'string' && caseType.trim() ? caseType.trim() : null
    const nextDescription = typeof caseDescription === 'string' && caseDescription.trim() ? caseDescription.trim() : null

    const rawTitle = typeof caseTitle === 'string' ? caseTitle.trim() : ''
    const rawDescription = typeof caseDescription === 'string' ? caseDescription.trim() : ''
    const rawCaseType = typeof caseType === 'string' ? caseType.trim() : ''
    const hasAnyInput = Boolean(rawTitle) || Boolean(rawDescription) || Boolean(rawCaseType) || Boolean(externalId)
    if (!hasAnyInput) {
      return NextResponse.json({ error: 'Fill at least one case profile field before saving.' }, { status: 400 })
    }

    let supportsExternalId = true
    let existingCase: { id: string } | null = null
    if (externalId) {
      const { data, error } = await supabaseAdmin
        .from('cases')
        .select('id')
        .eq('user_id', ownerId)
        .eq('external_id', externalId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) {
        if (isMissingColumnError(error, 'external_id')) {
          supportsExternalId = false
        } else {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
      } else {
        existingCase = data || null
      }
    } else {
      const { data } = await supabaseAdmin
        .from('cases')
        .select('id')
        .eq('user_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      existingCase = data || null
    }

    if (externalId && !existingCase && !supportsExternalId) {
      const { data } = await supabaseAdmin
        .from('cases')
        .select('id')
        .eq('user_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      existingCase = data || null
    }

    const payload: Record<string, unknown> = {
      title: nextTitle,
      case_type: nextCaseType,
      description: nextDescription,
      user_id: ownerId
    }
    if (supportsExternalId) {
      payload.external_id = externalId
    }

    if (existingCase?.id) {
      let { data, error } = await supabaseAdmin
        .from('cases')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', existingCase.id)
        .eq('user_id', ownerId)
        .select()
        .limit(1)

      if (error && supportsExternalId && isMissingColumnError(error, 'external_id')) {
        const fallbackPayload = { ...payload, updated_at: new Date().toISOString() }
        delete (fallbackPayload as any).external_id
        const fallbackResult = await supabaseAdmin
          .from('cases')
          .update(fallbackPayload)
          .eq('id', existingCase.id)
          .eq('user_id', ownerId)
          .select()
          .limit(1)
        data = fallbackResult.data
        error = fallbackResult.error
      }

      if (error) {
        console.error('supabase update error', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const updated = Array.isArray(data) ? data[0] : data
      return NextResponse.json({ ok: true, case: updated })
    }

    let { data, error } = await supabaseAdmin
      .from('cases')
      .insert(payload)
      .select()
      .limit(1)

    if (error && supportsExternalId && isMissingColumnError(error, 'external_id')) {
      const fallbackPayload = { ...payload }
      delete (fallbackPayload as any).external_id
      const fallbackResult = await supabaseAdmin
        .from('cases')
        .insert(fallbackPayload)
        .select()
        .limit(1)
      data = fallbackResult.data
      error = fallbackResult.error
    }

    if (error) {
      console.error('supabase insert error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const created = Array.isArray(data) ? data[0] : data
    return NextResponse.json({ ok: true, case: created })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const url = new URL(request.url);
    const queryUserId = url.searchParams.get('userId');
    const userId = authData?.user?.id || queryUserId

    if (!userId) {
      return NextResponse.json({ ok: true, case: null });
    }

    const hasAccess = await requireCaseProfileAccess(userId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Premium or Premium + plan required' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('supabase query error', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const found = Array.isArray(data) ? data.find((row) => hasMeaningfulCaseProfile(row)) || null : null;
    return NextResponse.json({ ok: true, case: found });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const body = await request.json().catch(() => ({}))
    const requestedCaseId = typeof body?.caseId === 'string' ? body.caseId.trim() : null
    const userId = authData?.user?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await requireCaseProfileAccess(userId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Premium or Premium + plan required' }, { status: 403 })
    }

    let targetCaseId = requestedCaseId
    if (!targetCaseId) {
      const { data: latestCase, error: latestError } = await supabaseAdmin
        .from('cases')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestError) {
        return NextResponse.json({ error: latestError.message }, { status: 500 })
      }
      targetCaseId = latestCase?.id || null
    }

    if (!targetCaseId) {
      return NextResponse.json({ ok: true, cleared: false })
    }

    const { error: reassignDocumentsError } = await supabaseAdmin
      .from('documents')
      .update({ case_id: null })
      .eq('case_id', targetCaseId)

    if (reassignDocumentsError) {
      return NextResponse.json({ error: reassignDocumentsError.message }, { status: 500 })
    }

    // Preserve chatbot history when a case profile is cleared.
    const { error: detachMessagesError } = await supabaseAdmin
      .from('messages')
      .update({ case_id: null })
      .eq('case_id', targetCaseId)

    if (detachMessagesError) {
      return NextResponse.json({ error: detachMessagesError.message }, { status: 500 })
    }

    const { error: detachMemoryError } = await supabaseAdmin
      .from('chat_memory')
      .update({ case_id: null })
      .eq('case_id', targetCaseId)

    if (detachMemoryError) {
      return NextResponse.json({ error: detachMemoryError.message }, { status: 500 })
    }

    const { error: detachActionItemsError } = await supabaseAdmin
      .from('chat_action_items')
      .update({ case_id: null })
      .eq('case_id', targetCaseId)

    if (detachActionItemsError) {
      return NextResponse.json({ error: detachActionItemsError.message }, { status: 500 })
    }

    const { error: deleteError } = await supabaseAdmin
      .from('cases')
      .delete()
      .eq('id', targetCaseId)
      .eq('user_id', userId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, cleared: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 })
  }
}
