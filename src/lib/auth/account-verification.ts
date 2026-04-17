import { supabaseAdmin } from '@/lib/database/supabase-server'

export async function isUserEmailVerified(userId: string): Promise<boolean> {
  if (!userId) return false

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('email_verified_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load account verification state', error)
    return false
  }

  return Boolean((data as { email_verified_at?: string | null } | null)?.email_verified_at)
}
