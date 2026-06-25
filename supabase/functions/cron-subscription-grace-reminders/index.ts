import { serve } from 'https://deno.land/std@0.201.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'
import { Resend } from 'npm:resend'

type SubscriptionRow = {
  id: string
  user_id: string
  past_due_since: string | null
  grace_period_end: string | null
  next_retry_at: string | null
  grace_day3_sent_at: string | null
  grace_day6_sent_at: string | null
  grace_reminder_days_sent: unknown
}

type UserRow = {
  id: string
  email: string
  name: string | null
}

const getReminderDays = (): number[] => {
  const raw = (Deno.env.get('BILLING_GRACE_REMINDER_DAYS') || '1,2,3,5,6').trim()
  const parsed = raw
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.max(1, Math.min(30, value)))
  const uniqueSorted = Array.from(new Set(parsed)).sort((a, b) => a - b)
  return uniqueSorted.length > 0 ? uniqueSorted : [1, 2, 3, 5, 6]
}

const parseSentReminderDays = (value: unknown): Set<number> => {
  const sent = new Set<number>()
  if (Array.isArray(value)) {
    for (const entry of value) {
      const num = Number.parseInt(String(entry), 10)
      if (Number.isFinite(num) && num > 0) sent.add(num)
    }
  }
  return sent
}

