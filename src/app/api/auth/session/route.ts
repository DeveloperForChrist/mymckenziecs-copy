import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'

export async function POST(request: Request) {
  void request
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const supabase = await createSupabaseRouteClient()
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}

export async function GET() {
  const supabase = await createSupabaseRouteClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    return NextResponse.json({ authenticated: false, uid: null })
  }
  return NextResponse.json({ authenticated: Boolean(data.user), uid: data.user?.id || null })
}
