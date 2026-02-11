import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { caseId, caseType, caseTitle, caseDescription, userId } = body || {}

    if (!caseTitle && !caseDescription) {
      return NextResponse.json({ error: 'Missing caseTitle or caseDescription' }, { status: 400 })
    }

    // Try to insert a new case record. If a specific external id (caseId) is provided,
    // attach it as `external_id` so callers can reference it.
    const payload: Record<string, unknown> = {
      title: caseTitle || caseDescription?.slice(0, 80) || 'Untitled case',
      case_type: caseType || null,
      description: caseDescription || null,
      external_id: caseId || null,
      user_id: userId || null
    }

    const { data, error } = await supabaseAdmin.from('cases').insert(payload).select().limit(1)

    if (error) {
      console.error('supabase insert error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const created = Array.isArray(data) ? data[0] : data
    return NextResponse.json({ ok: true, case: created })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ ok: true, case: null });
    }

    const { data, error } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('supabase query error', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const found = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return NextResponse.json({ ok: true, case: found });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

