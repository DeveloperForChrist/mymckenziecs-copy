import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { requireAdminSession } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CaseRow = {
  id: string
  user_id: string
  case_type?: string | null
  status?: string | null
  description?: string | null
  created_at?: string | null
  updated_at?: string | null
  users?: Array<{ email?: string | null }> | null
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdminSession();
    if (!admin.ok) return admin.response;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    const status = searchParams.get('status') || '';
    const limit = parseInt(searchParams.get('limit') || '100');

    let query = supabaseAdmin
      .from('cases')
      .select(`
        id,
        user_id,
        title,
        case_type,
        status,
        description,
        created_at,
        updated_at,
        users!inner(id, email)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data: casesData, error } = await query;

    if (error) {
      console.error('Error fetching cases:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const cases = (casesData || []).map((c: CaseRow) => ({
      id: c.id,
      userId: c.user_id,
      userEmail: c.users?.[0]?.email || 'N/A',
      caseNumber: 'N/A',
      caseType: c.case_type || 'N/A',
      status: c.status || 'Active',
      location: c.description || 'N/A',
      createdAt: c.created_at,
      lastUpdated: c.updated_at,
      keyFacts: [],
      partiesInvolved: []
    }));

    return NextResponse.json({ cases, total: cases.length });
  } catch (error: unknown) {
    console.error('Error fetching cases:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch cases';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdminSession();
    if (!admin.ok) return admin.response;

    const body = await request.json() as { caseId?: string; caseProfile?: { id?: string } };
    const providedCaseId = typeof body?.caseId === 'string' ? body.caseId : undefined;
    const caseProfile = body?.caseProfile && typeof body.caseProfile === 'object' ? body.caseProfile : null;
    const caseId = providedCaseId || (caseProfile && typeof caseProfile.id === 'string' ? caseProfile.id : undefined);

    if (!caseId) {
      return NextResponse.json({ error: 'caseId or caseProfile is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('cases')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', caseId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Case deleted' });
  } catch (error: unknown) {
    console.error('Error deleting case:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete case';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
