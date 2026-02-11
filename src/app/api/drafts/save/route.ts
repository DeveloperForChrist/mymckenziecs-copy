import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = authData.user.id;

    const body: any = await request.json();
    const { title, content, type } = body || {};
    const providedCaseId = typeof body?.caseId === 'string' ? body.caseId : undefined;
    const caseProfile = body?.caseProfile && typeof body.caseProfile === 'object' ? body.caseProfile : null;
    const caseId = providedCaseId || (caseProfile && typeof caseProfile.id === 'string' ? caseProfile.id : undefined);
    if (!caseId || !content) {
      return NextResponse.json({ error: 'caseId/caseProfile and content are required' }, { status: 400 });
    }

    // Resolve Supabase user row
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', authUid)
      .maybeSingle();

    if (!userRow) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify case belongs to user
    const { data: caseRow } = await supabaseAdmin
      .from('cases')
      .select('id')
      .eq('id', caseId)
      .eq('user_id', userRow.id)
      .maybeSingle();

    if (!caseRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const safeTitle = typeof title === 'string' && title.trim().length > 0
      ? title.trim().slice(0, 120)
      : 'Draft document';
    const safeType = typeof type === 'string' && type.trim().length > 0
      ? type.trim().slice(0, 60)
      : 'Draft';
    const safeContent = String(content);

    // Note: Drafts table doesn't exist in schema yet
    // For now, store as a document with type 'draft'
    const { data: insertedDoc, error: insertError } = await supabaseAdmin
      .from('documents')
      .insert({
        case_id: caseId,
        name: safeTitle,
        storage_url: '', // No file storage for drafts
        type: safeType,
        mime_type: 'text/plain',
        uploaded_by: userRow.id
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to save draft:', insertError);
      return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: insertedDoc.id });
  } catch (error: any) {
    console.error('Save draft error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to save draft' },
      { status: 500 }
    );
  }
}
