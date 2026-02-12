import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { createRequire } from 'module'
import { invokeFreeLegalAgent, invokeLegalAgent } from '@/lib/ai/agents/legal-agent'
import { ChatManager, MessageLimitError } from '@/lib/ai/chat-manager'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { aiRateLimiter, rateLimit, getIdentifier } from '@/lib/utils/rate-limit'
import { chatMessageSchema } from '@/validators/index'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'

type ChatAttachment = {
  name?: string
  downloadURL?: string
  mimeType?: string | null
  storagePath?: string | null
}

const chatAttachmentSchema = z.object({
  name: z.string().optional(),
  downloadURL: z.string().optional(),
  mimeType: z.string().nullable().optional(),
  storagePath: z.string().nullable().optional(),
});

const chatRequestSchema = z.object({
  message: z.string().min(1).max(5000),
  activeCaseId: z.string().uuid().optional(),
  caseProfile: z.object({ id: z.string().uuid().optional() }).passthrough().optional(),
  mode: z.enum(['legal-advisor', 'document-review', 'general']).optional(),
  history: z
    .array(z.object({ role: z.string(), content: z.string() }))
    .optional(),
  attachmentsOnly: z.boolean().optional(),
  attachments: z.array(chatAttachmentSchema).optional(),
  userId: z.string().optional(),
  conversationId: z.string().optional(),
  sessionMessageCount: z.number().int().nonnegative().optional(),
  sessionStartedAt: z.string().optional(),
}).passthrough();

const nodeRequire = createRequire(import.meta.url)

const getExtension = (name?: string) => {
  if (!name) return ''
  const ext = name.split('.').pop()?.toLowerCase()
  return ext || ''
}

const extractTextFromBuffer = async (buffer: Buffer, name?: string, mimeType?: string | null) => {
  const ext = getExtension(name)
  const typeHint = mimeType?.toLowerCase() || ''

  if (typeHint.includes('pdf') || ext === 'pdf') {
    try {
      const pdfParseModule = nodeRequire('pdf-parse')
      const parse = pdfParseModule?.default ?? pdfParseModule
      const parsed = await parse(buffer)
      return parsed.text || ''
    } catch {
      return ''
    }
  }

  if (typeHint.includes('word') || ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value || ''
  }

  if (typeHint.startsWith('text/') || ['txt', 'md', 'rtf'].includes(ext)) {
    return buffer.toString('utf-8')
  }

  return ''
}

const buildAttachmentContext = async (attachments: ChatAttachment[], baseUrl: string) => {
  if (!attachments.length) return ''
  const sections: string[] = []
  let totalLength = 0

  for (const attachment of attachments) {
    const name = attachment.name || 'Untitled document'
    if (!attachment.downloadURL) {
      sections.push(`Document: ${name}\n(No file content available)`)
      continue
    }

    try {
      const rawUrl = attachment.downloadURL.startsWith('/api/chat-upload/')
        ? `${attachment.downloadURL}/raw`
        : attachment.downloadURL
      const url = rawUrl.startsWith('http') ? rawUrl : `${baseUrl}${rawUrl}`
      const response = await fetch(url)
      if (!response.ok) {
        sections.push(`Document: ${name}\n(Failed to read file content)`)
        continue
      }
      const arrayBuffer = await response.arrayBuffer()
      const text = await extractTextFromBuffer(Buffer.from(arrayBuffer), name, attachment.mimeType)
      const cleaned = text.replace(/\s+/g, ' ').trim()
      const excerpt = cleaned ? cleaned.slice(0, 2500) : '(No extractable text)'
      const section = `Document: ${name}\n${excerpt}`
      sections.push(section)
      totalLength += section.length
      if (totalLength >= 3500) {
        break
      }
    } catch {
      sections.push(`Document: ${name}\n(Failed to read file content)`)
    }
  }

  if (!sections.length) return ''
  return `\n\nAttachment excerpts:\n${sections.join('\n\n')}`
}

const buildAttachmentMetadata = (attachments: ChatAttachment[]) => {
  if (!attachments.length) return ''
  const lines = attachments.map((file, idx) => {
    const name = file.name || 'Untitled document'
    const typeLabel = file.mimeType ? ` (${file.mimeType})` : ''
    return `File ${idx + 1}: ${name}${typeLabel}`
  })
  return `\n\nAttachment list:\n${lines.join('\n')}`
}

