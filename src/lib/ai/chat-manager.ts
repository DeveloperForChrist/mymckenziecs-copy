import { supabaseAdmin } from '../database/supabase-server';
import { getOrSyncUserEntitlementSnapshot } from '@/lib/payments/entitlements';

// IntentResult interface removed - intent detection no longer used for message storage qualification

export interface CaseTimelineEntry {
  description: string;
  date?: string;
  daysUntil?: number | null;
  note?: string;
}

export interface PendingCalendarEntriesPayload {
  caseId: string;
  caseLabel?: string;
  deadlines?: CaseTimelineEntry[];
  hearings?: CaseTimelineEntry[];
}

type AnalyticsContext = {
  userAgent?: string | null;
  sessionMessageCount?: number | null;
  sessionStartedAt?: string | null;
};

const CASE_LOOKUP_LIMIT = 25;
const ENSURED_USER_ROW_TTL_MS = 60_000;
const ENSURED_USER_ROW_CACHE_MAX = 50_000;
const ensuredUserRowCache = new Map<string, number>();

const setEnsuredUserRowCache = (userId: string, expiresAt: number) => {
  if (ensuredUserRowCache.size >= ENSURED_USER_ROW_CACHE_MAX) {
    for (const [key, expiry] of ensuredUserRowCache) {
      if (expiry <= Date.now()) ensuredUserRowCache.delete(key);
      if (ensuredUserRowCache.size < ENSURED_USER_ROW_CACHE_MAX) break;
    }
  }
  ensuredUserRowCache.set(userId, expiresAt);
};


const classifyTask = (message: string, hasAttachments = false): string => {
  const text = message.trim().toLowerCase()
  if (!text) return 'question'

  if (hasAttachments) return 'document_review'

  if (/\b(review|check|edit|revise|proofread|improve)\b/.test(text)) {
    return 'document_review'
  }
  if (/\b(draft|template|letter|statement|witness statement|pleading|bundle)\b/.test(text)) {
    return 'document_drafting'
  }
  if (/\b(form|n\d{1,3}|cpr\s*form)\b/.test(text)) {
    return 'form_guidance'
  }
  if (
    /\b(case law|citation|precedent|authority|judgment|ruling|neutral citation|uksc|ewca|ewhc|appeal|set aside|overturn|permission to appeal)\b/.test(
      text
    )
  ) {
    return 'case_lookup'
  }
  if (/\b(status|update|progress|stage|where is my case|timeline)\b/.test(text)) {
    return 'case_status'
  }
  if (/\b(deadline|hearing|court date|calendar|due|file by|serve by|time limit|limitation)\b/.test(text)) {
    return 'deadline_query'
  }
  if (
    /\b(procedure|process|steps|how do i|how to|cpr|practice direction|pd\b|enforcement|enforce|bailiff|hceo|high court enforcement|warrant|writ|evidence|exhibit|disclosure|witness|documents|settle|settlement|negotiate|offer|without prejudice|mediation|jurisdiction|venue|which court|right court|transfer)\b/.test(
      text
    )
  ) {
    return 'legal_procedure'
  }
  return 'question'
}

const classifyContextType = (hasAttachments: boolean, hasActiveCase: boolean): string => {
  if (hasAttachments) return 'document_based'
  if (hasActiveCase) return 'case_specific'
  return 'general_information'
}

const classifyUrgency = (message: string): string => {
  const text = message.trim().toLowerCase()
  if (!text) return 'normal'

  const deadlineSignals =
    /\b(deadline|hearing|court date|due date|file by|serve by|before\b|limitation|expires?|time limit)\b/.test(text) ||
    /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/.test(text) ||
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next week)\b/.test(text)
  if (deadlineSignals) return 'deadline'

  const urgentSignals = /\b(urgent|urgently|asap|immediately|emergency|right now|as soon as possible)\b/.test(text)
  if (urgentSignals) return 'urgent'

  return 'normal'
}

