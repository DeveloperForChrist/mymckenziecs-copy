import 'server-only'

import type { User } from '@supabase/supabase-js'
import { isAssistantPlan } from '@/lib/plans/access'
import { getUserPlanData } from '@/lib/payments/user-plan'

export function preferredProductFromUserMetadata(authUser?: User | null) {
  const metadata = (authUser?.user_metadata || {}) as Record<string, unknown>
  const source = String(metadata.signup_source || metadata.product_source || '').trim().toLowerCase()
  if (source === 'assistant' || source === 'assistant-demo') return 'assistant'
  return null
}

export async function isAssistantOnlyAccount(authUser?: User | null) {
  if (!authUser?.id) return false
  const preferredProduct = preferredProductFromUserMetadata(authUser)
  const planData = await getUserPlanData(authUser.id, authUser.email ?? null)
  const plan = planData?.plan || 'No plan'

  return preferredProduct === 'assistant' || isAssistantPlan(plan)
}
