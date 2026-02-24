import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';

const hasMeaningfulCaseProfile = (row: Record<string, unknown> | null | undefined): boolean => {
  if (!row) return false;
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  const externalId = typeof row.external_id === 'string' ? row.external_id.trim() : '';
  const caseType = typeof row.case_type === 'string' ? row.case_type.trim() : '';
  const description = typeof row.description === 'string' ? row.description.trim() : '';
  const normalizedTitle = title.toLowerCase();
  const hasTitle = Boolean(title) && normalizedTitle !== 'untitled case' && normalizedTitle !== 'case profile';
  return hasTitle || Boolean(externalId) || Boolean(caseType) || Boolean(description);
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = authData.user.id;

    console.log('📁 Fetching cases for user:', userId);
    // Ensure user exists in Supabase
    const { data: existingUser, error: userFetchError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (userFetchError) {
      console.error('Failed to fetch user from Supabase', userFetchError);
      return NextResponse.json({ error: 'Failed to fetch cases' }, { status: 500 });
    }

    let supabaseUserId = existingUser?.id as string | undefined;
    if (!supabaseUserId) {
      // Create user row if missing
      const email = authData.user.email || `${userId}@placeholder.local`;

      const insertPayload: any = { email };
      // Only set `id` when the supplied userId appears to be a valid uuid
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(userId)) insertPayload.id = userId;

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('users')
        .insert(insertPayload)
        .select('id')
        .single();
      if (insertErr) {
        console.error('Failed to create user in Supabase', insertErr);
        return NextResponse.json({ error: 'Failed to fetch cases' }, { status: 500 });
      }
      supabaseUserId = inserted.id;
    }

    // Fetch cases for this user ordered by last_accessed/updated_at
    const { data: casesData, error: casesError } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('user_id', supabaseUserId)
      .order('last_accessed', { ascending: false });

    if (casesError) {
      console.error('Failed to fetch cases from Supabase', casesError);
      return NextResponse.json({ error: 'Failed to fetch cases', cases: [] }, { status: 500 });
    }

    const cases = (casesData || []).filter((row: Record<string, unknown>) => hasMeaningfulCaseProfile(row));

    const caseLabel = cases.length === 1 ? 'case' : 'cases';
    console.log(`✅ Found ${cases.length} ${caseLabel} for user ${userId}`);

    return NextResponse.json({
      cases,
      total: cases.length,
      plan: null,
      freeCaseLimit: null
    });
  } catch (error: any) {
    console.error('Error fetching cases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cases', cases: [] },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { caseId } = await request.json();
    if (!caseId) {
      return NextResponse.json(
        { error: 'caseId is required' },
        { status: 400 }
      );
    }
    const userId = authData.user.id;

    // Ensure the case belongs to this user
    const { data: caseRow } = await supabaseAdmin
      .from('cases')
      .select('id')
      .eq('id', caseId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!caseRow) {
      return NextResponse.json({ success: true });
    }

    // Preserve chatbot history: detach all case-linked chat records before removing the case row.
    const { error: detachMessagesError } = await supabaseAdmin
      .from('messages')
      .update({ case_id: null })
      .eq('case_id', caseId)

    if (detachMessagesError) {
      console.error('Failed to detach chat messages from case', detachMessagesError);
      return NextResponse.json({ error: 'Failed to preserve chat history' }, { status: 500 });
    }

    const { error: detachMemoryError } = await supabaseAdmin
      .from('chat_memory')
      .update({ case_id: null })
      .eq('case_id', caseId)

    if (detachMemoryError) {
      console.error('Failed to detach chat memory from case', detachMemoryError);
      return NextResponse.json({ error: 'Failed to preserve chat history' }, { status: 500 });
    }

    const { error: detachActionItemsError } = await supabaseAdmin
      .from('chat_action_items')
      .update({ case_id: null })
      .eq('case_id', caseId)

    if (detachActionItemsError) {
      console.error('Failed to detach chat action items from case', detachActionItemsError);
      return NextResponse.json({ error: 'Failed to preserve chat history' }, { status: 500 });
    }

    // Documents are detached (case_id -> NULL) by migration/foreign key constraints.
    const { error: deleteError } = await supabaseAdmin
      .from('cases')
      .delete()
      .eq('id', caseId);

    if (deleteError) {
      console.error('Failed to delete case from Supabase', deleteError);
      return NextResponse.json({ error: 'Failed to delete case' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting case:', error);
    return NextResponse.json(
      { error: 'Failed to delete case' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { caseId, updates } = body || {};
    if (!caseId || !updates) {
      return NextResponse.json({ error: 'caseId and updates are required' }, { status: 400 });
    }
    const userId = authData.user.id;

    // Ensure the case belongs to this user
    const { data: caseRow, error: caseError } = await supabaseAdmin
      .from('cases')
      .select('id')
      .eq('id', caseId)
      .eq('user_id', userId)
      .maybeSingle();

    if (caseError || !caseRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('cases')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('Failed to update case', updateError);
      return NextResponse.json({ error: 'Failed to update case' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, case: updated });
  } catch (error: any) {
    console.error('Error updating case:', error);
    return NextResponse.json({ error: 'Failed to update case' }, { status: 500 });
  }
}