const hasMeaningfulCaseProfile = (row: Record<string, any> | null | undefined): boolean => {
  if (!row) return false;
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  const externalId = typeof row.external_id === 'string' ? row.external_id.trim() : '';
  const caseType = typeof row.case_type === 'string' ? row.case_type.trim() : '';
  const description = typeof row.description === 'string' ? row.description.trim() : '';
  const normalizedTitle = title.toLowerCase();
  const hasTitle = Boolean(title) && normalizedTitle !== 'untitled case' && normalizedTitle !== 'case profile';
  return hasTitle || Boolean(externalId) || Boolean(caseType) || Boolean(description);
}

export class ChatManager {
  private userId: string;
  private userEmail?: string | null;
  private activeCaseId?: string;
  private conversationId?: string;
  private userPlan: string | null = null;

  constructor(userId: string, activeCaseId?: string, conversationId?: string, userEmail?: string | null) {
    this.userId = userId;
    this.userEmail = userEmail || null;
    this.activeCaseId = activeCaseId;
    // If no conversationId provided, generate a new UUID for this chat session
    this.conversationId = conversationId || this.generateUUID();
  }

  public seedUserPlan(planLabel?: string | null) {
    const normalized = typeof planLabel === 'string' ? planLabel.trim() : '';
    if (!normalized) return;
    this.userPlan = normalized;
  }

