import { supabaseAdmin } from '../database/supabase-server';

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

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const buildCalendarDescription = (text: string, dateText: string) => {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length && normalized.length <= 80) return normalized
  return `Date mentioned: ${dateText}`
}

const extractDateMentions = (text: string) => {
  const absoluteDates = new Set<string>()
  const relativeDates = new Set<string>()
  const monthPattern = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

  const absolutePatterns: RegExp[] = [
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
    /\b\d{4}-\d{1,2}-\d{1,2}\b/g,
    new RegExp(`\\b\\d{1,2}\\s+${monthPattern}\\s+\\d{2,4}\\b`, 'gi'),
    new RegExp(`\\b${monthPattern}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s*\\d{2,4})?\\b`, 'gi')
  ]

  const relativePatterns: RegExp[] = [
    /\bday after tomorrow\b/gi,
    /\btomorrow\b/gi,
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    /\bin\s+\d{1,3}\s+(day|days|week|weeks|month|months)\b/gi,
    /\b\d{1,3}\s+(day|days|week|weeks|month|months)\s+(away|from\s+now|remaining|left|to\s+go)\b/gi
  ]

  for (const pattern of absolutePatterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[0]) absoluteDates.add(match[0].trim())
    }
  }

  for (const pattern of relativePatterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[0]) relativeDates.add(match[0].trim())
    }
  }

  return {
    absolute: Array.from(absoluteDates),
    relative: Array.from(relativeDates)
  }
}


const classifyIntent = (message: string, hasAttachments = false): string => {
  const text = message.trim().toLowerCase()
  if (!text) return 'question'

  if (hasAttachments) return 'document_review'

  if (/\b(review|check|edit|revise|proofread|improve)\b/.test(text)) {
    return 'document_review'
  }
  if (/\b(draft|template|letter|statement|witness statement|pleading|bundle)\b/.test(text)) {
    return 'document'
  }
  if (/\b(form|n\d{1,3}|cpr\s*form)\b/.test(text)) {
    return 'forms'
  }
  if (/\b(procedure|process|steps|how do i|how to|cpr|practice direction|pd\b)\b/.test(text)) {
    return 'procedure'
  }
  if (/\b(case law|citation|precedent|authority|judgment|appeal|ruling)\b/.test(text)) {
    return 'case_law'
  }
  if (/\b(appeal|set aside|overturn|permission to appeal)\b/.test(text)) {
    return 'appeal'
  }
  if (/\b(enforcement|enforce|bailiff|hceo|high court enforcement|warrant|writ)\b/.test(text)) {
    return 'enforcement'
  }
  if (/\b(evidence|exhibit|disclosure|bundle|witness|statement|documents)\b/.test(text)) {
    return 'evidence'
  }
  if (/\b(settle|settlement|negotiate|offer|without prejudice|mediation)\b/.test(text)) {
    return 'negotiation'
  }
  if (/\b(jurisdiction|venue|which court|right court|transfer)\b/.test(text)) {
    return 'jurisdiction'
  }
  if (/\b(status|update|progress|stage|where is my case|timeline)\b/.test(text)) {
    return 'case_status'
  }
  if (/\b(deadline|hearing|court date|calendar|due|file by|serve by)\b/.test(text)) {
    return 'calendar'
  }
  if (/\b(costs|fees|pricing|price|billing|subscription|plan)\b/.test(text)) {
    return 'billing'
  }

  return 'question'
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
  private activeCaseId?: string;
  private conversationId?: string;
  private userPlan: string | null = null;

  constructor(userId: string, activeCaseId?: string, conversationId?: string) {
    this.userId = userId;
    this.activeCaseId = activeCaseId;
    // If no conversationId provided, generate a new UUID for this chat session
    this.conversationId = conversationId || this.generateUUID();
  }

  /**
   * Step 1: Initialize session - load user and check for existing cases
   */
  async initializeSession() {
    if (this.isGuestUser()) {
      this.userPlan = 'Guest';
      return { requiresCaseSelection: false, activeCaseId: null, cases: [], conversationId: this.conversationId };
    }

    // Resolve or create user in Supabase (idempotent upsert to avoid unique constraint errors)
    const { data: fetchedUserRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', this.userId)
      .maybeSingle();

    let userRow = fetchedUserRow;

    if (!userRow) {
      const { data: inserted, error: upsertError } = await supabaseAdmin
        .from('users')
        .upsert(
          { id: this.userId, email: `${this.userId}@placeholder.local` },
          { onConflict: 'id' }
        )
        .select('id')
        .maybeSingle();

      if (upsertError) {
        // If a race condition occurred, try reading again to avoid throwing
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

    const supabaseUserId = userRow.id;

    // Check subscription for plan
    const { data: activeSub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_type')
      .eq('user_id', supabaseUserId)
      .in('status', ['active', 'past_due'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    this.userPlan = activeSub?.plan_type || 'Free';

    // Get all cases
    const { data: casesData } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('user_id', supabaseUserId)
      .is('deleted_at', null)
      .order('last_accessed', { ascending: false });

    const cases = (casesData || []).filter((c: any) => hasMeaningfulCaseProfile(c)).map((c: any) => {
      return { id: c.id, ...c };
    });

    // If multiple cases exist and no active case set, return cases for selection
    if (cases.length > 1 && !this.activeCaseId) {
      return {
        requiresCaseSelection: true,
        cases: cases
      };
    }

    // Set active case to most recent if exists
    if (cases.length > 0 && !this.activeCaseId) {
      this.activeCaseId = cases[0].id;
    }

    return {
      requiresCaseSelection: false,
      activeCaseId: this.activeCaseId,
      cases: cases,
      conversationId: this.conversationId
    };
  }

  private isGuestUser(): boolean {
    return typeof this.userId === 'string' && this.userId.startsWith('anon_');
  }

  public shouldPersistMessages(): boolean {
    return !this.isGuestUser();
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
          intent: classifyIntent(message, hasAttachments),
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
   * Guest limits are enforced at API layer before this class is called.
   * Case ID is optional - if user has set up case profile in settings, messages are personalized
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

    if (!this.shouldPersistMessages()) {
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
    const insertPayload = { ...basePayload, metadata: metadataPayload }
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

    await this.logMessageAnalytics(message, hasAttachments, analyticsContext);
    await this.storeRawMessage(message, 'user', {}, routedCaseId);

    return {
      intent: classifyIntent(message, hasAttachments),
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
      .maybeSingle();

    return caseData || null;
  }
}
