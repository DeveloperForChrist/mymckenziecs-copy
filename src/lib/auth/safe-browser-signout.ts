import type { AuthError, SupabaseClient } from '@supabase/supabase-js'

const isMissingRefreshTokenError = (error: unknown) => {
  const message = String(
    (error as { message?: string } | null | undefined)?.message || ''
  ).toLowerCase()
  return (
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found')
  )
}

export async function safeBrowserSignOut(supabase: SupabaseClient) {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData?.session) return

    const { error } = await supabase.auth.signOut()
    if (error && !isMissingRefreshTokenError(error as AuthError)) {
      throw error
    }
  } catch (error) {
    if (isMissingRefreshTokenError(error)) return
    throw error
  }
}

