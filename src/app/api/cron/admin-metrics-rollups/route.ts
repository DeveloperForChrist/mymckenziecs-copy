import { NextResponse } from 'next/server'

const PERIODS = ['day', 'week', 'month'] as const

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const headerSecret = (request.headers.get('x-cron-secret') || request.headers.get('authorization') || '')
      .replace(/^Bearer\s+/i, '')
      .trim()

    if (!cronSecret) {
      console.error('CRON_SECRET is not configured for admin-metrics-rollups cron route')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    if (headerSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
      new URL(request.url).origin

    const results: Array<{ period: string; ok: boolean; status: number }> = []

    for (const period of PERIODS) {
      const response = await fetch(`${origin}/api/admin/metrics?period=${period}`, {
        headers: {
          cookie: request.headers.get('cookie') || '',
          'x-cron-secret': cronSecret,
        },
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
