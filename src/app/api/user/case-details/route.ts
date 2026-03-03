import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { hasCaseProfileAccess } from '@/lib/plans/access'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const hasMeaningfulCaseProfile = (row: Record<string, any> | null | undefined): boolean => {
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

type CaseProfileAccessState = {
  canView: boolean
  canEdit: boolean
}

const resolveCaseProfileAccess = async (userId: string): Promise<CaseProfileAccessState> => {
  const { data: activeSub } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_type, status')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (hasCaseProfileAccess(activeSub?.plan_type || '')) {
    return { canView: true, canEdit: true }
  }

  const { data: latestSub } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_type')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (hasCaseProfileAccess(latestSub?.plan_type || '')) {
    return { canView: true, canEdit: false }
  }

  return { canView: false, canEdit: false }
}

const detachCaseLinkedRecords = async (caseIds: string[]) => {
  if (caseIds.length === 0) return null

  const { error: reassignDocumentsError } = await supabaseAdmin
    .from('documents')
    .update({ case_id: null })
    .in('case_id', caseIds)
  if (reassignDocumentsError) return reassignDocumentsError

  const { error: detachMessagesError } = await supabaseAdmin
    .from('messages')
    .update({ case_id: null })
    .in('case_id', caseIds)
  if (detachMessagesError) return detachMessagesError

  const { error: detachMemoryError } = await supabaseAdmin
    .from('chat_memory')
    .update({ case_id: null })
    .in('case_id', caseIds)
  if (detachMemoryError) return detachMemoryError

  const { error: detachActionItemsError } = await supabaseAdmin
    .from('chat_action_items')
    .update({ case_id: null })
    .in('case_id', caseIds)
  if (detachActionItemsError) return detachActionItemsError

  return null
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

    const access = await resolveCaseProfileAccess(ownerId)
    if (!access.canView) {
      return NextResponse.json({ error: 'Premium or Premium + plan required' }, { status: 403 })
    }
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Read-only mode: resume plan to edit case profile.' }, { status: 402 })
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
    let existingCases: Array<{ id: string; external_id?: string | null; created_at?: string | null }> = []
    {
      const queryWithExternal = await supabaseAdmin
        .from('cases')
        .select('id, external_id, created_at')
        .eq('user_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(25)
      if (queryWithExternal.error) {
        if (isMissingColumnError(queryWithExternal.error, 'external_id')) {
          supportsExternalId = false
          const fallbackQuery = await supabaseAdmin
            .from('cases')
            .select('id, created_at')
            .eq('user_id', ownerId)
            .order('created_at', { ascending: false })
            .limit(25)
          if (fallbackQuery.error) {
            return NextResponse.json({ error: fallbackQuery.error.message }, { status: 500 })
          }
          existingCases = (fallbackQuery.data || []) as Array<{ id: string; created_at?: string | null }>
        } else {
          return NextResponse.json({ error: queryWithExternal.error.message }, { status: 500 })
        }
      } else {
        existingCases = (queryWithExternal.data || []) as Array<{ id: string; external_id?: string | null; created_at?: string | null }>
      }
    }

    const existingByExternalId = externalId && supportsExternalId
      ? existingCases.find((row) => typeof row.external_id === 'string' && row.external_id.trim() === externalId) || null
      : null
    const targetCaseId = existingByExternalId?.id || existingCases[0]?.id || null

    const payload: Record<string, any> = {
      title: nextTitle,
      case_type: nextCaseType,
      description: nextDescription,
      user_id: ownerId
    }
    if (supportsExternalId) {
      payload.external_id = externalId
    }

    let savedCase: any = null
    if (targetCaseId) {
      let { data, error } = await supabaseAdmin
        .from('cases')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', targetCaseId)
        .eq('user_id', ownerId)
        .select()
        .limit(1)

      if (error && supportsExternalId && isMissingColumnError(error, 'external_id')) {
        const fallbackPayload = { ...payload, updated_at: new Date().toISOString() }
        delete (fallbackPayload as any).external_id
        const fallbackResult = await supabaseAdmin
          .from('cases')
          .update(fallbackPayload)
          .eq('id', targetCaseId)
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

      savedCase = Array.isArray(data) ? data[0] : data
    } else {
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

      savedCase = Array.isArray(data) ? data[0] : data
    }

    const keepCaseId = typeof savedCase?.id === 'string' ? savedCase.id : null
    if (keepCaseId) {
      const duplicateCaseIds = existingCases
        .map((row) => row.id)
        .filter((id) => id && id !== keepCaseId)

      if (duplicateCaseIds.length > 0) {
        const detachError = await detachCaseLinkedRecords(duplicateCaseIds)
        if (detachError) {
          return NextResponse.json({ error: detachError.message }, { status: 500 })
        }

        const { error: deleteDuplicatesError } = await supabaseAdmin
          .from('cases')
          .delete()
          .in('id', duplicateCaseIds)
          .eq('user_id', ownerId)
        if (deleteDuplicatesError) {
          return NextResponse.json({ error: deleteDuplicatesError.message }, { status: 500 })
        }
      }
    }

    return NextResponse.json({ ok: true, case: savedCase })
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

    const access = await resolveCaseProfileAccess(userId)
    if (!access.canView) {
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

export async function DELETE(_request: Request) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await resolveCaseProfileAccess(userId)
    if (!access.canView) {
      return NextResponse.json({ error: 'Premium or Premium + plan required' }, { status: 403 })
    }
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Read-only mode: resume plan to edit case profile.' }, { status: 402 })
    }

    const { data: caseRows, error: caseRowsError } = await supabaseAdmin
      .from('cases')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(25)

    if (caseRowsError) {
      return NextResponse.json({ error: caseRowsError.message }, { status: 500 })
    }

    const allCaseIds = (caseRows || []).map((row: any) => row.id).filter((id: any): id is string => typeof id === 'string')
    const targetCaseIds = allCaseIds

    if (targetCaseIds.length === 0) {
      return NextResponse.json({ ok: true, cleared: false })
    }

    const detachError = await detachCaseLinkedRecords(targetCaseIds)
    if (detachError) {
      return NextResponse.json({ error: detachError.message }, { status: 500 })
    }

    const { error: deleteError } = await supabaseAdmin
      .from('cases')
      .delete()
      .in('id', targetCaseIds)
      .eq('user_id', userId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, cleared: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 })
  }
}
