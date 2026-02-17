import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth/admin-guard'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


const LOG_PATH = path.join(process.cwd(), 'data', 'logs', 'grounding.log.jsonl')
const MAX_RECENT = 25

const readGroundingLog = () => {
  if (!fs.existsSync(LOG_PATH)) {
    return { counts: {}, recent: [], total: 0 }
  }

  const raw = fs.readFileSync(LOG_PATH, 'utf-8')
  const lines = raw.split('\n').filter(Boolean)
  const counts: Record<string, number> = {}
  const recent: Array<Record<string, unknown>> = []

  for (const line of lines) {
    try {
      const entry = JSON.parse(line)
      const reason = entry?.reason
      if (reason) {
        counts[reason] = (counts[reason] || 0) + 1
      }
      recent.push(entry)
      if (recent.length > MAX_RECENT) {
        recent.shift()
      }
    } catch {
      continue
    }
  }

  return { counts, recent, total: lines.length }
}

export async function GET() {
  try {
    const admin = await requireAdminSession()
    if (!admin.ok) return admin.response

    const summary = readGroundingLog()
    return NextResponse.json({ summary })
  } catch (error: unknown) {
    console.error('Error fetching grounding log:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch grounding log'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
