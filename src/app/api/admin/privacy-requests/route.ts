import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { requireAdminSession } from '@/lib/auth/admin-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set(['pending', 'in_review', 'completed', 'rejected'])

function normalizeStatus(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase()
  return VALID_STATUSES.has(normalized) ? normalized : null
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminSession()
    if (!admin.ok) return admin.response

    const searchParams = request.nextUrl.searchParams
    const status = normalizeStatus(searchParams.get('status'))
    const parsedLimit = Number.parseInt(searchParams.get('limit') || '100', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 100

    let listQuery = supabaseAdmin
      .from('privacy_requests')
      .select('id, user_id, user_email, request_type, status, details, admin_notes, submitted_at, updated_at, completed_at')
      .order('submitted_at', { ascending: false })
      .limit(limit)

    if (status) {
      listQuery = listQuery.eq('status', status)
    }

    const [listResult, pendingCountResult, inReviewCountResult, completedCountResult, rejectedCountResult, totalCountResult] = await Promise.all([
      listQuery,
      supabaseAdmin.from('privacy_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('privacy_requests').select('id', { count: 'exact', head: true }).eq('status', 'in_review'),
      supabaseAdmin.from('privacy_requests').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabaseAdmin.from('privacy_requests').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
      supabaseAdmin.from('privacy_requests').select('id', { count: 'exact', head: true }),
    ])

    const { data, error } = listResult
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const requests = data || []
    const counts = {
      pending: pendingCountResult.count || 0,
      in_review: inReviewCountResult.count || 0,
      completed: completedCountResult.count || 0,
      rejected: rejectedCountResult.count || 0,
      total: totalCountResult.count || 0,
    }

    return NextResponse.json({ requests, counts })
  } catch (error: any) {
    console.error('Admin privacy requests GET error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to load privacy requests.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminSession()
    if (!admin.ok) return admin.response

    const body = await request.json().catch(() => ({}))
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    const status = normalizeStatus(body?.status)
    const adminNotes = typeof body?.adminNotes === 'string' ? body.adminNotes.trim() : ''

    if (!id) {
      return NextResponse.json({ error: 'Request id is required.' }, { status: 400 })
    }

    if (!status) {
      return NextResponse.json({ error: 'Please choose a valid status.' }, { status: 400 })
    }

    const payload: Record<string, any> = {
      status,
      admin_notes: adminNotes,
      updated_at: new Date().toISOString(),
    }

    if (status === 'completed' || status === 'rejected') {
      payload.completed_at = new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('privacy_requests')
      .update(payload)
      .eq('id', id)
      .select('id, status, updated_at, completed_at')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await supabaseAdmin.from('audit_log').insert({
      user_id: null,
      table_name: 'privacy_requests',
      record_id: id,
      action: `privacy_request_${status}`,
      new_data: {
        adminEmail: admin.email || null,
        adminNotes,
      } as any,
    })

    return NextResponse.json({ success: true, request: data })
  } catch (error: any) {
    console.error('Admin privacy requests PATCH error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to update privacy request.' }, { status: 500 })
  }
}
