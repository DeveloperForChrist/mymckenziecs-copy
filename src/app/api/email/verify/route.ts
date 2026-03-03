import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { getAppUrl } from '@/lib/app-url'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function safeRedirectPath(input?: string | null) {
  if (!input) return '/dashboard'
  const normalized = input.trim()
  return normalized.startsWith('/') ? normalized : '/dashboard'
}

function buildVerifyRedirect(baseUrl: string, status: 'invalid' | 'expired', redirectPath?: string) {
  const next = new URL('/auth/verify-email', baseUrl)
  next.searchParams.set('status', status)
  if (redirectPath && redirectPath.startsWith('/')) {
    next.searchParams.set('redirect', redirectPath)
  }
  return next
}

export async function GET(request: NextRequest) {
  const baseUrl = getAppUrl(request)
  try {
    const token = request.nextUrl.searchParams.get('token') || ''
    const redirectPath = safeRedirectPath(request.nextUrl.searchParams.get('redirect'))

    if (!token) {
      return NextResponse.redirect(buildVerifyRedirect(baseUrl, 'invalid', redirectPath))
    }

    const tokenHash = createHash('sha256').update(token).digest('hex')
    const { data: userRow, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, verification_token_expires_at, email_verified_at')
      .eq('verification_token_hash', tokenHash)
      .maybeSingle()

    if (userError || !userRow?.id) {
      return NextResponse.redirect(buildVerifyRedirect(baseUrl, 'invalid', redirectPath))
    }

    if (userRow.email_verified_at) {
      return NextResponse.redirect(new URL(redirectPath, baseUrl))
    }

    const expiresAt = userRow.verification_token_expires_at
      ? new Date(userRow.verification_token_expires_at).getTime()
      : 0
    if (!expiresAt || Date.now() > expiresAt) {
      await supabaseAdmin
        .from('users')
        .update({ verification_token_hash: null, verification_token_expires_at: null })
        .eq('id', userRow.id)
      return NextResponse.redirect(buildVerifyRedirect(baseUrl, 'expired', redirectPath))
    }

    const nowIso = new Date().toISOString()
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userRow.id, {
      email_confirm: true,
    })
    if (authUpdateError) {
      return NextResponse.redirect(buildVerifyRedirect(baseUrl, 'invalid', redirectPath))
    }

    await supabaseAdmin
      .from('users')
      .update({
        email_verified_at: nowIso,
        verification_token_hash: null,
        verification_token_expires_at: null,
      })
      .eq('id', userRow.id)

    return NextResponse.redirect(new URL(redirectPath, baseUrl))
  } catch {
    const redirectPath = safeRedirectPath(request.nextUrl.searchParams.get('redirect'))
    return NextResponse.redirect(buildVerifyRedirect(baseUrl, 'invalid', redirectPath))
  }
}
