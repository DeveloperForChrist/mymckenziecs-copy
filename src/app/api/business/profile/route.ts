import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import {
  EMPTY_PROFESSIONAL_PROFILE,
  mapProfessionalProfileRow,
  profileToDatabasePayload,
  type ProfessionalProfileInput,
} from '@/lib/directory/profiles'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin
      .from('professional_profiles')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Business profile load failed', error)
      return NextResponse.json({ message: 'Unable to load profile.' }, { status: 500 })
    }

    return NextResponse.json({
      profile: data
        ? mapProfessionalProfileRow(data)
        : {
            ...EMPTY_PROFESSIONAL_PROFILE,
            id: '',
            ownerId: user.id,
            email: user.email || '',
            reviewCount: 0,
          },
    })
  } catch (error) {
    console.error('Business profile load failed', error)
    return NextResponse.json({ message: 'Unable to load profile.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as Partial<ProfessionalProfileInput>
    const payload = profileToDatabasePayload({
      ...body,
      email: body.email || user.email || '',
    })

    const { data, error } = await supabaseAdmin
      .from('professional_profiles')
      .upsert(
        {
          owner_id: user.id,
          ...payload,
        },
        { onConflict: 'owner_id' }
      )
      .select('*')
      .single()

    if (error) {
      console.error('Business profile save failed', error)
      return NextResponse.json({ message: 'Unable to save profile.' }, { status: 500 })
    }

    return NextResponse.json({ profile: mapProfessionalProfileRow(data) })
  } catch (error) {
    console.error('Business profile save failed', error)
    return NextResponse.json({ message: 'Unable to save profile.' }, { status: 500 })
  }
}
