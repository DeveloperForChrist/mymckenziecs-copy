import { serve } from 'https://deno.land/std@0.201.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'

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
      .select('id, user_id, grace_period_end')
      .eq('status', 'past_due')
      .lte('grace_period_end', nowIso)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    if (!overdue || overdue.length === 0) {
      return new Response(JSON.stringify({ ok: true, expired: 0 }), { status: 200 })
    }

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        status: 'expired',
        updated_at: nowIso,
      })
      .in('id', overdue.map((row: any) => row.id))

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), { status: 500 })
    }

    return new Response(JSON.stringify({ ok: true, expired: overdue.length }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), { status: 500 })
  }
})
