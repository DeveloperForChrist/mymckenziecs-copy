import { supabaseAdmin } from '@/lib/database/supabase-server'

export type BusinessAlertType = 'deadline' | 'message' | 'lead' | 'system' | 'document' | 'meeting'
export type BusinessAlertPriority = 'urgent' | 'high' | 'medium' | 'low'

export const IMPORTANT_BUSINESS_ALERT_TYPES = ['deadline', 'message', 'meeting'] as const
export type ImportantBusinessAlertType = (typeof IMPORTANT_BUSINESS_ALERT_TYPES)[number]

export function isImportantBusinessAlertType(value: string | null | undefined): value is ImportantBusinessAlertType {
  return IMPORTANT_BUSINESS_ALERT_TYPES.includes(String(value || '').trim() as ImportantBusinessAlertType)
}

type CreateBusinessAlertInput = {
  businessId: string
  type: BusinessAlertType
  priority?: BusinessAlertPriority
  title: string
  body: string
  clientName?: string | null
  actionLabel?: string | null
  metadata?: Record<string, unknown>
  dedupeKey?: string | null
  dedupeWindowMinutes?: number
}

export async function createBusinessAlert(input: CreateBusinessAlertInput) {
  if (!isImportantBusinessAlertType(input.type)) {
    return
  }

  const dedupeKey = String(input.dedupeKey || '').trim()
  const dedupeWindowMinutes = Number.isFinite(input.dedupeWindowMinutes)
    ? Math.max(1, Number(input.dedupeWindowMinutes))
    : 10

  if (dedupeKey) {
    const cutoffIso = new Date(Date.now() - dedupeWindowMinutes * 60 * 1000).toISOString()
    const { data: existing } = await supabaseAdmin
      .from('business_alerts')
      .select('id')
      .eq('business_id', input.businessId)
      .contains('metadata', { dedupe_key: dedupeKey })
      .gte('created_at', cutoffIso)
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      return
    }
  }

  const { error } = await supabaseAdmin.from('business_alerts').insert({
    business_id: input.businessId,
    type: input.type,
    priority: input.priority || 'medium',
    title: input.title,
    body: input.body,
    client_name: input.clientName || null,
    action_label: input.actionLabel || null,
    metadata: {
      ...(input.metadata || {}),
      ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
    },
  })

  if (error) {
    console.error('Failed to create business alert', error)
  }
}
