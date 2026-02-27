import { serve } from 'https://deno.land/std@0.201.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const DAY_MS = 24 * 60 * 60 * 1000

const parseEnvInt = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(raw || '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

const buildLifecycleSchedule = (baseValue?: string | null) => {
  const base = baseValue ? new Date(baseValue) : new Date()
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base
  const archiveDays = parseEnvInt(Deno.env.get('BILLING_LIFECYCLE_ARCHIVE_DAYS'), 30, 1, 730)
  const deleteDays = parseEnvInt(Deno.env.get('BILLING_LIFECYCLE_DELETE_DAYS'), 90, archiveDays + 1, 3650)
  return {
    lapsedAt: safeBase,
    archiveAt: new Date(safeBase.getTime() + archiveDays * DAY_MS),
    deleteAt: new Date(safeBase.getTime() + deleteDays * DAY_MS),
  }
}

serve(async () => {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('NEXT_PUBLIC_SUPABASE_URL')
    const SUPABASE_SERVICE_KEY =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_KEY')

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { status: 500 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
    const nowIso = new Date().toISOString()

    const { data: overdue, error } = await supabase
      .from('subscriptions')
      .select('id, user_id, grace_period_end, lifecycle_lapsed_at, lifecycle_archive_at, lifecycle_delete_at')
      .eq('status', 'past_due')
      .lte('grace_period_end', nowIso)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    if (!overdue || overdue.length === 0) {
      return new Response(JSON.stringify({ ok: true, expired: 0 }), { status: 200 })
    }

    let expired = 0
    for (const row of overdue as any[]) {
      const schedule = row.lifecycle_lapsed_at
        ? {
            lapsedAt: new Date(row.lifecycle_lapsed_at),
            archiveAt: row.lifecycle_archive_at ? new Date(row.lifecycle_archive_at) : buildLifecycleSchedule(row.lifecycle_lapsed_at).archiveAt,
            deleteAt: row.lifecycle_delete_at ? new Date(row.lifecycle_delete_at) : buildLifecycleSchedule(row.lifecycle_lapsed_at).deleteAt,
          }
        : buildLifecycleSchedule(null)

      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          status: 'expired',
          lifecycle_lapsed_at: schedule.lapsedAt.toISOString(),
          lifecycle_archive_at: schedule.archiveAt.toISOString(),
          lifecycle_delete_at: schedule.deleteAt.toISOString(),
          lifecycle_archived_at: null,
          lifecycle_deleted_at: null,
          lifecycle_archive_notice_sent_at: null,
          lifecycle_delete_notice_sent_at: null,
          lifecycle_archive_warning_days_sent: [],
          lifecycle_delete_warning_days_sent: [],
          lifecycle_reminder_days_sent: [],
          updated_at: nowIso,
        })
        .eq('id', row.id)

      if (updateError) continue
      expired += 1
    }

    return new Response(JSON.stringify({ ok: true, expired }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), { status: 500 })
  }
})
