import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { isPaidPlan } from '@/lib/plans/access';

const DEFAULT_CASE_LIMIT = 50;
const MAX_CASE_LIMIT = 200;

const hasMeaningfulCaseProfile = (row: Record<string, any> | null | undefined): boolean => {
  if (!row) return false;
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  const externalId = typeof row.external_id === 'string' ? row.external_id.trim() : '';
  const caseType = typeof row.case_type === 'string' ? row.case_type.trim() : '';
  const description = typeof row.description === 'string' ? row.description.trim() : '';
  const normalizedTitle = title.toLowerCase();
  const hasTitle = Boolean(title) && normalizedTitle !== 'untitled case' && normalizedTitle !== 'case profile';
  return hasTitle || Boolean(externalId) || Boolean(caseType) || Boolean(description);
};

const hasPaidAccess = async (userId: string): Promise<boolean> => {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_type, status')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return isPaidPlan(data?.plan_type);
};

const parseBoundedPositiveInt = (value: string | null, fallback: number, max: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = authData.user.id;
    const { searchParams } = new URL(request.url);
    const limit = parseBoundedPositiveInt(searchParams.get('limit'), DEFAULT_CASE_LIMIT, MAX_CASE_LIMIT);
    const offset = parseBoundedPositiveInt(searchParams.get('offset'), 0, Number.MAX_SAFE_INTEGER);
    const rangeEnd = offset + limit;

    // Fetch bounded cases ordered by last_accessed/created_at.
    const { data: casesData, error: casesError } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('user_id', userId)
      .order('last_accessed', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, rangeEnd);

    if (casesError) {
      console.error('Failed to fetch cases from Supabase', casesError);
      return NextResponse.json({ error: 'Failed to fetch cases', cases: [] }, { status: 500 });
    }

    const rawRows = (casesData || []) as Record<string, any>[];
    const hasMore = rawRows.length > limit;
    const cases = rawRows
      .slice(0, limit)
      .filter((row: Record<string, any>) => hasMeaningfulCaseProfile(row));

    return NextResponse.json({
      cases,
      total: cases.length,
      plan: null,
      freeCaseLimit: null,
      pagination: {
        limit,
        offset,
        hasMore,
        nextOffset: offset + Math.min(rawRows.length, limit),
      },
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
    const paid = await hasPaidAccess(userId);
    if (!paid) {
      return NextResponse.json(
        { error: 'Read-only mode: resume plan to edit or delete case profiles.' },
        { status: 402 }
      );
    }

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
    const paid = await hasPaidAccess(userId);
    if (!paid) {
      return NextResponse.json(
        { error: 'Read-only mode: resume plan to edit case profiles.' },
        { status: 402 }
      );
    }

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
