import 'server-only'

import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isUserEmailVerified } from '@/lib/auth/account-verification'
import { hasActiveClientPortalAccess } from '@/lib/auth/client-portal-access'

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
        hasActiveClientPortalAccess(authUser.id),
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
