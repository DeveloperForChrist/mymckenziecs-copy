import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

declare global {
  var __mymckenzie_supabase_browser__: SupabaseClient | undefined
}

const isStaleRefreshTokenError = (error: unknown) => {
  const code = String((error as any)?.code || '')
  const message = String((error as any)?.message || '').toLowerCase()
  return (
    code === 'refresh_token_not_found' ||
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found')
  )
}

const clearSupabaseBrowserState = () => {
  if (typeof window === 'undefined') return

  try {
    Object.keys(window.localStorage).forEach((key) => {
      if (key.startsWith('sb-') || key.includes('supabase')) {
        window.localStorage.removeItem(key)
      }
    })
  } catch {
    // Storage may be unavailable in private browsing or blocked contexts.
  }

  try {
    document.cookie.split(';').forEach((rawCookie) => {
      const name = rawCookie.split('=')[0]?.trim()
      if (!name || (!name.startsWith('sb-') && !name.includes('supabase'))) return
      document.cookie = `${name}=; Max-Age=0; path=/`
    })
  } catch {
    // Cookie access can fail in restricted browser contexts.
  }
}

const guardBrowserAuth = (client: SupabaseClient) => {
  const auth = client.auth as any

  const getUser = auth.getUser.bind(auth)
  auth.getUser = async (...args: any[]) => {
    const result = await getUser(...args)
    if (result?.error && isStaleRefreshTokenError(result.error)) {
      clearSupabaseBrowserState()
      return { data: { user: null }, error: null }
    }
    return result
  }

  const getSession = auth.getSession.bind(auth)
  auth.getSession = async (...args: any[]) => {
    const result = await getSession(...args)
    if (result?.error && isStaleRefreshTokenError(result.error)) {
      clearSupabaseBrowserState()
      return { data: { session: null }, error: null }
    }
    return result
  }

  if (typeof auth.refreshSession === 'function') {
    const refreshSession = auth.refreshSession.bind(auth)
    auth.refreshSession = async (...args: any[]) => {
      const result = await refreshSession(...args)
      if (result?.error && isStaleRefreshTokenError(result.error)) {
        clearSupabaseBrowserState()
        return { data: { session: null, user: null }, error: null }
      }
      return result
    }
  }

  return client
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
    globalThis.__mymckenzie_supabase_browser__ = guardBrowserAuth(
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    )
  }

  return globalThis.__mymckenzie_supabase_browser__
}
