import 'server-only'

import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isUserEmailVerified } from '@/lib/auth/account-verification'
import { supabaseAdmin } from '@/lib/database/supabase-server'

async function hasActiveClientPortalLink(userId: string) {
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

export const getClientPortalSession = cache(async () => {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // No-op in server component render context.
        },
      },
    }
  )

  const { data: authData } = await supabase.auth.getUser()
  const authUser = authData?.user ?? null
  const [emailVerified, hasClientPortalAccess] = authUser
    ? await Promise.all([
        isUserEmailVerified(authUser.id),
        hasActiveClientPortalLink(authUser.id),
      ])
    : [false, false]

  return {
    supabase,
    authUser,
    emailVerified,
    hasClientPortalAccess,
    canOpenClientPortal: emailVerified || hasClientPortalAccess,
  }
})
