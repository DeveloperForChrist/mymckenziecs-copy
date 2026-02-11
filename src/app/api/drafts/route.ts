import { NextRequest, NextResponse } from 'next/server';
import { DocGeneratorTool } from '@/lib/ai/tools/doc-generator-tool';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { message, includeUserDetails, caseId } = await request.json();

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    console.log('🔍 Generating draft document for:', message);
    console.log('📋 Include user details:', includeUserDetails);

    // Build prompt with user details if enabled
    let fullPrompt = message;
    let userContext = '';

    if (includeUserDetails) {
      const supabase = await createSupabaseRouteClient();
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        try {
          const authUid = authData.user.id;

          // Fetch user row
          const { data: userRow } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', authUid)
            .maybeSingle();

          const userData = userRow || {};

          let caseData: Record<string, any> | null = null;
          if (caseId && userRow) {
            const { data: caseRow } = await supabaseAdmin
              .from('cases')
              .select('*')
              .eq('id', caseId)
              .eq('user_id', userRow.id)
              .maybeSingle();
            caseData = caseRow || null;
          }
          if (!caseData && userRow) {
            const { data: latestCase } = await supabaseAdmin
              .from('cases')
              .select('*')
              .eq('user_id', userRow.id)
              .order('last_accessed', { ascending: false })
              .limit(1)
              .maybeSingle();
            caseData = latestCase || null;
          }

          const contextLines: string[] = [];
          contextLines.push('USER DETAILS (USE IF RELEVANT):');
          if ((userData as any).name || (userData as any).fullName) contextLines.push(`Name: ${(userData as any).name || (userData as any).fullName}`);
          if (userData.email) contextLines.push(`Email: ${userData.email}`);
          if ((userData as any).address) contextLines.push(`Address: ${(userData as any).address}`);

          if (caseData) {
            contextLines.push('');
            contextLines.push('CASE DETAILS:');
            if (caseData.title) contextLines.push(`Case title: ${caseData.title}`);
            if (caseData.case_type) contextLines.push(`Case type: ${caseData.case_type}`);
            if (caseData.court) contextLines.push(`Court: ${caseData.court}`);
            if (caseData.description) contextLines.push(`Description: ${caseData.description}`);
          }

          if (caseId && userRow) {
            try {
              const { data: docsData } = await supabaseAdmin
                .from('documents')
                .select('id, name, type')
                .eq('case_id', caseId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(5);
              if (docsData && docsData.length) {
                const docLines = docsData.map((doc: any) => `- ${doc.name || doc.id}`);
                contextLines.push('');
                contextLines.push('UPLOADED DOCUMENTS:');
                contextLines.push(...docLines);
              }

              const { data: messagesData } = await supabaseAdmin
                .from('messages')
                .select('role, content')
                .eq('case_id', caseId)
                .order('timestamp', { ascending: false })
                .limit(10);
              if (messagesData && messagesData.length) {
                const convoLines = messagesData
                  .map((msg: any) => {
                    const role = msg.role === 'assistant' ? 'Assistant' : 'User';
                    return `${role}: ${(msg.content || '').slice(0, 200)}`;
                  })
                  .reverse();
                contextLines.push('');
                contextLines.push('RECENT CONVERSATION:');
                contextLines.push(...convoLines);
              }
            } catch (error) {
              console.warn('⚠️ Conversation fetch skipped:', error);
            }
          }

          if (contextLines.length > 1) {
            userContext = `\n\n${contextLines.join('\n')}`;
            fullPrompt = message + userContext;
            console.log('✅ Included case context and conversation');
          }
        } catch (error) {
          console.error('⚠️ Error fetching user details:', error);
        }
      }
    }

    // Use doc generator tool to create the document
    const docTool = new DocGeneratorTool();
    const documentContent = await docTool._call(fullPrompt);

    const draftTitle = message.substring(0, 50) + (message.length > 50 ? '...' : '');
    const draftType = 'Letter';
    const draft = {
      id: Date.now().toString(),
      title: draftTitle,
      content: documentContent,
      type: draftType,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      preview: documentContent.substring(0, 150)
    };

    // Note: Draft saving to Supabase would require a drafts table
    // For now, drafts are returned in response only
    // TODO: Add drafts table to Supabase schema and persist here

    return NextResponse.json({
      success: true,
      draft
    });

  } catch (error: any) {
    console.error('Draft generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate draft' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // TODO: Fetch drafts from database
    // For now, return empty array or mock data
    return NextResponse.json({
      drafts: []
    });
  } catch (error: any) {
    console.error('Get drafts error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch drafts' },
      { status: 500 }
    );
  }
}
