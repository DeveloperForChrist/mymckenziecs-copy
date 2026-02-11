import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authUid = data.user.id
    const { data: userRow, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authUid)
      .maybeSingle()

    if (userError) {
      console.error('Error fetching user data:', userError)
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 })
    }

    if (!userRow) {
      return NextResponse.json({
        fullName: data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || '',
        email: data.user.email || '',
        address: '',
        createdAt: data.user.created_at || new Date().toISOString(),
        lastActive: null
      })
    }

    return NextResponse.json({
      fullName: (userRow as any).fullName || (userRow as any).full_name || userRow.name || '',
      email: userRow.email || data.user.email || '',
      address: (userRow as any).address || '',
      createdAt: userRow.created_at || data.user.created_at || '',
      lastActive: (userRow as any).last_active || null
    })
  } catch (error: any) {
    console.error('Error fetching user data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user data' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const address = typeof body?.address === 'string' ? body.address.trim() : ''

    const authUid = data.user.id
    const nowIso = new Date().toISOString()

    const basePayload: Record<string, any> = {
      id: authUid,
      email: email || data.user.email || null,
      name: fullName || data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || null,
      updated_at: nowIso
    }

    const extendedPayload: Record<string, any> = {
      ...basePayload,
      fullName: fullName || null,
      address: address || null,
      last_active: nowIso
    }

    const attemptUpsert = async (payload: Record<string, any>) => {
      return supabaseAdmin
        .from('users')
        .upsert(payload, { onConflict: 'id' })
        .select('id')
        .maybeSingle()
    }

    let upsertResult = await attemptUpsert(extendedPayload)
    if (upsertResult.error) {
      upsertResult = await attemptUpsert(basePayload)
    }

    if (upsertResult.error) {
      console.error('Error updating user data:', upsertResult.error)
      return NextResponse.json({ error: 'Failed to update user data' }, { status: 500 })
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating user data:', error);
    return NextResponse.json(
      { error: 'Failed to update user data' },
      { status: 500 }
    );
  }
}
