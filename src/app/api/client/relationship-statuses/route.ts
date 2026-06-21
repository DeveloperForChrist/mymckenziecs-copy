import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { loadClientPortalMatters } from '@/lib/client-portal/portal-matters'

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

    const { links, matters } = await loadClientPortalMatters(user.id, user.email)
    const businessIds = links.map((row) => row.businessId).filter(Boolean)
    if (businessIds.length === 0) return NextResponse.json({ statuses: {} })

    const statuses: Record<string, {
      hasOpenMatter: boolean
      isClosed: boolean
      status: string
      stage: string
      latestMatterId: string | null
      lastActivityAt: string | null
      matters: Array<{
        id: string
        caseId: string | null
        matterNumber: string
        issueType: string
        status: string
        stage: string
        nextAction: string
        nextDeadline: string | null
        acceptedAt: string | null
        lastActivityAt: string | null
      }>
    }> = {}

    for (const businessId of businessIds) {
      const businessMatters = matters.filter((matter) => matter.businessId === businessId)
      if (businessMatters.length === 0) {
        statuses[businessId] = {
          hasOpenMatter: false,
          isClosed: false,
          status: 'none',
          stage: 'none',
          latestMatterId: null,
          lastActivityAt: null,
          matters: [],
        }
        continue
      }

      const latestMatter = businessMatters[0]
      const hasOpenMatter = businessMatters.some((matter) => matter.status !== 'archived' && matter.stage !== 'closed')
      const isClosed = !hasOpenMatter && businessMatters.length > 0
      statuses[businessId] = {
        hasOpenMatter,
        isClosed,
        status: latestMatter.status || 'unknown',
        stage: latestMatter.stage || 'unknown',
        latestMatterId: latestMatter.id,
        lastActivityAt: latestMatter.lastActivityAt,
        matters: businessMatters.map((matter) => ({
          id: matter.id,
          caseId: matter.caseId,
          matterNumber: matter.matterNumber,
          issueType: matter.issueType,
          status: matter.status,
          stage: matter.stage,
          nextAction: matter.nextAction,
          nextDeadline: matter.nextDeadline,
          acceptedAt: matter.acceptedAt,
          lastActivityAt: matter.lastActivityAt,
        })),
      }
    }

    return NextResponse.json({ statuses })
  } catch (error) {
    console.error('Relationship status error:', error)
    return NextResponse.json({ message: 'Unable to load relationship statuses.' }, { status: 500 })
  }
}
