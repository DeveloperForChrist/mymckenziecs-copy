import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { isPaidPlan } from '@/lib/plans/access';

type ConversationSummary = {
  id: string;
  title: string;
  timestamp: string;
  caseId?: string;
};

type ConversationMessageRow = {
  id?: string;
  conversation_id: string | null;
  case_id: string | null;
  role: string;
  content: string | null;
  timestamp: string | null;
  metadata?: unknown;
};

const BILLING_ACTIVE_STATUSES = ['active', 'past_due'];
const MAX_THREADS = 60;

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

const dedupe = <T,>(items: T[]): T[] => Array.from(new Set(items.filter(Boolean) as T[]));

async function resolveUserIdsByEmail(email: string | null): Promise<string[]> {
  if (!email) return [];
  const normalizedEmail = email.trim();
  if (!normalizedEmail) return [];

  const { data } = await supabaseAdmin
    .from('users')
    .select('id')
    .ilike('email', normalizedEmail);

  return dedupe((data || []).map((row: any) => row.id).filter(Boolean));
}

async function hasPaidPlanAccess(authUid: string, authEmail: string | null): Promise<boolean> {
  const hasPaidForUserIds = async (userIds: string[]) => {
    if (userIds.length === 0) return false;

    const { data: activeSub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_type')
      .in('user_id', userIds)
      .in('status', BILLING_ACTIVE_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isPaidPlan(activeSub?.plan_type || '')) return true;

    const { data: latestSub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_type')
      .in('user_id', userIds)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return isPaidPlan(latestSub?.plan_type || '');
  };

  if (await hasPaidForUserIds([authUid])) return true;

  const emailUserIds = await resolveUserIdsByEmail(authEmail);
  if (emailUserIds.length === 0) return false;
  return hasPaidForUserIds(emailUserIds);
}

async function getOwnedCaseIds(authUid: string, authEmail: string | null): Promise<string[]> {
  const emailUserIds = await resolveUserIdsByEmail(authEmail);
  const userIds = dedupe([authUid, ...emailUserIds]);
  if (userIds.length === 0) return [];

  const { data } = await supabaseAdmin
    .from('cases')
    .select('id')
    .in('user_id', userIds)
    .is('deleted_at', null);

  return dedupe((data || []).map((row: any) => row.id).filter(Boolean));
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchMessagesByConversationIds(
  conversationIds: string[],
  maxRows = 1200
): Promise<ConversationMessageRow[]> {
  if (conversationIds.length === 0) return [];

  const chunks = chunkArray(dedupe(conversationIds), 80);
  const perChunkLimit = Math.max(80, Math.ceil(maxRows / Math.max(1, chunks.length)));
  const rows: ConversationMessageRow[] = [];

  for (const chunk of chunks) {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('id, conversation_id, case_id, role, content, timestamp, metadata')
      .in('conversation_id', chunk)
      .order('timestamp', { ascending: false })
      .limit(perChunkLimit);

    if (error) {
      console.error('Failed to fetch conversation messages', error);
      continue;
    }

    rows.push(...((data || []) as ConversationMessageRow[]));
  }

  return rows;
}

async function fetchMessagesByCaseIds(caseIds: string[], maxRows = 1200): Promise<ConversationMessageRow[]> {
  if (caseIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id, conversation_id, case_id, role, content, timestamp, metadata')
    .in('case_id', caseIds)
    .order('timestamp', { ascending: false })
    .limit(maxRows);

  if (error) {
    console.error('Failed to fetch case-linked messages', error);
    return [];
  }

  return (data || []) as ConversationMessageRow[];
}

async function canAccessConversation(
  authUid: string,
  conversationId: string,
  caseIds: string[]
): Promise<boolean> {
  const { data: memoryRow } = await supabaseAdmin
    .from('chat_memory')
    .select('conversation_id')
    .eq('user_id', authUid)
    .eq('conversation_id', conversationId)
    .limit(1)
    .maybeSingle();

  if (memoryRow?.conversation_id) return true;

  const { data: actionRow } = await supabaseAdmin
    .from('chat_action_items')
    .select('id')
    .eq('user_id', authUid)
    .eq('conversation_id', conversationId)
    .limit(1)
    .maybeSingle();

  if (actionRow?.id) return true;

  if (caseIds.length > 0) {
    const { data: messageRow } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .in('case_id', caseIds)
      .limit(1)
      .maybeSingle();

    if (messageRow?.id) return true;
  }

  return false;
}

function mergeConversations(
  memoryRows: Array<{ conversation_id: string | null; memory_summary: string | null; updated_at: string | null; case_id: string | null }>,
  messageRows: ConversationMessageRow[]
): ConversationSummary[] {
  const map = new Map<string, ConversationSummary>();

  for (const row of memoryRows) {
    const conversationId = row.conversation_id;
    if (!conversationId) continue;
    map.set(conversationId, {
      id: conversationId,
      title: buildConversationTitle(row.memory_summary || ''),
      timestamp: normalizeTimestamp(row.updated_at),
      caseId: row.case_id || undefined,
    });
  }

  for (const msg of messageRows) {
    const conversationId = msg.conversation_id;
    if (!conversationId) continue;

    const msgTimestamp = normalizeTimestamp(msg.timestamp);
    const existing = map.get(conversationId);
    const msgTitle = buildConversationTitle(msg.content || '');

    if (!existing) {
      map.set(conversationId, {
        id: conversationId,
        title: msgTitle,
        timestamp: msgTimestamp,
        caseId: msg.case_id || undefined,
      });
      continue;
    }

    if (new Date(msgTimestamp).getTime() > new Date(existing.timestamp).getTime()) {
      existing.timestamp = msgTimestamp;
      if (msg.case_id) existing.caseId = msg.case_id;
    }

    if ((existing.title === 'Conversation' || !existing.title) && msg.role === 'user') {
      existing.title = msgTitle;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_THREADS);
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ conversations: [], total: 0, limited: true }, { status: 401 });
    }

    const authUid = authData.user.id;
    const authEmail = authData.user.email || null;
    const hasPaidPlan = await hasPaidPlanAccess(authUid, authEmail);
    if (!hasPaidPlan) {
      return NextResponse.json({ conversations: [], total: 0, limited: true }, { status: 403 });
    }

    const limited = false;
    const caseIds = await getOwnedCaseIds(authUid, authEmail);

    const { data: memoryRowsData, error: memoryError } = await supabaseAdmin
      .from('chat_memory')
      .select('conversation_id, memory_summary, updated_at, case_id')
      .eq('user_id', authUid)
      .not('conversation_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(500);

    if (memoryError) {
      console.error('Failed to load chat memory rows for history', memoryError);
    }

    const memoryRows = (memoryRowsData || []) as Array<{
      conversation_id: string | null;
      memory_summary: string | null;
      updated_at: string | null;
      case_id: string | null;
    }>;

    const memoryConversationIds = dedupe(memoryRows.map((row) => row.conversation_id).filter(Boolean) as string[]);
    const caseMessageRows = await fetchMessagesByCaseIds(caseIds);
    const caseConversationIds = dedupe(caseMessageRows.map((row) => row.conversation_id).filter(Boolean) as string[]);
    const ownedConversationIds = dedupe([...memoryConversationIds, ...caseConversationIds]);
    const ownedConversationMessageRows = await fetchMessagesByConversationIds(ownedConversationIds);

    const conversations = mergeConversations(memoryRows, ownedConversationMessageRows);

    return NextResponse.json({
      conversations,
      total: conversations.length,
      limited,
    });
  } catch (error: unknown) {
    console.error('Chat history GET error:', error);
    return NextResponse.json({ error: 'Failed to load chat history' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ messages: [], total: 0, limited: true }, { status: 401 });
    }

    const authUid = authData.user.id;
    const authEmail = authData.user.email || null;
    const hasPaidPlan = await hasPaidPlanAccess(authUid, authEmail);
    if (!hasPaidPlan) {
      return NextResponse.json({ messages: [], total: 0, limited: true }, { status: 403 });
    }

    const limited = false;
    const { caseId, conversationId, sessionId } = await request.json();
    const resolvedConversationId = conversationId || sessionId;

    if (!caseId && !resolvedConversationId) {
      return NextResponse.json({ messages: [], total: 0, limited });
    }

    const caseIds = await getOwnedCaseIds(authUid, authEmail);

    let query = supabaseAdmin
      .from('messages')
      .select('id, role, content, timestamp, metadata')
      .order('timestamp', { ascending: true });

    if (resolvedConversationId) {
      const allowed = await canAccessConversation(authUid, resolvedConversationId, caseIds);
      if (!allowed) {
        return NextResponse.json({ messages: [], total: 0, limited });
      }
      query = query.eq('conversation_id', resolvedConversationId);
    } else if (caseId) {
      if (!caseIds.includes(caseId)) {
        return NextResponse.json({ messages: [], total: 0, limited });
      }
      query = query.eq('case_id', caseId);
    }

    const { data: messagesData, error: messagesError } = await query;
    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    const messageEntries = (messagesData || []).map((msg: any) => ({
      id: msg.id,
      role: msg.role,
      message: msg.content || '',
      timestamp: msg.timestamp || new Date().toISOString(),
      metadata:
        msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata)
          ? msg.metadata
          : undefined,
    }));

    return NextResponse.json({
      messages: messageEntries,
      total: messageEntries.length,
      limited,
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
    const authEmail = authData.user.email || null;
    const { conversationId } = await request.json();

    if (!conversationId || typeof conversationId !== 'string') {
      return NextResponse.json(
        { error: 'conversationId is required. Deletion by case/profile is not allowed.' },
        { status: 400 }
      );
    }

    const caseIds = await getOwnedCaseIds(authUid, authEmail);
    const allowed = await canAccessConversation(authUid, conversationId, caseIds);
    if (!allowed) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId);

    if (deleteError) {
      console.error('Delete messages error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 });
    }

    await supabaseAdmin.from('chat_action_items').delete().eq('user_id', authUid).eq('conversation_id', conversationId);
    await supabaseAdmin.from('chat_memory').delete().eq('user_id', authUid).eq('conversation_id', conversationId);

    return NextResponse.json({ success: true, deletedConversationId: conversationId });
  } catch (error: unknown) {
    console.error('Delete conversation error:', error);
    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    );
  }
}
