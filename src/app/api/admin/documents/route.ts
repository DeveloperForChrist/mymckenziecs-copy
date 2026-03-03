import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { requireAdminSession } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DocumentRow = {
  id: string
  uploaded_by?: string | null
  cases?: Array<{ users?: Array<{ email?: string | null }> | null }> | null
  name?: string | null
  type?: string | null
  created_at?: string | null
  file_size?: number | null
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

function parsePositiveInt(input: string | null, fallback: number) {
  const parsed = Number.parseInt(input || '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function clampLimit(input: string | null) {
  const parsed = parsePositiveInt(input, DEFAULT_LIMIT);
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdminSession();
    if (!admin.ok) return admin.response;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    const limit = clampLimit(searchParams.get('limit'));
    const offset = parsePositiveInt(searchParams.get('offset'), 0);
    const rangeEnd = offset + limit - 1;

    let query = supabaseAdmin
      .from('documents')
      .select(`
        id,
        name,
        type,
        file_size,
        created_at,
        case_id,
        uploaded_by,
        cases!inner(user_id, users!inner(email))
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, rangeEnd);

    if (userId) {
      query = query.eq('uploaded_by', userId);
    }

    const { data: docsData, error } = await query;

    if (error) {
      console.error('Error fetching documents:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const documents = (docsData || []).map((doc: DocumentRow) => ({
      id: doc.id,
      userId: doc.uploaded_by,
      userEmail: doc.cases?.[0]?.users?.[0]?.email || 'N/A',
      title: doc.name || 'Untitled',
      type: doc.type || 'General',
      status: 'Uploaded',
      createdAt: doc.created_at,
      preview: '',
      contentLength: doc.file_size || 0
    }));

    return NextResponse.json({
      documents,
      total: documents.length,
      pagination: {
        limit,
        offset,
        hasMore: (docsData || []).length === limit,
      },
    });
  } catch (error: any) {
    console.error('Error fetching documents:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch documents';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