const formatDateLabel = (value?: Date | number | string | null): string => {
  if (!value) return 'soon'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'soon'
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

const standardReminderTemplate = (vars: Record<string, string>) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#17202a;line-height:1.6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" data-mymckenziecs-email="plain"><tr><td align="center" style="padding:0 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;">
<tr><td style="padding:30px 0 18px;border-bottom:2px solid #17324d;"><p style="margin:0;font-size:18px;font-weight:800;color:#17324d;">MyMcKenzieCS</p><p style="margin:4px 0 0;font-size:12px;color:#5b6775;letter-spacing:.08em;text-transform:uppercase;">Secure legal case workspace</p></td></tr>
<tr><td style="padding:30px 0 26px;"><h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;color:#17202a;">Payment reminder</h1>
<p style="margin:0 0 16px;">Hi ${vars.name},</p>
<p style="margin:0 0 16px;color:#344054;">We still have not been able to complete your payment.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border-top:1px solid #d9e2ec;border-bottom:1px solid #d9e2ec;border-collapse:collapse;">
<tr><td style="width:34%;padding:9px 16px 9px 0;border-top:1px solid #edf2f7;font-size:13px;color:#5b6775;font-weight:700;">Next retry date</td><td style="padding:9px 0;border-top:1px solid #edf2f7;font-size:14px;color:#17202a;">${vars.next_retry_date}</td></tr>
<tr><td style="width:34%;padding:9px 16px 9px 0;border-top:1px solid #edf2f7;font-size:13px;color:#5b6775;font-weight:700;">Grace period ends</td><td style="padding:9px 0;border-top:1px solid #edf2f7;font-size:14px;color:#17202a;">${vars.grace_end_date}</td></tr>
</table>
<p style="margin:0 0 22px;color:#344054;">If payment is not completed by the grace period end date, your account will move to the Free plan.</p>
<p style="margin:0 0 22px;"><a href="${vars.manage_url}" style="display:inline-block;background:#17324d;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 16px;">Update payment method</a></p>
<p style="margin:0;font-size:14px;color:#344054;">Kind regards,<br />The MyMcKenzieCS team</p></td></tr>
<tr><td style="padding:18px 0 34px;border-top:1px solid #d9e2ec;font-size:12px;color:#667085;">This transactional email was sent in relation to your MyMcKenzieCS billing activity.</td></tr>
</table></td></tr></table></body></html>`

const finalReminderTemplate = (vars: Record<string, string>) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#17202a;line-height:1.6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" data-mymckenziecs-email="plain"><tr><td align="center" style="padding:0 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;">
<tr><td style="padding:30px 0 18px;border-bottom:2px solid #17324d;"><p style="margin:0;font-size:18px;font-weight:800;color:#17324d;">MyMcKenzieCS</p><p style="margin:4px 0 0;font-size:12px;color:#5b6775;letter-spacing:.08em;text-transform:uppercase;">Secure legal case workspace</p></td></tr>
<tr><td style="padding:30px 0 26px;"><h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;color:#17202a;">Final payment reminder</h1>
<p style="margin:0 0 16px;">Hi ${vars.name},</p>
<p style="margin:0 0 16px;color:#344054;">This is your final reminder. We still have not been able to collect your subscription payment.</p>
<p style="margin:0 0 22px;color:#344054;">If payment is not completed by <strong>${vars.grace_end_date}</strong>, your subscription access will end and your account will move to the Free plan.</p>
<p style="margin:0 0 22px;"><a href="${vars.manage_url}" style="display:inline-block;background:#17324d;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 16px;">Update payment method now</a></p>
<p style="margin:0;font-size:14px;color:#344054;">Kind regards,<br />The MyMcKenzieCS team</p></td></tr>
<tr><td style="padding:18px 0 34px;border-top:1px solid #d9e2ec;font-size:12px;color:#667085;">This transactional email was sent in relation to your MyMcKenzieCS billing activity.</td></tr>
</table></td></tr></table></body></html>`

serve(async () => {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('NEXT_PUBLIC_SUPABASE_URL')
    const SUPABASE_SERVICE_KEY =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_KEY')
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || Deno.env.get('RESEND_KEY')

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { status: 500 })
    }
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Resend env not configured' }), { status: 500 })
    }

    const reminderDays = getReminderDays()
    const highestReminderDay = reminderDays[reminderDays.length - 1]
    const now = new Date()
    const dayMs = 24 * 60 * 60 * 1000
    const manageUrl =
      (Deno.env.get('NEXT_PUBLIC_APP_URL') || '').trim() || 'https://www.mymckenziecs.com/settings'

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
    const resend = new Resend(RESEND_API_KEY)

    const { data: subs, error: subsError } = await supabase
      .from('subscriptions')
      .select('id, user_id, past_due_since, grace_period_end, next_retry_at, grace_day3_sent_at, grace_day6_sent_at, grace_reminder_days_sent')
      .eq('status', 'past_due')

    if (subsError) {
      return new Response(JSON.stringify({ error: subsError.message }), { status: 500 })
    }
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 })
    }

    const userIds = Array.from(new Set((subs as SubscriptionRow[]).map((s) => s.user_id).filter(Boolean)))
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name')
      .in('id', userIds)

    if (usersError) {
      return new Response(JSON.stringify({ error: usersError.message }), { status: 500 })
    }

    const usersById = new Map((users || []).map((u) => [(u as UserRow).id, u as UserRow]))
    let sent = 0

    for (const sub of subs as SubscriptionRow[]) {
      const user = usersById.get(sub.user_id)
      if (!user?.email) continue
      if (!sub.past_due_since || !sub.grace_period_end) continue

      const daysSince = Math.floor((now.getTime() - new Date(sub.past_due_since).getTime()) / dayMs)
      const sentDays = parseSentReminderDays(sub.grace_reminder_days_sent)
      if (sub.grace_day3_sent_at) sentDays.add(3)
      if (sub.grace_day6_sent_at) sentDays.add(6)

      const dueUnsentDays = reminderDays.filter((day) => day <= daysSince && !sentDays.has(day))
      if (dueUnsentDays.length === 0) continue

      const selectedDay = dueUnsentDays[dueUnsentDays.length - 1]
      const isFinalReminder = selectedDay >= highestReminderDay

      const vars = {
        name: user.name || '',
        next_retry_date: formatDateLabel(sub.next_retry_at ? new Date(sub.next_retry_at) : null),
        grace_end_date: formatDateLabel(new Date(sub.grace_period_end)),
        manage_url: manageUrl,
      }

      const htmlBody = isFinalReminder ? finalReminderTemplate(vars) : standardReminderTemplate(vars)
      const subject = isFinalReminder ? 'Final payment reminder' : 'Payment reminder'
      const tag = isFinalReminder ? 'billing-payment-reminder-final' : `billing-payment-reminder-day-${selectedDay}`

      await resend.emails.send({
        from: Deno.env.get('RESEND_ALERT_FROM_EMAIL') || 'alerts@mymckenziecs.com',
        to: user.email,
        subject,
        html: htmlBody,
        tags: [{ name: 'tag', value: tag }],
      })

      for (const day of dueUnsentDays) sentDays.add(day)
      const updatePayload: Record<string, unknown> = {
        grace_reminder_days_sent: Array.from(sentDays).sort((a, b) => a - b),
        updated_at: now.toISOString(),
      }
      if (sentDays.has(3)) updatePayload.grace_day3_sent_at = now.toISOString()
      if (sentDays.has(6)) updatePayload.grace_day6_sent_at = now.toISOString()

      await supabase.from('subscriptions').update(updatePayload).eq('id', sub.id)
      sent += 1
    }

    return new Response(JSON.stringify({ ok: true, sent }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), { status: 500 })
  }
})
