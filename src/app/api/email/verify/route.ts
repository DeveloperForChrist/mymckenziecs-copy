import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Email template disabled. Welcome email handles confirmation messaging.' },
    { status: 410 }
  )
}