  /**
   * Step 1: Initialize session - load user and check for existing cases
   */
  async initializeSession() {
    if (this.isGuestUser()) {
      this.userPlan = 'Guest';
      return { requiresCaseSelection: false, activeCaseId: null, cases: [], conversationId: this.conversationId };
    }

    const cachedEnsure = ensuredUserRowCache.get(this.userId);
    const userRowRecentlyEnsured = typeof cachedEnsure === 'number' && cachedEnsure > Date.now();
    let supabaseUserId = this.userId;

    if (!userRowRecentlyEnsured) {
      // Resolve or create user in Supabase (idempotent upsert to avoid unique constraint errors).
      const { data: fetchedUserRow } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', this.userId)
        .maybeSingle();

      let userRow = fetchedUserRow;

      if (!userRow) {
        const insertEmail = (this.userEmail || `${this.userId}@placeholder.local`).trim();
        const { data: inserted, error: upsertError } = await supabaseAdmin
          .from('users')
          .upsert(
            { id: this.userId, email: insertEmail || `${this.userId}@placeholder.local` },
            { onConflict: 'id' }
          )
          .select('id')
          .maybeSingle();

        if (upsertError) {
          // If a race condition occurred, try reading again to avoid throwing.
          const { data: retryRow } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('id', this.userId)
            .maybeSingle();
          userRow = retryRow || null;
        } else {
          userRow = inserted;
        }
      }

      if (!userRow) {
        return { requiresCaseSelection: false, activeCaseId: null, cases: [], conversationId: this.conversationId };
      }

      supabaseUserId = userRow.id;
      setEnsuredUserRowCache(this.userId, Date.now() + ENSURED_USER_ROW_TTL_MS);
    }

    // Plan can be pre-seeded by the API route to avoid duplicate subscription reads.
    if (!this.userPlan) {
      const entitlement = await getOrSyncUserEntitlementSnapshot(supabaseUserId);
      this.userPlan = entitlement?.plan_type || 'No plan';
    }

    let resolvedActiveCaseId = this.activeCaseId;

    if (resolvedActiveCaseId) {
      const { data: selectedCase } = await supabaseAdmin
        .from('cases')
        .select('id, title, external_id, case_type, description')
        .eq('id', resolvedActiveCaseId)
        .eq('user_id', supabaseUserId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle();

      if (!selectedCase || !hasMeaningfulCaseProfile(selectedCase as any)) {
        resolvedActiveCaseId = undefined;
      }
    }

    if (!resolvedActiveCaseId) {
      const { data: fallbackCaseCandidates } = await supabaseAdmin
        .from('cases')
        .select('id, title, external_id, case_type, description, last_accessed, created_at')
        .eq('user_id', supabaseUserId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .order('last_accessed', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(CASE_LOOKUP_LIMIT);

      const fallbackCase = (fallbackCaseCandidates || []).find((row: any) => hasMeaningfulCaseProfile(row));
      resolvedActiveCaseId = fallbackCase?.id || undefined;
    }

    this.activeCaseId = resolvedActiveCaseId;

    return {
      requiresCaseSelection: false,
      activeCaseId: this.activeCaseId || null,
      cases: [],
      conversationId: this.conversationId
    };
  }

  private isGuestUser(): boolean {
    return typeof this.userId === 'string' && this.userId.startsWith('anon_');
  }

  public shouldPersistMessages(): boolean {
    return !this.isGuestUser();
  }

  private shouldPersistConversationMessages(): boolean {
    return true;
  }

  private parseUserAgent(ua: string | null | undefined) {
    const userAgent = (ua || '').toLowerCase();
    const isMobile = /mobi|android|iphone|ipad|ipod/.test(userAgent);
    const deviceType = isMobile ? 'mobile' : 'desktop';
    let os = 'unknown';
    if (/windows/.test(userAgent)) os = 'windows';
    else if (/mac os x|macintosh/.test(userAgent) && !/iphone|ipad|ipod/.test(userAgent)) os = 'macos';
    else if (/android/.test(userAgent)) os = 'android';
    else if (/iphone|ipad|ipod/.test(userAgent)) os = 'ios';
    else if (/linux/.test(userAgent)) os = 'linux';

    let browser = 'unknown';
    if (/edg\//.test(userAgent)) browser = 'edge';
    else if (/chrome\//.test(userAgent) && !/edg\//.test(userAgent)) browser = 'chrome';
    else if (/safari\//.test(userAgent) && !/chrome\//.test(userAgent)) browser = 'safari';
    else if (/firefox\//.test(userAgent)) browser = 'firefox';

    return { deviceType, os, browser };
  }

  private async logMessageAnalytics(
    message: string,
    hasAttachments = false,
    context: AnalyticsContext = {}
  ): Promise<void> {
    try {
      const planLabel = (this.userPlan || 'Unknown').toString();
      const isGuest = this.isGuestUser() || planLabel.toLowerCase().includes('guest');
      const userId = this.shouldPersistMessages() ? this.userId : null;
      const { deviceType, os, browser } = this.parseUserAgent(context.userAgent);
      const sessionMessageCount =
        typeof context.sessionMessageCount === 'number' ? context.sessionMessageCount : null;
      let sessionDurationSec: number | null = null;
      if (context.sessionStartedAt) {
        const started = new Date(context.sessionStartedAt);
        if (!Number.isNaN(started.getTime())) {
          sessionDurationSec = Math.max(0, Math.round((Date.now() - started.getTime()) / 1000));
        }
      }
      await supabaseAdmin
        .from('message_analytics')
        .insert({
          user_id: userId,
          plan: planLabel,
          is_guest: isGuest,
          message_length: message.length,
          intent: classifyTask(message, hasAttachments),
          has_attachments: hasAttachments,
          device_type: deviceType,
          os,
          browser,
          session_message_count: sessionMessageCount,
          session_duration_sec: sessionDurationSec,
        });
    } catch (error) {
      console.warn('Failed to log message analytics:', error);
    }
  }

  /**
   * Generate a valid UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Step 2: Store raw conversation message
   * All messages (user and assistant) are stored directly to the database with full content
   * Access controls are enforced at API layer before this class is called.
   * Case ID is optional - if user has set up case profile in chatbot, messages are personalized
   */
  async storeRawMessage(
    message: string,
    role: 'user' | 'assistant',
    metadata: Record<string, any> = {},
    caseIdOverride?: string | null
  ) {
    // conversationId is already set in constructor or provided as UUID
    if (!this.conversationId) {
      throw new Error('conversationId must be initialized before storing messages');
    }

    if (!this.shouldPersistConversationMessages()) {
      return null;
    }

    const resolvedCaseId = caseIdOverride !== undefined ? caseIdOverride : this.activeCaseId || null;

    const basePayload = {
      case_id: resolvedCaseId,
      conversation_id: this.conversationId,
      role,
      content: message,
      timestamp: new Date().toISOString()
    };
    const metadataPayload = metadata && typeof metadata === 'object' ? metadata : {}
    const ownershipMetadata = this.shouldPersistConversationMessages() ? { owner_user_id: this.userId } : {}
    const normalizedMetadata = { ...metadataPayload, ...ownershipMetadata }
    const insertPayload = { ...basePayload, metadata: normalizedMetadata }
    const isMissingMetadataColumnError = (err: any) => {
      const msg = String(err?.message || '').toLowerCase()
      return msg.includes('column') && msg.includes('metadata') && msg.includes('does not exist')
    }

    // Store message in Supabase messages table - case_id is optional, allows generic chatbot usage.
    // If case linkage is stale (FK fail), retry without case_id so thread counts and history remain intact.
    let { data: inserted, error } = await supabaseAdmin
      .from('messages')
      .insert(insertPayload)
      .select('id')
      .single();
    if (error && isMissingMetadataColumnError(error)) {
      const fallbackInsert = await supabaseAdmin
        .from('messages')
        .insert(basePayload)
        .select('id')
        .single()
      inserted = fallbackInsert.data
      error = fallbackInsert.error
    }

    if (error && resolvedCaseId) {
      const retry = await supabaseAdmin
        .from('messages')
        .insert({ ...(isMissingMetadataColumnError(error) ? basePayload : insertPayload), case_id: null })
        .select('id')
        .single();
      inserted = retry.data;
      error = retry.error;
      if (error && isMissingMetadataColumnError(error)) {
        const retryNoMetadata = await supabaseAdmin
          .from('messages')
          .insert({ ...basePayload, case_id: null })
          .select('id')
          .single()
        inserted = retryNoMetadata.data
        error = retryNoMetadata.error
      }
      if (!error) {
        this.activeCaseId = undefined;
      }
    }

    if (error) {
      console.error('Failed to store message:', error);
      return null;
    }

    return inserted?.id || null;
  }

  /**
   * Link all messages in current conversation to a case
   * Called when user creates case profile mid-conversation - retroactively tags all messages
   */
  async linkConversationToCase(caseId: string): Promise<void> {
    if (!this.conversationId) {
      console.warn('No conversation ID available for linking');
      return;
    }

    const { error } = await supabaseAdmin
      .from('messages')
      .update({ case_id: caseId })
      .eq('conversation_id', this.conversationId)
      .is('case_id', null);

    if (error) {
      console.error('Failed to link conversation to case:', error);
    } else {
      console.log(`Linked conversation ${this.conversationId} to case ${caseId}`);
    }

    // Update the active case ID for future messages
    this.activeCaseId = caseId;
  }

  /**
   * Unlink all messages from a deleted case
   * Called when user deletes case profile - removes case_id tags from all messages
   */
  async unlinkCaseFromMessages(caseId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('messages')
      .update({ case_id: null })
      .eq('case_id', caseId);

    if (error) {
      console.error('Failed to unlink messages from case:', error);
    } else {
      console.log(`Unlinked all messages from case ${caseId}`);
    }

    // Clear active case if it was the deleted one
    if (this.activeCaseId === caseId) {
      this.activeCaseId = undefined;
    }
  }

  /**
   * Simplified message processing - just stores message and returns basic metadata
   */
  async processMessage(message: string, hasAttachments = false, analyticsContext?: AnalyticsContext) {
    const routedCaseId = this.activeCaseId || null;
    const task = classifyTask(message, hasAttachments)
    const contextType = classifyContextType(hasAttachments, Boolean(routedCaseId))
    const urgency = classifyUrgency(message)

    await this.logMessageAnalytics(message, hasAttachments, analyticsContext);
    await this.storeRawMessage(message, 'user', {}, routedCaseId);

    return {
      task,
      contextType,
      urgency,
      caseId: routedCaseId
    };
  }

  /**
   * Get user's case data for document generation
   */
  async getCaseData(caseId?: string) {
    const targetCaseId = caseId || this.activeCaseId;
    if (!targetCaseId) return null;

    const { data: caseData } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('id', targetCaseId)
      .eq('user_id', this.userId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle();

    return caseData || null;
  }
}
