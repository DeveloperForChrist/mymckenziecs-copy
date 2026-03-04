import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'Please choose a password that is at least 8 characters long.'
  }

  if (!/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Please include at least one number and one special character.'
  }

  return null
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400 })
    }

    const currentEmail = (data.user.email || '').trim()
    if (!currentEmail) {
      return NextResponse.json({ error: 'Unable to verify current password for this account' }, { status: 400 })
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: currentPassword,
    })
    if (reauthError) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    const passwordValidationError = validatePassword(password)
    if (passwordValidationError) {
      return NextResponse.json({ error: passwordValidationError }, { status: 400 })
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      return NextResponse.json({ error: updateError.message || 'Failed to update password' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating password:', error)
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
  }
}
