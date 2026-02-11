import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { getAdminSessionFromCookies } from '@/lib/auth/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  try {
    const session = getAdminSessionFromCookies();
    if (!session.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');

    const { data: entries, error } = await supabaseAdmin
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching audit log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entries: entries || [], total: (entries || []).length });
  } catch (error: any) {
    console.error('Error fetching audit log:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
