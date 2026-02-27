import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = data.user.id;
    const authEmail = data.user.email || '';

    const { data: userRow, error: rowError } = await supabaseAdmin
      .from('users')
      .select('email, email_verified_at')
      .eq('id', authUid)
      .maybeSingle();

    if (rowError) {
      console.error('Verification status lookup failed:', rowError);
      return NextResponse.json({ error: 'Failed to load verification status' }, { status: 500 });
    }

    return NextResponse.json({
      email: userRow?.email || authEmail,
      verified: Boolean(userRow?.email_verified_at),
      verifiedAt: userRow?.email_verified_at || null,
    });
  } catch (error: any) {
    console.error('Verification status API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
