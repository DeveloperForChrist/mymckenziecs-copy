import { NextResponse } from 'next/server'
import { deleteExpiredChatUploads, processPendingChatUploadExtractions } from '@/lib/chat/upload-store'
import { verifyCronSecret } from '@/lib/security/timing-safe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const parseBatchSize = (value: string | null) => {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 10
  return Math.min(parsed, 50)
}

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const headerSecret = request.headers.get('x-cron-secret') || request.headers.get('authorization')

    if (!verifyCronSecret(headerSecret, cronSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const batchSize = parseBatchSize(searchParams.get('limit'))

    await deleteExpiredChatUploads(Math.max(10, batchSize))
    const result = await processPendingChatUploadExtractions(batchSize)

    return NextResponse.json({
      ok: true,
      batchSize,
      ...result,
    })
  } catch (error: any) {
    console.error('Chat upload extraction cron failed', error)
    return NextResponse.json({ error: error?.message || 'Cron failed' }, { status: 500 })
  }
}
