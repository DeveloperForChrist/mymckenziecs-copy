import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { requireAdminSession } from '@/lib/auth/admin-guard'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


const PERIODS: Record<string, number> = { day: 1, week: 7, month: 30 }
type ApiUsageRow = {
  success?: boolean
  total_tokens?: number | null
  cost_usd?: number | string | null
}

export async function GET(req: NextRequest) {
  try {
    const admin = requireAdminSession()
    if (!admin.ok) return admin.response

    const { searchParams } = req.nextUrl
    const provider = searchParams.get('provider') || ''
    const limit = Number(searchParams.get('limit') || '200')
    const period = searchParams.get('period') || 'week'

    const now = new Date()
    const startDate = new Date(now)
    const periodDays = PERIODS[period] || 7
    startDate.setDate(startDate.getDate() - periodDays)

    let query = supabaseAdmin
      .from('api_usage')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
      .gte('created_at', startDate.toISOString())

    if (provider) query = query.eq('provider', provider)

    const { data, error } = await query
    if (error) throw error

    const usage = data || []
    const summary = usage.reduce(
      (acc, row: ApiUsageRow) => {
        acc.totalRequests += 1
        if (!row.success) acc.totalErrors += 1
        acc.totalTokens += row.total_tokens || 0
        acc.totalCostUsd += Number(row.cost_usd || 0)
        return acc
      },
      { totalRequests: 0, totalErrors: 0, totalTokens: 0, totalCostUsd: 0 }
    )

    summary.totalCostUsd = Number(summary.totalCostUsd.toFixed(6))
    const errorRate = summary.totalRequests
      ? Number(((summary.totalErrors / summary.totalRequests) * 100).toFixed(1))
      : 0

    return NextResponse.json({
      usage,
      summary: { ...summary, errorRate },
      period: { key: period, start: startDate.toISOString(), end: now.toISOString() },
    })
  } catch (error: unknown) {
    console.error('Error fetching api usage:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch api usage'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