const extractCaseKeywords = (caseData: Record<string, any>): string => {
  if (!caseData) return ''
  const keywords: string[] = []

  // Case type and court are most important for search
  if (caseData.caseType) keywords.push(caseData.caseType)
  if (caseData.court) keywords.push(caseData.court)
  if (caseData.claimType) keywords.push(caseData.claimType)
  
  // Role of user
  if (caseData.userRole) keywords.push(caseData.userRole)
  
  // Key facts (first 3)
  if (Array.isArray(caseData.keyFacts)) {
    keywords.push(...caseData.keyFacts.slice(0, 3).map((f: any) => String(f)))
  }
  
  // Legal areas mentioned
  if (Array.isArray(caseData.legalAreas)) {
    keywords.push(...caseData.legalAreas.slice(0, 2).map((a: any) => String(a)))
  }

  return keywords.filter(Boolean).join(' ').slice(0, 200)
}

const buildCaseContext = (caseData: Record<string, any>) => {
  if (!caseData) return ''
  const lines: string[] = []

  const pushList = (label: string, items?: unknown[], limit: number = 5) => {
    if (!Array.isArray(items) || items.length === 0) return
    const trimmed = items.slice(0, limit).map((item) => String(item))
    lines.push(`${label}: ${trimmed.join('; ')}`)
  }

  if (caseData.caseTitle) lines.push(`Case title: ${caseData.caseTitle}`)
  if (caseData.caseNumber) lines.push(`Case number: ${caseData.caseNumber}`)
  if (caseData.caseType) lines.push(`Case type: ${caseData.caseType}`)
  if (caseData.court) lines.push(`Court: ${caseData.court}`)
  if (caseData.location) lines.push(`Location: ${caseData.location}`)

  pushList('Parties', caseData.partiesInvolved)
  pushList('Opponents', caseData.opponents)
  pushList('Incident dates', caseData.incidentDates)
  pushList('Key facts', caseData.keyFacts)
  pushList('Evidence', caseData.evidence)

  if (Array.isArray(caseData.deadlines) && caseData.deadlines.length > 0) {
    const formatted = caseData.deadlines.slice(0, 3).map((item: any) => {
      if (!item) return null
      const desc = item.description || 'Deadline'
      const date = item.date || ''
      return `${desc}${date ? ` (${date})` : ''}`
    }).filter(Boolean)
    if (formatted.length) lines.push(`Deadlines: ${formatted.join('; ')}`)
  }

  if (Array.isArray(caseData.hearings) && caseData.hearings.length > 0) {
    const formatted = caseData.hearings.slice(0, 3).map((item: any) => {
      if (!item) return null
      const desc = item.description || 'Hearing'
      const date = item.date || ''
      return `${desc}${date ? ` (${date})` : ''}`
    }).filter(Boolean)
    if (formatted.length) lines.push(`Hearings: ${formatted.join('; ')}`)
  }

  const summaryState = caseData.caseNotes?.summaryState
  if (summaryState) lines.push(`Case notes: ${summaryState}`)

  if (!lines.length) return ''
  return `\n\nCase context:\n${lines.join('\n')}`
}

const buildSessionSnapshotContext = (caseData: Record<string, any>) => {
  const snapshot = caseData?.sessionSnapshot
  if (!snapshot) return ''
  const lines: string[] = []

  if (snapshot.lastInteractionSummary) {
    lines.push(`Last interaction: ${truncateText(String(snapshot.lastInteractionSummary), 240)}`)
  }
  if (snapshot.aiContextSummary) {
    lines.push(`AI context: ${truncateText(String(snapshot.aiContextSummary), 260)}`)
  }
  if (Array.isArray(snapshot.messageSummaries) && snapshot.messageSummaries.length > 0) {
    const summaries = snapshot.messageSummaries.slice(-3).map((entry: any) => {
      const role = entry?.role === 'assistant' ? 'Assistant' : 'User'
      const summary = entry?.summary ? truncateText(String(entry.summary), 200) : ''
      return summary ? `${role}: ${summary}` : null
    }).filter(Boolean)
    if (summaries.length) lines.push(`Recent summaries: ${summaries.join(' | ')}`)
  }
  if (Array.isArray(snapshot.pendingTasks) && snapshot.pendingTasks.length > 0) {
    const tasks = snapshot.pendingTasks.slice(0, 4).map((task: any) => truncateText(String(task), 140))
    lines.push(`Open tasks: ${tasks.join('; ')}`)
  }

  if (!lines.length) return ''
  return `\n\nSession snapshot:\n${lines.join('\n')}`
}

