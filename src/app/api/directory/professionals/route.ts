import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { mapProfessionalProfileRow } from '@/lib/directory/profiles'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('professional_profiles')
      .select('*')
      .eq('visible', true)
      .order('updated_at', { ascending: false })
      .limit(96)

    if (error) {
      console.error('Directory professionals load failed', error)
      return NextResponse.json({ message: 'Unable to load directory.' }, { status: 500 })
    }

    return NextResponse.json({ professionals: (data || []).map(mapProfessionalProfileRow) })
  } catch (error) {
    console.error('Directory professionals load failed', error)
    return NextResponse.json({ message: 'Unable to load directory.' }, { status: 500 })
  }
}
