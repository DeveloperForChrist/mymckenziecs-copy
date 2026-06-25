import 'server-only'

import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isUserEmailVerified } from '@/lib/auth/account-verification'

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
  const emailVerified = authUser ? await isUserEmailVerified(authUser.id) : false

  return {
    supabase,
    authUser,
    emailVerified,
  }
})
