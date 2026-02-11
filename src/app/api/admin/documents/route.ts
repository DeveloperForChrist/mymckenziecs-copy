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
    const limit = parseInt(searchParams.get('limit') || '50');

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
      .limit(limit);

    if (userId) {
      query = query.eq('uploaded_by', userId);
    }

    const { data: docsData, error } = await query;

    if (error) {
      console.error('Error fetching documents:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const documents = (docsData || []).map((doc: any) => ({
      id: doc.id,
      userId: doc.uploaded_by,
      userEmail: doc.cases?.users?.email || 'N/A',
      title: doc.name || 'Untitled',
      type: doc.type || 'General',
      status: 'Uploaded',
      createdAt: doc.created_at,
      preview: '',
      contentLength: doc.file_size || 0
    }));

    return NextResponse.json({ 
      documents, 
      total: documents.length 
    });
  } catch (error: any) {
    console.error('Error fetching documents:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
