import { NextRequest, NextResponse } from 'next/server'
import { addCsrfTokenToResponse } from '@/lib/security/csrf'

export async function GET(request: NextRequest) {
  const response = NextResponse.json({ ok: true })
  return addCsrfTokenToResponse(response)
}
