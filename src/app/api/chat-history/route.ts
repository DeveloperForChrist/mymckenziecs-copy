import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { isPaidPlan } from '@/lib/plans/access';

function normalizeTimestamp(value: unknown): string {
  if (!value) {
    return new Date(0).toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }

  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function buildConversationTitle(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  if (!raw.trim()) return 'Conversation';

  const cleaned = raw
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\[[0-9]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'Conversation';

  const firstSegment = cleaned
    .split(/[.!?\n:]/)
    .map((part) => part.trim())
    .find((part) => part.length > 0) || cleaned;

  const withoutLeadIn = firstSegment
    .replace(/^(hi|hello|hey|hiya)\b[,\s-]*/i, '')
    .replace(/^(can|could|would)\s+you\s+/i, '')
    .replace(/^please\s+/i, '')
    .replace(/^i\s+need\s+(help\s+)?(with\s+)?/i, '')
    .trim();

  const words = (withoutLeadIn || firstSegment)
    .replace(/[^a-zA-Z0-9' -]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'Conversation';

  const compact = words.slice(0, 9).join(' ');
  const title = compact
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();

  return title || 'Conversation';
}


export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ conversations: [], total: 0, limited: true }, { status: 401 });
    }

    const authUid = authData.user.id;
    const { data: activeSub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_type, status')
      .eq('user_id', authUid)
      .in('status', ['active', 'past_due'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasPaidPlan = isPaidPlan(activeSub?.plan_type || '');
    if (!hasPaidPlan) {
      return NextResponse.json({ conversations: [], total: 0, limited: true }, { status: 403 });
    }
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('freemium_since')
      .eq('id', authUid)
      .maybeSingle();
    const freemiumSince = userRow?.freemium_since ? new Date(userRow.freemium_since) : null;
    const limited = !hasPaidPlan;
    const maxThreads = limited ? 5 : 60;
    const cutoffDate = process.env.FREEMIUM_CUTOFF_DATE ? new Date(process.env.FREEMIUM_CUTOFF_DATE) : null;

    const { data: casesData } = await supabaseAdmin
      .from('cases')
      .select('id')
      .eq('user_id', authUid)
      .is('deleted_at', null);

    const caseIds = (casesData || []).map((c) => c.id).filter(Boolean);
    if (caseIds.length === 0) {
      return NextResponse.json({ conversations: [], total: 0, limited });
    }

    let messageQuery = supabaseAdmin
      .from('messages')
      .select('conversation_id, case_id, role, content, timestamp')
      .in('case_id', caseIds)
      .order('timestamp', { ascending: false })
      .limit(600);

    if (limited && cutoffDate && !freemiumSince) {
      messageQuery = messageQuery.gte('timestamp', cutoffDate.toISOString());
    }

    const { data: messagesData, error: messagesError } = await messageQuery;

    if (messagesError) {
      console.error('Failed to load conversations', messagesError);
      return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
    }

    const conversationsMap = new Map<string, { id: string; title: string; timestamp: string; caseId?: string }>();

    for (const msg of messagesData || []) {
      const convId = msg.conversation_id;
      if (!convId) continue;
      if (!conversationsMap.has(convId)) {
        const title = buildConversationTitle(msg.content);
        conversationsMap.set(convId, {
          id: convId,
          title,
          timestamp: normalizeTimestamp(msg.timestamp),
          caseId: msg.case_id || undefined
        });
      } else {
        const existing = conversationsMap.get(convId);
        if (existing && existing.title === 'Conversation' && msg.role === 'user') {
          existing.title = buildConversationTitle(msg.content);
        }
      }
    }

    const sortedConversations = Array.from(conversationsMap.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    let conversations = sortedConversations;
    if (limited && freemiumSince) {
      const legacy = sortedConversations.filter((c) => new Date(c.timestamp) < freemiumSince);
      const recent = sortedConversations
        .filter((c) => new Date(c.timestamp) >= freemiumSince)
        .slice(0, maxThreads);
      conversations = [...legacy, ...recent]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } else if (limited && cutoffDate) {
      conversations = sortedConversations
        .filter((c) => new Date(c.timestamp) >= cutoffDate)
        .slice(0, maxThreads);
    } else {
      conversations = sortedConversations.slice(0, maxThreads);
    }

    return NextResponse.json({
      conversations,
      total: conversations.length,
      limited,
      freemiumSince: freemiumSince ? freemiumSince.toISOString() : null
    });
  } catch (error: unknown) {
    console.error('Chat history GET error:', error);
    return NextResponse.json({ error: 'Failed to load chat history' }, { status: 500 });
  }
}

// Get messages for a specific conversation/case
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ messages: [], total: 0, limited: true }, { status: 401 });
    }

    const authUid = authData.user.id;
    const { data: activeSub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_type, status')
      .eq('user_id', authUid)
      .in('status', ['active', 'past_due'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasPaidPlan = isPaidPlan(activeSub?.plan_type || '');
    if (!hasPaidPlan) {
      return NextResponse.json({ messages: [], total: 0, limited: true }, { status: 403 });
    }
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('freemium_since')
      .eq('id', authUid)
      .maybeSingle();
    const freemiumSince = userRow?.freemium_since ? new Date(userRow.freemium_since) : null;
    const limited = !hasPaidPlan;
    const cutoffDate = process.env.FREEMIUM_CUTOFF_DATE ? new Date(process.env.FREEMIUM_CUTOFF_DATE) : null;

    const { caseId, conversationId, sessionId } = await request.json();
    const resolvedConversationId = conversationId || sessionId;

    // If no context is provided, return empty result with limited flag so callers handle missing case context gracefully
    if (!caseId && !resolvedConversationId) {
      return NextResponse.json({ messages: [], total: 0, limited });
    }

    console.log('💬 Fetching messages for', { caseId, conversationId: resolvedConversationId, userId: authUid });

    const { data: casesData } = await supabaseAdmin
      .from('cases')
      .select('id')
      .eq('user_id', authUid)
      .is('deleted_at', null);
    const caseIds = (casesData || []).map((c) => c.id).filter(Boolean);
    if (caseIds.length === 0) {
      return NextResponse.json({ messages: [], total: 0, limited });
    }

    // Fetch messages from Supabase using chosen filter
    let query = supabaseAdmin
      .from('messages')
      .select('id, role, content, timestamp, metadata')
      .order('timestamp', { ascending: true });

    if (resolvedConversationId) query = query.eq('conversation_id', resolvedConversationId);
    else if (caseId) query = query.eq('case_id', caseId);

    query = query.in('case_id', caseIds);
    if (limited && cutoffDate && !freemiumSince) {
      query = query.gte('timestamp', cutoffDate.toISOString());
    }

    if (limited && freemiumSince && resolvedConversationId) {
      // Allow all conversations that started before downgrade.
      const { data: latestRow } = await supabaseAdmin
        .from('messages')
        .select('timestamp')
        .eq('conversation_id', resolvedConversationId)
        .in('case_id', caseIds)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      const latestTs = latestRow?.timestamp ? new Date(latestRow.timestamp) : null;
      const isLegacyConversation = latestTs ? latestTs < freemiumSince : false;

      if (!isLegacyConversation) {
        // Only allow the latest 5 free-era conversations.
        const { data: recentMessages } = await supabaseAdmin
          .from('messages')
          .select('conversation_id, timestamp')
          .in('case_id', caseIds)
          .gte('timestamp', freemiumSince.toISOString())
          .order('timestamp', { ascending: false })
          .limit(600);

        const recentMap = new Map<string, string>();
        for (const msg of recentMessages || []) {
          const cid = msg.conversation_id;
          if (!cid || recentMap.has(cid)) continue;
          recentMap.set(cid, msg.timestamp);
        }
        const allowedRecent = Array.from(recentMap.entries())
          .sort((a, b) => new Date(b[1]).getTime() - new Date(a[1]).getTime())
          .slice(0, 5)
          .map(([id]) => id);

        if (!allowedRecent.includes(resolvedConversationId)) {
          return NextResponse.json({ messages: [], total: 0, limited, freemiumSince: freemiumSince.toISOString() });
        }
      }
    }

    const { data: messagesData, error: messagesError } = await query;

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    const messageEntries = (messagesData || []).map((msg) => ({
      id: msg.id,
      role: msg.role,
      message: msg.content || '',
      timestamp: msg.timestamp || new Date().toISOString(),
      metadata:
        msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata)
          ? msg.metadata
          : undefined
    }));

    return NextResponse.json({
      messages: messageEntries,
      limited,
      freemiumSince: freemiumSince ? freemiumSince.toISOString() : null
    });
  } catch (error: unknown) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = authData.user.id;

    const { caseId, conversationId } = await request.json();

    if (!caseId && !conversationId) {
      return NextResponse.json({ error: 'Either caseId or conversationId is required' }, { status: 400 });
    }

    const { data: casesData } = await supabaseAdmin
      .from('cases')
      .select('id')
      .eq('user_id', authUid)
      .is('deleted_at', null);
    const caseIds = (casesData || []).map((c) => c.id).filter(Boolean);
    if (caseIds.length === 0) {
      return NextResponse.json({ success: true });
    }

    const query = supabaseAdmin.from('messages').delete();
    if (conversationId) query.eq('conversation_id', conversationId);
    else query.eq('case_id', caseId);
    query.in('case_id', caseIds);

    const { error: deleteError } = await query;

    if (deleteError) {
      console.error('Delete messages error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Delete conversation error:', error);
    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    );
  }
}
