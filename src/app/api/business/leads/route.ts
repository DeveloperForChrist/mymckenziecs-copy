import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'
import {
  businessLeadToRow,
  leadUpdateToRow,
  loadBusinessLeadRows,
  loadClientMatterRows,
  rowToBusinessLead,
  rowToClientMatter,
  syncAcceptedLeadMatterRow,
} from '@/lib/business/business-matters-db'

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

export async function GET() {
  try {
    const context = await getContext()
    const leadRows = await loadBusinessLeadRows(context.businessId)

    return NextResponse.json({
      leads: leadRows.map(rowToBusinessLead),
    })
  } catch (error) {
    return errorResponse(error, 'Unable to load business leads.')
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getContext()
    const body = asRecord(await request.json())
    if (!body) {
      return NextResponse.json({ message: 'Invalid lead payload.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('business_leads')
      .insert(businessLeadToRow(body as any, context.businessId, context.userId))
      .select('*')
      .single()

    if (error) {
      console.error('Business lead create failed', error)
      return NextResponse.json({ message: 'Unable to create lead.' }, { status: 500 })
    }

    const syncedMatter = await syncAcceptedLeadMatterRow(context.businessId, data)

    return NextResponse.json({
      lead: rowToBusinessLead(data),
      matter: syncedMatter ? rowToClientMatter(syncedMatter) : null,
    })
  } catch (error) {
    return errorResponse(error, 'Unable to create lead.')
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getContext()
    const body = asRecord(await request.json())
    if (!body) {
      return NextResponse.json({ message: 'Invalid lead payload.' }, { status: 400 })
    }

    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) {
      return NextResponse.json({ message: 'Lead id is required.' }, { status: 400 })
    }

    const update = leadUpdateToRow(body)
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ message: 'No lead changes provided.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('business_leads')
      .update(update)
      .eq('business_id', context.businessId)
      .eq('id', id)
      .select('*')
      .single()

    if (error || !data) {
      console.error('Business lead update failed', error)
      return NextResponse.json({ message: 'Unable to update lead.' }, { status: 500 })
    }

    const syncedMatter = await syncAcceptedLeadMatterRow(context.businessId, data)

    if (data.status === 'declined') {
      await supabaseAdmin
        .from('client_matters')
        .update({ status: 'archived', last_activity_at: new Date().toISOString() })
        .eq('business_id', context.businessId)
        .eq('lead_id', data.id)
    }

    const matterRows = await loadClientMatterRows(context.businessId)

    return NextResponse.json({
      lead: rowToBusinessLead(data),
      matter: syncedMatter ? rowToClientMatter(syncedMatter) : null,
      matters: matterRows.map(rowToClientMatter),
    })
  } catch (error) {
    return errorResponse(error, 'Unable to update lead.')
  }
}
