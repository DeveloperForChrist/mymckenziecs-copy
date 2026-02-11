import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { OpenAI } from 'openai';

const MODEL = 'gpt-4o-mini';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { caseId } = body || {};
    if (!caseId) {
      return NextResponse.json({ error: 'caseId is required' }, { status: 400 });
    }

    const { data: caseRow, error: caseError } = await supabaseAdmin
      .from('cases')
      .select('id, user_id, title, description, case_type')
      .eq('id', caseId)
      .maybeSingle();

    if (caseError || !caseRow || caseRow.user_id !== authData.user.id) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const { data: docs } = await supabaseAdmin
      .from('documents')
      .select('id, name, type, created_at')
      .eq('case_id', caseId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('role, content, timestamp')
      .eq('case_id', caseId)
      .order('timestamp', { ascending: false })
      .limit(200);

    const docList = (docs || []).map((d: any) => `${d.name}${d.type ? ` (${d.type})` : ''}`).join('\n');
    const messageText = (messages || [])
      .reverse()
      .map((m: any) => `${m.role}: ${String(m.content || '').slice(0, 500)}`)
      .join('\n');

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = `You generate concise checklists for a UK legal case. 
Return valid JSON with three arrays: documents, procedural, actions.
Each item should be short, specific, and actionable. Avoid legal advice.
Do not use markdown, bullets, numbering, or special formatting. Plain text only.`;

    const user = `Case title: ${caseRow.title || 'Untitled'}
Case type: ${caseRow.case_type || 'General'}
Case summary: ${caseRow.description || 'N/A'}

Documents uploaded:
${docList || 'None'}

Conversation history:
${messageText || 'None'}

Return JSON like:
{"documents":["..."],"procedural":["..."],"actions":["..."]}`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 800
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      parsed = {};
    }

    const normalizeItem = (value: string) =>
      value
        .replace(/^[\s>*\-•\d\.)]+/g, '')
        .replace(/[`*_~]/g, '')
        .trim();

    const toItems = (arr: any[]) =>
      (Array.isArray(arr) ? arr : [])
        .filter(Boolean)
        .map((text: string) => ({
          id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          text: normalizeItem(String(text)),
          done: false
        }));

    const checklist = {
      documents: toItems(parsed.documents),
      procedural: toItems(parsed.procedural),
      actions: toItems(parsed.actions)
    };

    await supabaseAdmin
      .from('cases')
      .update({
        checklist_documents: checklist.documents,
        checklist_procedural: checklist.procedural,
        checklist_actions: checklist.actions,
        checklist_updated_at: new Date().toISOString(),
        checklist_auto_generated_at: new Date().toISOString()
      })
      .eq('id', caseId);

    return NextResponse.json({ ok: true, checklist });
  } catch (error: any) {
    console.error('Checklist auto error:', error);
    return NextResponse.json({ error: 'Failed to generate checklist' }, { status: 500 });
  }
}
