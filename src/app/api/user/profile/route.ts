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

    const user = data.user;
    const meta = user.user_metadata || {};

    // Try to fetch from users table
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRow) {
      // Fallback to auth metadata
      const fullName = (meta.full_name || meta.display_name || '').trim();
      const parts = fullName.split(' ');
      return NextResponse.json({
        firstName: meta.first_name || parts[0] || 'User',
        lastName: meta.last_name || parts.slice(1).join(' ') || '',
        email: user.email || ''
      });
    }

    const row = userRow as any;
    const nameFromRow = (row.name || row.fullName || row.full_name || '').trim();
    const nameParts = nameFromRow.split(' ');

    const profileData = {
      firstName: row.firstName || row.first_name || nameParts[0] || meta.first_name || 'User',
      lastName: row.lastName || row.last_name || nameParts.slice(1).join(' ') || meta.last_name || '',
      email: row.email || user.email || '',
    };

    return NextResponse.json(profileData);
  } catch (error: any) {
    console.error('Profile API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
