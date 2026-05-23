import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'
import { createBlankMatter, type ClientMatter } from '@/lib/business/client-matters'
import {
  clientMatterToRow,
  loadBusinessLeadRows,
  loadClientMatterRows,
  matterUpdateToRow,
  rowToClientMatter,
  syncAcceptedLeadMatterRows,
} from '@/lib/business/business-matters-db'
import { createBusinessAlert } from '@/lib/business/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return input as Record<string, unknown>
}

async function getContext() {
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) throw new BusinessWorkspaceError('Unauthorized', 401)
  return ensureBusinessContext(user)
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BusinessWorkspaceError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }

  console.error(fallback, error)
  return NextResponse.json({ message: fallback }, { status: 500 })
}

function isMissingCaseIdColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  const message = String((error as { message?: unknown }).message || '')
  return (code === 'PGRST204' || code === '42703') && message.toLowerCase().includes('case_id')
}

export async function GET() {
  try {
    const context = await getContext()
    const leadRows = await loadBusinessLeadRows(context.businessId)
    await syncAcceptedLeadMatterRows(context.businessId, leadRows)
    const matterRows = await loadClientMatterRows(context.businessId)

    const supportsCaseId =
      matterRows.length === 0
        ? true
        : Object.prototype.hasOwnProperty.call(matterRows[0] as Record<string, unknown>, 'case_id')

    const mattersMissingCases = supportsCaseId ? matterRows.filter((row: any) => !row?.case_id) : []
    if (supportsCaseId && mattersMissingCases.length > 0) {
      const batch = mattersMissingCases.slice(0, 25)
      await Promise.allSettled(
        batch.map(async (row: any) => {
          const titleParts = [row?.client_name, row?.matter_number].filter(Boolean)
          const title = titleParts.join(' — ') || 'Client matter'

          const { data: createdCase, error: caseError } = await supabaseAdmin
            .from('cases')
            .insert({
              user_id: context.userId,
              title,
              description: typeof row?.summary === 'string' ? row.summary : null,
              status: 'active',
            })
            .select('id')
            .single()

          if (caseError || !createdCase?.id) {
            console.error('Failed to backfill matter case', caseError)
            return
          }

          const { error: updateError } = await supabaseAdmin
            .from('client_matters')
            .update({ case_id: createdCase.id })
            .eq('business_id', context.businessId)
            .eq('id', row.id)
            .is('case_id', null)

          if (updateError) {
            console.error('Failed to persist matter case backfill', updateError)
            return
          }

          row.case_id = createdCase.id
        }),
      )
    }

    return NextResponse.json({
      matters: matterRows.map(rowToClientMatter),
    })
  } catch (error) {
    return errorResponse(error, 'Unable to load client matters.')
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getContext()
    const body = asRecord(await request.json().catch(() => ({}))) || {}
    const matter: Partial<ClientMatter> = {
      ...createBlankMatter(),
      ...(body as Partial<ClientMatter>),
    }

    const insertPayload = clientMatterToRow(matter, context.businessId)
    let data: any = null
    let error: any = null
    {
      const result = await supabaseAdmin
        .from('client_matters')
        .insert(insertPayload)
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error && isMissingCaseIdColumnError(error)) {
      const { case_id: _dropCaseId, ...fallbackPayload } = insertPayload
      const fallbackResult = await supabaseAdmin
        .from('client_matters')
        .insert(fallbackPayload)
        .select('*')
        .single()
      data = fallbackResult.data
      error = fallbackResult.error
    }

    if (error || !data) {
      console.error('Client matter create failed', error)
      return NextResponse.json({ message: 'Unable to create matter.' }, { status: 500 })
    }

    const supportsCaseId = Object.prototype.hasOwnProperty.call(data as Record<string, unknown>, 'case_id')
    if (supportsCaseId && !data.case_id) {
      const titleParts = [data?.client_name, data?.matter_number].filter(Boolean)
      const title = titleParts.join(' — ') || 'Client matter'
      const { data: createdCase } = await supabaseAdmin
        .from('cases')
        .insert({
          user_id: context.userId,
          title,
          description: typeof data?.summary === 'string' ? data.summary : null,
          status: 'active',
        })
        .select('id')
        .single()

      if (createdCase?.id) {
        const { data: updatedRow } = await supabaseAdmin
          .from('client_matters')
          .update({ case_id: createdCase.id })
          .eq('business_id', context.businessId)
          .eq('id', data.id)
          .select('*')
          .single()
        if (updatedRow) {
          return NextResponse.json({ matter: rowToClientMatter(updatedRow) })
        }
      }
    }

    return NextResponse.json({
      matter: rowToClientMatter(data),
    })
  } catch (error) {
    return errorResponse(error, 'Unable to create matter.')
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getContext()
    const body = asRecord(await request.json())
    if (!body) {
      return NextResponse.json({ message: 'Invalid matter payload.' }, { status: 400 })
    }

    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) {
      return NextResponse.json({ message: 'Matter id is required.' }, { status: 400 })
    }

    const update = matterUpdateToRow(body)
    const { data: previousMatter } = await supabaseAdmin
      .from('client_matters')
      .select('id, client_name, matter_number, status, stage, next_deadline')
      .eq('business_id', context.businessId)
      .eq('id', id)
      .maybeSingle()
    let data: any = null
    let error: any = null
    {
      const result = await supabaseAdmin
        .from('client_matters')
        .update(update)
        .eq('business_id', context.businessId)
        .eq('id', id)
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error && isMissingCaseIdColumnError(error) && Object.prototype.hasOwnProperty.call(update, 'case_id')) {
      const { case_id: _dropCaseId, ...fallbackUpdate } = update
      const fallbackResult = await supabaseAdmin
        .from('client_matters')
        .update(fallbackUpdate)
        .eq('business_id', context.businessId)
        .eq('id', id)
        .select('*')
        .single()
      data = fallbackResult.data
      error = fallbackResult.error
    }

    if (error || !data) {
      console.error('Client matter update failed', error)
      return NextResponse.json({ message: 'Unable to update matter.' }, { status: 500 })
    }

    const previousStatus = String(previousMatter?.status || '')
    const nextStatus = String(data?.status || '')
    if (previousStatus && nextStatus && previousStatus !== nextStatus) {
      await createBusinessAlert({
        businessId: context.businessId,
        type: 'system',
        priority: nextStatus === 'archived' ? 'low' : 'medium',
        title: 'Matter status changed',
        body: `${data?.client_name || 'Client'} matter ${data?.matter_number || ''} changed from ${previousStatus} to ${nextStatus}.`,
        clientName: data?.client_name || null,
        actionLabel: 'Open Work Item',
        metadata: { matterId: id, from: previousStatus, to: nextStatus },
      })
    }

    const previousStage = String(previousMatter?.stage || '')
    const nextStage = String(data?.stage || '')
    if (previousStage && nextStage && previousStage !== nextStage) {
      await createBusinessAlert({
        businessId: context.businessId,
        type: 'system',
        priority: 'low',
        title: 'Matter stage updated',
        body: `${data?.client_name || 'Client'} moved to ${nextStage} stage.`,
        clientName: data?.client_name || null,
        actionLabel: 'Open Work Item',
        metadata: { matterId: id, from: previousStage, to: nextStage },
      })
    }

    const prevDeadline = previousMatter?.next_deadline ? String(previousMatter.next_deadline) : ''
    const nextDeadline = data?.next_deadline ? String(data.next_deadline) : ''
    if (prevDeadline !== nextDeadline && nextDeadline) {
      await createBusinessAlert({
        businessId: context.businessId,
        type: 'deadline',
        priority: 'high',
        title: 'Matter deadline updated',
        body: `${data?.client_name || 'Client'} deadline set to ${nextDeadline}.`,
        clientName: data?.client_name || null,
        actionLabel: 'Open Calendar',
        metadata: { matterId: id, nextDeadline },
      })
    }

    return NextResponse.json({
      matter: rowToClientMatter(data),
    })
  } catch (error) {
    return errorResponse(error, 'Unable to update matter.')
  }
}
