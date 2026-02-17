import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

declare global {
  var __mymckenzie_supabase_browser__: SupabaseClient | undefined
}

// Browser-side Supabase client singleton (prevents multiple GoTrueClient instances).
export const getSupabaseBrowserClient = (): SupabaseClient => {
  if (typeof window === 'undefined') {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }

  if (!globalThis.__mymckenzie_supabase_browser__) {
    globalThis.__mymckenzie_supabase_browser__ = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }

  return globalThis.__mymckenzie_supabase_browser__
}
