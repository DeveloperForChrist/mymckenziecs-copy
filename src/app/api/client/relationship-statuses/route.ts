import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user?.id || !user?.email) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const { data: links, error: linksError } = await supabaseAdmin
      .from('client_business_links')
      .select('business_id')
      .eq('client_id', user.id)
      .eq('status', 'active')

    if (linksError) {
      return NextResponse.json({ message: 'Unable to load relationships.' }, { status: 500 })
    }

    const businessIds = (links || []).map((row: any) => String(row.business_id || '')).filter(Boolean)
    if (businessIds.length === 0) return NextResponse.json({ statuses: {} })

    const normalizedEmail = user.email.trim().toLowerCase()
    const { data: matters, error: mattersError } = await supabaseAdmin
      .from('client_matters')
      .select('id, business_id, status, stage, updated_at, accepted_at')
      .in('business_id', businessIds)
      .eq('email', normalizedEmail)
      .order('updated_at', { ascending: false })

    if (mattersError) {
      return NextResponse.json({ message: 'Unable to load matter statuses.' }, { status: 500 })
    }

    const statuses: Record<string, { hasOpenMatter: boolean; isClosed: boolean; status: string; stage: string }> = {}
    for (const businessId of businessIds) {
      const row = (matters || []).find((m: any) => String(m.business_id || '') === businessId)
      if (!row) {
        statuses[businessId] = { hasOpenMatter: false, isClosed: false, status: 'none', stage: 'none' }
        continue
      }
      const status = String(row.status || '').toLowerCase()
      const stage = String(row.stage || '').toLowerCase()
      const isClosed = status === 'archived' || stage === 'closed'
      statuses[businessId] = {
        hasOpenMatter: !isClosed,
        isClosed,
        status: status || 'unknown',
        stage: stage || 'unknown',
      }
    }

    return NextResponse.json({ statuses })
  } catch (error) {
    console.error('Relationship status error:', error)
    return NextResponse.json({ message: 'Unable to load relationship statuses.' }, { status: 500 })
  }
}
