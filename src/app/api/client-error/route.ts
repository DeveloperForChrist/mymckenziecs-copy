import { NextRequest, NextResponse } from 'next/server'
import { captureServerException } from '@/lib/monitoring/error-logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message = typeof body?.message === 'string' ? body.message : 'Client runtime error'
    const stack = typeof body?.stack === 'string' ? body.stack : undefined
    const pathname = typeof body?.pathname === 'string' ? body.pathname : undefined
    const digest = typeof body?.digest === 'string' ? body.digest : undefined
    const source = typeof body?.source === 'string' ? body.source : 'window.onerror'
    const userAgent = request.headers.get('user-agent') || undefined

    const error = new Error(message)
    if (stack) error.stack = stack

    await captureServerException(error, {
      component: 'client',
      route: pathname,
      source,
      digest,
      userAgent,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    await captureServerException(error, { component: 'client-error-route', route: '/api/client-error' })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
