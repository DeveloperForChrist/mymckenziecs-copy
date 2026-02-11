import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const createSupabaseRouteClient = async () => {
  const cookieStore = await cookies()
  return createRouteHandlerClient({ cookies: () => cookieStore })
}
