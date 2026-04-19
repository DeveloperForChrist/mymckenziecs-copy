import { NextRequest, NextResponse } from 'next/server'
import { detectLegalMatterLocation } from '@/lib/legal/ip-geolocation'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest) {
  const detection = await detectLegalMatterLocation(request)
  return NextResponse.json(detection, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
