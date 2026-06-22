import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST() {
  return NextResponse.json(
    {
      message: 'Direct email is disabled. Send a secure client-portal message instead.',
      secureMessageEndpoint: '/api/business/inbox/message',
    },
    { status: 410 },
  )
}
