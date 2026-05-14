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
    await syncAcceptedLeadMatterRows(context.businessId, leadRows)
    const matterRows = await loadClientMatterRows(context.businessId)

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

    const { data, error } = await supabaseAdmin
      .from('client_matters')
      .insert(clientMatterToRow(matter, context.businessId))
      .select('*')
      .single()

    if (error || !data) {
      console.error('Client matter create failed', error)
      return NextResponse.json({ message: 'Unable to create matter.' }, { status: 500 })
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
    const { data, error } = await supabaseAdmin
      .from('client_matters')
      .update(update)
      .eq('business_id', context.businessId)
      .eq('id', id)
      .select('*')
      .single()

    if (error || !data) {
      console.error('Client matter update failed', error)
      return NextResponse.json({ message: 'Unable to update matter.' }, { status: 500 })
    }

    return NextResponse.json({
      matter: rowToClientMatter(data),
    })
  } catch (error) {
    return errorResponse(error, 'Unable to update matter.')
  }
}