const truncateText = (value: string, maxChars: number) => {
  if (!value) return ''
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars - 1)}…`
}

export async function POST(request: NextRequest) {
  let authUserId: string | undefined
  try {
    // Get user session for rate limiting
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    authUserId = authData?.user?.id
    let userId = authUserId
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    
    // Apply rate limiting (10 requests per 60 seconds for AI operations)
    const identifier = getIdentifier(userId, ip || undefined)
    const rateLimitResult = await rateLimit(aiRateLimiter, identifier, 10, 60000)
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          error: 'Too many requests',
          message: 'You have exceeded the rate limit. Please try again later.',
          resetAt: new Date(rateLimitResult.reset).toISOString()
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            'X-RateLimit-Reset': String(rateLimitResult.reset),
          }
        }
      )
    }

    const body = await request.json()
    const parsedBody = chatRequestSchema.safeParse(body)
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsedBody.error.issues }, { status: 400 })
    }
    const bodyData = parsedBody.data

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const sanitizedCaseId =
      typeof bodyData?.activeCaseId === 'string' && uuidRegex.test(bodyData.activeCaseId.trim())
        ? bodyData.activeCaseId.trim()
        : undefined

    // Allow clients to pass a `caseProfile` object instead of an activeCaseId.
    // If provided, prefer the profile's `id` when present and valid.
    const caseProfile = bodyData?.caseProfile && typeof bodyData.caseProfile === 'object' ? bodyData.caseProfile : null
    const profileCaseId = caseProfile && typeof caseProfile.id === 'string' && uuidRegex.test(caseProfile.id) ? caseProfile.id : undefined
    
    // Validate input
    const validation = chatMessageSchema.safeParse({
      message: bodyData.message,
      caseId: sanitizedCaseId,
      mode: bodyData.mode,
    })
    
    if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      )
    }

    const {
      message,
      history,
      userId: clientUserId,
      conversationId,
      attachmentsOnly,
      attachments,
      sessionMessageCount,
      sessionStartedAt
    } = bodyData
    // Determine active case id: explicit activeCaseId wins, otherwise caseProfile id if provided
    const activeCaseId = sanitizedCaseId || profileCaseId

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { message: 'Message is required' },
        { status: 400 }
      )
    }

    // Reuse userId from rate limiting check above
    if (!userId && typeof clientUserId === 'string' && clientUserId.trim().length > 0) {
      const trimmedId = clientUserId.trim().slice(0, 64)
      userId = trimmedId.startsWith('anon_') ? trimmedId : `anon_${trimmedId}`
    }
    if (!userId) {
      userId = 'anonymous'
    }

    // Initialize ChatManager for intelligent case management
    const chatManager = new ChatManager(userId, activeCaseId, conversationId);

    const sanitizedHistory = Array.isArray(history)
      ? history
          .filter((entry: any) => entry && typeof entry.role === 'string' && typeof entry.content === 'string')
          .map((entry: any) => ({
            role: entry.role === 'assistant' ? 'assistant' : 'user',
            content: truncateText(entry.content, 600)
          }))
          .slice(-6)
      : [];

    // Step 1: Check if session initialization needed
    const sessionInfo = await chatManager.initializeSession();
    
    // If multiple cases exist without active case, prompt user to select
    if (sessionInfo.requiresCaseSelection) {
      return NextResponse.json({
        requiresCaseSelection: true,
        cases: sessionInfo.cases,
        response: "I see you have multiple cases. Which case would you like to discuss?\n\n" + 
          sessionInfo.cases.map((c: any, i: number) => 
            `${i + 1}. ${c.caseType || 'Case'} - ${c.caseNumber || c.id}`
          ).join('\n')
      });
    }

    // Check if user is continuing discussion about existing case (even in new chat)
    // Note: detectExistingCaseReference was removed in simplified ChatManager
    // Users now select cases via UI
    if (false) {
      // Placeholder for future case detection logic
    }

    // Step 2-6: Process message through ChatManager
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const proto = request.headers.get('x-forwarded-proto') || 'http'
    const baseUrl = host ? `${proto}://${host}` : ''
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0
    const attachmentContext = hasAttachments && baseUrl
      ? await buildAttachmentContext(attachments, baseUrl)
      : ''
    const attachmentMetadata = hasAttachments && !attachmentContext
      ? buildAttachmentMetadata(attachments)
      : ''
    const messageForProcessing = message
    const caseIdForContext = activeCaseId || null

    const processingResult = await chatManager.processMessage(messageForProcessing, hasAttachments, {
      userAgent: request.headers.get('user-agent'),
      sessionMessageCount: typeof sessionMessageCount === 'number' ? sessionMessageCount : null,
      sessionStartedAt: typeof sessionStartedAt === 'string' ? sessionStartedAt : null,
    });
    
    console.log('📊 Chat processing result:', processingResult);

    const resolvedCaseId = processingResult.caseId || sessionInfo.activeCaseId || caseIdForContext
    const needsStoredContext = sanitizedHistory.length < 2
    // If a caseProfile was provided by the client, prefer using it as the source
    const shouldFetchCaseContext = Boolean((resolvedCaseId || caseProfile) && (hasAttachments || needsStoredContext))
    let caseContextData = null
    if (caseProfile) {
      caseContextData = caseProfile
    } else if (resolvedCaseId) {
      caseContextData = await chatManager.getCaseData(resolvedCaseId)
    }
    const caseContext = caseContextData ? buildCaseContext(caseContextData) : ''
    const caseKeywords = caseContextData ? extractCaseKeywords(caseContextData) : ''
    const sessionSnapshotContext = caseContextData && needsStoredContext
      ? buildSessionSnapshotContext(caseContextData)
      : ''
    const rawMessageForAgent = attachmentContext
      ? `${message}\n\nThe user uploaded documents. Use the excerpts below in your analysis.${caseContext}${sessionSnapshotContext}\n${attachmentContext}`
      : `${message}${caseContext}${sessionSnapshotContext}${attachmentMetadata}`
    const messageForAgent = truncateText(rawMessageForAgent, 12000)

    // Generate a thread ID
    const threadId = `thread_${Date.now()}_${userId}`

    const shouldSkipClarification = hasAttachments || attachmentsOnly === true

    // The following block was removed because processingResult does not have shouldBypassAgent or followUpResponse.

    let usePremiumAgents = false
    if (authUserId) {
      const { data: activeSub } = await supabaseAdmin
        .from('subscriptions')
        .select('id, plan_type')
        .eq('user_id', authUserId)
        .eq('status', 'active')
        .maybeSingle()
      const planLabel = (activeSub?.plan_type || '').toString().toLowerCase()
      usePremiumAgents =
        planLabel.includes('standard') ||
        planLabel.includes('essential') ||
        planLabel.includes('plus') ||
        planLabel.includes('premium') ||
        planLabel.includes('pro')
    }

    // Invoke the support agent with conversation history and case context
    const agentResponse = usePremiumAgents
      ? await invokeLegalAgent(
          messageForAgent,
          threadId,
          userId,
          sanitizedHistory,
          caseKeywords,
          {
            useDiscriminator: true,
            useSearch: true,
            includeCitations: true
          }
        )
      : await invokeFreeLegalAgent(
          messageForAgent,
          threadId,
          userId,
          sanitizedHistory,
          caseKeywords
        )

    if (!agentResponse.response || !agentResponse.response.trim()) {
      return NextResponse.json(
        {
          response: 'I had trouble generating a response. Please try again in a moment.',
          metadata: { emptyResponse: true }
        },
        { status: 200 }
      )
    }

    if (chatManager.shouldPersistMessages()) {
      await chatManager.storeRawMessage(
        agentResponse.response,
        'assistant',
        {
          autoGenerated: true,
          type: 'legal_agent_response',
          caseId: processingResult.caseId || null,
          tags: (processingResult as any).tags || null,
          sources: agentResponse.sources || []
        },
        processingResult.caseId || sessionInfo.activeCaseId || null
      );
    }

    return NextResponse.json(
      { 
        response: agentResponse.response,
        metadata: {
          documentGenerated: agentResponse.document_generated,
          guidanceProvided: agentResponse.guidance_provided,
          nextSteps: agentResponse.next_steps,
          sources: agentResponse.sources || [],
          caseProcessing: processingResult,
          activeCaseId: processingResult.caseId || sessionInfo.activeCaseId,
          pendingCalendarEntries: (processingResult as any).pendingCalendarEntries || null
        }
      },
      { status: 200 }
    )
  } catch (error: any) {
    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        api: 'chat',
        userId: authUserId,
      },
      contexts: {
        request: {
          url: request.url,
          method: request.method,
        }
      }
    })

    if (error instanceof MessageLimitError) {
      return NextResponse.json(
        {
          response: error.message,
          metadata: { limitType: 'message', limitReached: true }
        },
        { status: 200 }
      );
    }

    console.error('Chat API error:', error)
    
    // Handle rate limits gracefully
    if (error.message?.includes('rate limit') || error.status === 429) {
      return NextResponse.json(
        { response: '⚠️ I\'m experiencing high demand right now. Please try again in a moment.' },
        { status: 200 } // Return 200 so UI doesn't show error
      )
    }

    return NextResponse.json(
      { 
        message: error.message || 'Chat failed',
        response: 'I apologize, but I encountered an error. Please try again or rephrase your question.'
      },
      { status: 500 }
    )
  }
}
