import 'server-only'

import { supabaseAdmin } from '@/lib/database/supabase-server'

export async function hasActiveClientPortalAccess(userId: string): Promise<boolean> {
  if (!userId) return false

  const { data, error } = await supabaseAdmin
    .from('client_business_links')
    .select('id')
    .eq('client_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Failed to load client portal access state', error)
    return false
  }

  return Boolean(data?.id)
}
