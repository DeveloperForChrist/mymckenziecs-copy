import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/security/timing-safe'

const PERIODS = ['day', 'week', 'month'] as const

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const headerSecret = request.headers.get('x-cron-secret') || request.headers.get('authorization')

    if (!verifyCronSecret(headerSecret, cronSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
      new URL(request.url).origin

    const results: Array<{ period: string; ok: boolean; status: number }> = []

    for (const period of PERIODS) {
      const headers = new Headers({
        cookie: request.headers.get('cookie') || '',
      })

      if (cronSecret) {
        headers.set('x-cron-secret', cronSecret)
      }

      const response = await fetch(`${origin}/api/admin/metrics?period=${period}`, {
        headers,
        cache: 'no-store',
      })

      results.push({
        period,
        ok: response.ok,
        status: response.status,
      })
    }

    return NextResponse.json({ ok: true, results })
  } catch (error: any) {
    console.error('Admin metrics rollup cron failed', error)
    return NextResponse.json({ error: error?.message || 'Cron failed' }, { status: 500 })
  }
}
