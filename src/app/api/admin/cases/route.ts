import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  try {
    // Verify admin session
    const adminLoggedIn = request.headers.get('x-admin-auth');
    if (adminLoggedIn !== 'true') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const cases = (casesData || []).map((c: any) => ({
      id: c.id,
      userId: c.user_id,
      userEmail: c.users?.email || 'N/A',
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
  } catch (error: any) {
    console.error('Error fetching cases:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    // Verify admin session
    const adminLoggedIn = request.headers.get('x-admin-auth');
    if (adminLoggedIn !== 'true') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: any = await request.json();
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
  } catch (error: any) {
    console.error('Error deleting case:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
