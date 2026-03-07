import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { getOrSyncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
import { isPaidPlan } from '@/lib/plans/access';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

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
  metadata?: any;
};

const MAX_THREADS = 60;
const DEFAULT_MESSAGE_LIMIT = 400;
const MAX_MESSAGE_LIMIT = 1200;

function normalizeTimestamp(value: any): string {
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
    typeof (value as { toDate?: any }).toDate === 'function'
  ) {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }

  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function buildConversationTitle(value: any): string {
  const raw = typeof value === 'string' ? value : '';
  if (!raw.trim()) return 'Conversation';

  const labelStripped = raw
    .replace(/\b(?:user asked|user|assistant|ai|system)\s*:\s*/gi, ' ')
    .replace(/\|\s*(?:assistant|ai|system)\s*:.*/gi, ' ')
    .trim();

  const cleaned = labelStripped
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

function isPlaceholderTitle(value: string | null | undefined): boolean {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return true;
  return normalized === 'conversation' || normalized === 'user' || normalized === 'assistant' || normalized === 'user asked';
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

async function resolveScopedUserIds(authUid: string, authEmail: string | null): Promise<string[]> {
  const emailUserIds = await resolveUserIdsByEmail(authEmail);
  return dedupe([authUid, ...emailUserIds]);
}

async function hasPaidPlanAccess(authUid: string, authEmail: string | null): Promise<boolean> {
  const hasPaidForUserIds = async (userIds: string[]) => {
    if (userIds.length === 0) return false;

    const { data: entitlements } = await supabaseAdmin
      .from('user_entitlements')
      .select('plan_type, paid_access, updated_at')
      .in('user_id', userIds)
      .order('updated_at', { ascending: false })
      .limit(5);

    return (entitlements || []).some((row: any) => Boolean(row?.paid_access) || isPaidPlan(row?.plan_type || ''));
  };

  const primarySnapshot = await getOrSyncUserEntitlementSnapshot(authUid);
  if (primarySnapshot?.paid_access || isPaidPlan(primarySnapshot?.plan_type || '')) return true;

  const emailUserIds = await resolveUserIdsByEmail(authEmail);
  if (emailUserIds.length === 0) return false;
  return hasPaidForUserIds(emailUserIds);
}

async function getOwnedCaseIds(userIds: string[]): Promise<string[]> {
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

function parseMessageLimit(value: any): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MESSAGE_LIMIT;
  return Math.min(parsed, MAX_MESSAGE_LIMIT);
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
  scopedUserIds: string[],
  conversationId: string,
  caseIds: string[]
): Promise<boolean> {
  if (scopedUserIds.length === 0) return false;

  const { data: memoryRow } = await supabaseAdmin
    .from('chat_memory')
    .select('conversation_id')
    .in('user_id', scopedUserIds)
    .eq('conversation_id', conversationId)
    .limit(1)
    .maybeSingle();

  if (memoryRow?.conversation_id) return true;

  const { data: actionRow } = await supabaseAdmin
    .from('chat_action_items')
    .select('id')
    .in('user_id', scopedUserIds)
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

  // Fallback for conversations persisted without case links but tagged by owner in metadata.
  const { data: conversationRows, error: conversationRowsError } = await supabaseAdmin
    .from('messages')
    .select('metadata')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: false })
    .limit(60);

  if (!conversationRowsError && Array.isArray(conversationRows)) {
    const ownsConversation = conversationRows.some((row: any) => {
      const ownerId =
        row?.metadata && typeof row.metadata === 'object' && typeof row.metadata.owner_user_id === 'string'
          ? row.metadata.owner_user_id
          : null;
      return Boolean(ownerId && scopedUserIds.includes(ownerId));
    });
    if (ownsConversation) return true;
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

    if (isPlaceholderTitle(existing.title) && msg.role === 'user') {
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
    const scopedUserIds = await resolveScopedUserIds(authUid, authEmail);
    const caseIds = await getOwnedCaseIds(scopedUserIds);

    const { data: memoryRowsData, error: memoryError } = await supabaseAdmin
      .from('chat_memory')
      .select('conversation_id, memory_summary, updated_at, case_id')
      .in('user_id', scopedUserIds)
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
  } catch (error: any) {
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
    const scopedUserIds = await resolveScopedUserIds(authUid, authEmail);
    const { caseId, conversationId, sessionId, limit } = await request.json();
    const resolvedConversationId = conversationId || sessionId;
    const messageLimit = parseMessageLimit(limit);

    if (!caseId && !resolvedConversationId) {
      return NextResponse.json({ messages: [], total: 0, limited });
    }

    const caseIds = await getOwnedCaseIds(scopedUserIds);

    let query = supabaseAdmin
      .from('messages')
      .select('id, role, content, timestamp, metadata')
      .order('timestamp', { ascending: false })
      .limit(messageLimit);

    if (resolvedConversationId) {
      const allowed = await canAccessConversation(scopedUserIds, resolvedConversationId, caseIds);
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

    const descendingEntries = (messagesData || []).map((msg: any) => ({
      id: msg.id,
      role: msg.role,
      message: msg.content || '',
      timestamp: msg.timestamp || new Date().toISOString(),
      metadata:
        msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata)
          ? msg.metadata
          : undefined,
    }));
    const messageEntries = descendingEntries.reverse();

    return NextResponse.json({
      messages: messageEntries,
      total: messageEntries.length,
      limited,
      pageLimit: messageLimit,
      hasMoreOlder: (messagesData || []).length >= messageLimit,
    });
  } catch (error: any) {
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

    const scopedUserIds = await resolveScopedUserIds(authUid, authEmail);
    const caseIds = await getOwnedCaseIds(scopedUserIds);
    const allowed = await canAccessConversation(scopedUserIds, conversationId, caseIds);
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

    await supabaseAdmin.from('chat_action_items').delete().in('user_id', scopedUserIds).eq('conversation_id', conversationId);
    await supabaseAdmin.from('chat_memory').delete().in('user_id', scopedUserIds).eq('conversation_id', conversationId);

    return NextResponse.json({ success: true, deletedConversationId: conversationId });
  } catch (error: any) {
    console.error('Delete conversation error:', error);
    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    );
  }
}
