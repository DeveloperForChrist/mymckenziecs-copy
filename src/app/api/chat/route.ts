import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { createRequire } from 'module'
import { invokeFreeLegalAgent, invokeLegalAgent } from '@/lib/ai/agents/legal-agent'
import { ChatManager, MessageLimitError } from '@/lib/ai/chat-manager'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { aiRateLimiter, aiGuestRateLimiter, aiIpRateLimiter, rateLimit, getIdentifier } from '@/lib/utils/rate-limit'
import { chatMessageSchema } from '@/validators/index'
import { z } from 'zod'
import { captureServerException } from '@/lib/monitoring/error-logger'

type ChatAttachment = {
  name?: string
  downloadURL?: string
  mimeType?: string | null
  storagePath?: string | null
}

type ExtractedAction = {
  title: string
  dueDate: string | null
  confidence: 'high' | 'medium'
}

const chatAttachmentSchema = z.object({
  name: z.string().optional(),
  downloadURL: z.string().optional(),
  mimeType: z.string().nullable().optional(),
  storagePath: z.string().nullable().optional(),
})

const chatRequestSchema = z.object({
  message: z.string().min(1).max(5000),
  activeCaseId: z.string().uuid().optional(),
  caseProfile: z.object({ id: z.string().uuid().optional() }).passthrough().optional(),
  mode: z.enum(['legal-advisor', 'document-review', 'general']).optional(),
  history: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
  attachmentsOnly: z.boolean().optional(),
  attachments: z.array(chatAttachmentSchema).optional(),
  userId: z.string().optional(),
  conversationId: z.string().optional(),
  sessionMessageCount: z.number().int().nonnegative().optional(),
  sessionStartedAt: z.string().optional(),
}).passthrough()

const nodeRequire = createRequire(import.meta.url)
const GUEST_COOKIE_NAME = 'mm_guest_id'
const GUEST_MESSAGE_LIMIT_24H = 5
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const parseForwardedFor = (value: string | null) => {
  if (!value) return null
  const first = value.split(',')[0]?.trim()
  return first || null
}

const normalizeHost = (value: string | null) => {
  const trimmed = (value || '').trim()
  if (!trimmed) return null
  return trimmed.split(':')[0]?.toLowerCase() || null
}

const isAllowedOrigin = (request: NextRequest) => {
  const origin = request.headers.get('origin')
  if (!origin) return true

  let originHost: string | null = null
  try {
    originHost = new URL(origin).hostname.toLowerCase()
  } catch {
    return false
  }

  const reqHost = normalizeHost(request.headers.get('x-forwarded-host') || request.headers.get('host'))
  if (reqHost && originHost === reqHost) return true

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    try {
      const appHost = new URL(appUrl).hostname.toLowerCase()
      if (originHost === appHost) return true
    } catch {
      // ignore invalid env var
    }
  }

  return false
}

const setGuestCookie = (response: NextResponse, guestId: string) => {
  response.cookies.set({
    name: GUEST_COOKIE_NAME,
    value: guestId,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 60,
  })
  return response
}

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
      if (totalLength >= 3500) break
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

const truncateText = (value: string, maxChars: number) => {
  if (!value) return ''
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars - 1)}…`
}

const extractCaseKeywords = (caseData: Record<string, any>): string => {
  if (!caseData) return ''
  const keywords: string[] = []

  if (caseData.caseType) keywords.push(caseData.caseType)
  if (caseData.court) keywords.push(caseData.court)
  if (caseData.claimType) keywords.push(caseData.claimType)
  if (caseData.userRole) keywords.push(caseData.userRole)
  if (Array.isArray(caseData.keyFacts)) {
    keywords.push(...caseData.keyFacts.slice(0, 3).map((f: any) => String(f)))
  }
  if (Array.isArray(caseData.legalAreas)) {
    keywords.push(...caseData.legalAreas.slice(0, 2).map((a: any) => String(a)))
  }

  return keywords.filter(Boolean).join(' ').slice(0, 220)
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

  pushList('Parties', caseData.partiesInvolved)
  pushList('Key facts', caseData.keyFacts)
  pushList('Evidence', caseData.evidence)

  if (!lines.length) return ''
  return `\n\nCase context:\n${lines.join('\n')}`
}

const buildMemoryKey = (
  authUserId: string | undefined,
  guestId: string | null,
  caseId: string | null,
  conversationId: string | null
) => {
  const userPart = authUserId ? `u:${authUserId}` : guestId ? `g:${guestId}` : 'anon'
  const casePart = caseId ? `c:${caseId}` : 'c:none'
  const convPart = conversationId ? `v:${conversationId}` : 'v:none'
  return `${userPart}|${casePart}|${convPart}`
}

const extractKeyFactsFromMessage = (message: string) => {
  const cleaned = message.replace(/\s+/g, ' ').trim()
  if (!cleaned) return [] as string[]

  const facts: string[] = []
  const sentenceParts = cleaned.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean)
  for (const sentence of sentenceParts) {
    const lower = sentence.toLowerCase()
    if (
      /\b(my|i have|i am|i was|i need|the issue|the problem|deadline|hearing|court|landlord|tenant|employer|claim)\b/.test(lower) &&
      sentence.length >= 16
    ) {
      facts.push(truncateText(sentence, 180))
    }
    if (facts.length >= 8) break
  }
  return facts
}

const mergeFacts = (existing: unknown, incoming: string[]) => {
  const current = Array.isArray(existing) ? existing.map((x) => String(x)).filter(Boolean) : []
  const merged = [...current]
  for (const fact of incoming) {
    if (!merged.includes(fact)) merged.push(fact)
    if (merged.length >= 12) break
  }
  return merged
}

const parseDateGuess = (text: string): string | null => {
  const cleaned = text.trim()
  if (!cleaned) return null
  const parsed = new Date(cleaned)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  return null
}

const extractActionItems = (text: string): ExtractedAction[] => {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean)

  const actionVerb = /\b(file|submit|serve|prepare|draft|contact|call|email|attend|pay|gather|upload|review|send|complete)\b/i
  const duePattern = /\b(?:by|on|before)\s+([\w\-/, ]{3,30})/i
  const actions: ExtractedAction[] = []

  for (const line of lines) {
    if (!actionVerb.test(line)) continue

    const dueMatch = line.match(duePattern)
    let dueDate: string | null = null
    if (dueMatch?.[1]) {
      dueDate = parseDateGuess(dueMatch[1])
    }

    actions.push({
      title: truncateText(line, 220),
      dueDate,
      confidence: dueDate ? 'high' : 'medium',
    })

    if (actions.length >= 5) break
  }

  return actions
}

const inferFollowUpQuestion = (intent: string, message: string) => {
  const text = message.toLowerCase()
  const hasDate = /\b\d{1,2}[/\-]\d{1,2}([/\-]\d{2,4})?\b|\b(today|tomorrow|next week|next month|monday|tuesday|wednesday|thursday|friday)\b/i.test(message)

  if (intent === 'calendar' && !hasDate) {
    return 'Could you share the exact deadline or hearing date so I can give guidance in the right order and timing?'
  }
  if (intent === 'evidence' && !/\b(document|email|letter|photo|screenshot|witness|statement)\b/.test(text)) {
    return 'What evidence do you currently have (for example emails, letters, screenshots, or witnesses)?'
  }
  if (intent === 'procedure' && !/\b(claim form|defence|hearing|judgment|order|appeal|n244|cpr)\b/.test(text)) {
    return 'Which stage are you at right now (for example pre-claim, claim filed, defence filed, or hearing listed)?'
  }
  return null
}

const buildMemoryContext = (memory: any) => {
  if (!memory) return ''
  const lines: string[] = []

  if (memory.memory_summary) {
    lines.push(`Memory summary: ${truncateText(String(memory.memory_summary), 260)}`)
  }
  if (Array.isArray(memory.key_facts) && memory.key_facts.length > 0) {
    const facts = memory.key_facts.slice(0, 6).map((f: any) => `- ${truncateText(String(f), 150)}`)
    lines.push(`Known facts:\n${facts.join('\n')}`)
  }
  if (Array.isArray(memory.open_questions) && memory.open_questions.length > 0) {
    const qs = memory.open_questions.slice(0, 2).map((q: any) => truncateText(String(q), 160))
    lines.push(`Open questions: ${qs.join(' | ')}`)
  }

  if (!lines.length) return ''
  return `\n\nConversation memory:\n${lines.join('\n')}`
}

export async function POST(request: NextRequest) {
  let authUserId: string | undefined
  let guestId: string | null = null
  let shouldSetGuestCookie = false

  try {
    const secFetchSite = request.headers.get('sec-fetch-site')
    if (secFetchSite && secFetchSite === 'cross-site') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const contentType = request.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json({ error: 'Unsupported Media Type' }, { status: 415 })
    }

    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    authUserId = authData?.user?.id

    let userId = authUserId
    const ip =
      parseForwardedFor(request.headers.get('x-forwarded-for')) ||
      parseForwardedFor(request.headers.get('x-real-ip')) ||
      null

    if (!userId) {
      const existing = request.cookies.get(GUEST_COOKIE_NAME)?.value || null
      if (existing && uuidRegex.test(existing)) {
        guestId = existing
      } else {
        guestId = crypto.randomUUID()
        shouldSetGuestCookie = true
      }
      userId = `anon_${guestId}`
    }

    const withCookie = (res: NextResponse) => {
      if (shouldSetGuestCookie && guestId) setGuestCookie(res, guestId)
      return res
    }

    const limiter = authUserId ? aiRateLimiter : aiGuestRateLimiter
    const identifier = authUserId ? getIdentifier(userId, ip || undefined) : `guest:${guestId}`
    const rateLimitResult = await rateLimit(limiter, identifier, authUserId ? 10 : 6, 60000)
    if (!rateLimitResult.success) {
      return withCookie(
        NextResponse.json(
          {
            error: 'Too many requests',
            message: 'You have exceeded the rate limit. Please try again later.',
            resetAt: new Date(rateLimitResult.reset).toISOString(),
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': String(rateLimitResult.limit),
              'X-RateLimit-Remaining': String(rateLimitResult.remaining),
              'X-RateLimit-Reset': String(rateLimitResult.reset),
            },
          }
        )
      )
    }

    if (!authUserId && ip) {
      const ipResult = await rateLimit(aiIpRateLimiter, `ip:${ip}`, 60, 10 * 60 * 1000)
      if (!ipResult.success) {
        return withCookie(
          NextResponse.json(
            {
              error: 'Too many requests',
              message: 'You have exceeded the rate limit. Please try again later.',
              resetAt: new Date(ipResult.reset).toISOString(),
            },
            {
              status: 429,
              headers: {
                'X-RateLimit-Limit': String(ipResult.limit),
                'X-RateLimit-Remaining': String(ipResult.remaining),
                'X-RateLimit-Reset': String(ipResult.reset),
              },
            }
          )
        )
      }
    }

    const body = await request.json()
    const parsedBody = chatRequestSchema.safeParse(body)
    if (!parsedBody.success) {
      return withCookie(NextResponse.json({ error: 'Invalid input', details: parsedBody.error.issues }, { status: 400 }))
    }

    const bodyData = parsedBody.data

    const sanitizedCaseId =
      typeof bodyData?.activeCaseId === 'string' && uuidRegex.test(bodyData.activeCaseId.trim())
        ? bodyData.activeCaseId.trim()
        : undefined

    const caseProfile = bodyData?.caseProfile && typeof bodyData.caseProfile === 'object' ? bodyData.caseProfile : null
    const profileCaseId =
      caseProfile && typeof caseProfile.id === 'string' && uuidRegex.test(caseProfile.id)
        ? caseProfile.id
        : undefined

    const validation = chatMessageSchema.safeParse({
      message: bodyData.message,
      caseId: sanitizedCaseId,
      mode: bodyData.mode,
    })
    if (!validation.success) {
      return withCookie(NextResponse.json({ error: 'Invalid input', details: validation.error.issues }, { status: 400 }))
    }

    const { message, history, conversationId, attachmentsOnly, attachments, sessionMessageCount, sessionStartedAt } = bodyData
    const activeCaseId = sanitizedCaseId || profileCaseId

    if (!message || typeof message !== 'string') {
      return withCookie(NextResponse.json({ message: 'Message is required' }, { status: 400 }))
    }

    if (!authUserId && guestId) {
      const windowMs = 24 * 60 * 60 * 1000
      try {
        const { data: rows, error: rpcError } = await supabaseAdmin.rpc('consume_guest_message', {
          p_guest_id: guestId,
          p_limit: GUEST_MESSAGE_LIMIT_24H,
          p_window_ms: windowMs,
        })
        if (rpcError) throw rpcError

        const row: any = Array.isArray(rows) ? rows[0] : rows
        if (!Boolean(row?.allowed)) {
          return withCookie(
            NextResponse.json(
              {
                response: `Hi, you have reached your ${GUEST_MESSAGE_LIMIT_24H}-message guest limit. Please sign up to continue.`,
                guestLimitReached: true,
                guestLimit: GUEST_MESSAGE_LIMIT_24H,
                canMessageAgainAt: typeof row?.can_message_again_at === 'string' ? row.can_message_again_at : null,
              },
              { status: 200 }
            )
          )
        }
      } catch (error) {
        await captureServerException(error, {
          component: 'chat',
          route: '/api/chat',
          method: 'POST',
          guestUsageRpc: true,
        })
        return withCookie(
          NextResponse.json(
            {
              response: 'I am unavailable right now. Please try again later.',
              metadata: { guestUsageError: true },
            },
            { status: 200 }
          )
        )
      }
    }

    const chatManager = new ChatManager(userId, activeCaseId, conversationId)

    const sanitizedHistory = Array.isArray(history)
      ? history
          .filter((entry: any) => entry && typeof entry.role === 'string' && typeof entry.content === 'string')
          .map((entry: any) => ({
            role: entry.role === 'assistant' ? 'assistant' : 'user',
            content: truncateText(entry.content, 600),
          }))
          .slice(-6)
      : []

    const sessionInfo = await chatManager.initializeSession()
    if (sessionInfo.requiresCaseSelection) {
      return withCookie(
        NextResponse.json({
          requiresCaseSelection: true,
          cases: sessionInfo.cases,
          response:
            'I see you have multiple cases. Which case would you like to discuss?\n\n' +
            sessionInfo.cases
              .map((c: any, i: number) => `${i + 1}. ${c.caseType || 'Case'} - ${c.caseNumber || c.id}`)
              .join('\n'),
        })
      )
    }

    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const proto = request.headers.get('x-forwarded-proto') || 'http'
    const baseUrl = host ? `${proto}://${host}` : ''

    const hasAttachments = Array.isArray(attachments) && attachments.length > 0
    const attachmentContext = hasAttachments && baseUrl ? await buildAttachmentContext(attachments, baseUrl) : ''
    const attachmentMetadata = hasAttachments && !attachmentContext ? buildAttachmentMetadata(attachments) : ''

    const processingResult = await chatManager.processMessage(message, hasAttachments, {
      userAgent: request.headers.get('user-agent'),
      sessionMessageCount: typeof sessionMessageCount === 'number' ? sessionMessageCount : null,
      sessionStartedAt: typeof sessionStartedAt === 'string' ? sessionStartedAt : null,
    })

    const resolvedCaseId = processingResult.caseId || sessionInfo.activeCaseId || activeCaseId || null
    const needsStoredContext = sanitizedHistory.length < 2

    let caseContextData = null
    if (caseProfile) {
      caseContextData = caseProfile
    } else if (resolvedCaseId) {
      caseContextData = await chatManager.getCaseData(resolvedCaseId)
    }

    const memoryKey = buildMemoryKey(authUserId, guestId, resolvedCaseId || null, sessionInfo.conversationId || conversationId || null)
    const { data: memoryRow } = await supabaseAdmin
      .from('chat_memory')
      .select('memory_summary,key_facts,open_questions')
      .eq('memory_key', memoryKey)
      .maybeSingle()

    const followUpQuestion = inferFollowUpQuestion(processingResult.intent, message)
    const shouldShortCircuitToQuestion = Boolean(followUpQuestion && !hasAttachments && sanitizedHistory.length <= 1)

    if (shouldShortCircuitToQuestion) {
      const facts = extractKeyFactsFromMessage(message)
      const mergedFacts = mergeFacts(memoryRow?.key_facts, facts)
      await supabaseAdmin.from('chat_memory').upsert(
        {
          memory_key: memoryKey,
          user_id: authUserId || null,
          guest_id: guestId || null,
          case_id: resolvedCaseId || null,
          conversation_id: sessionInfo.conversationId || conversationId || null,
          memory_summary: truncateText(`User asked: ${message}`, 320),
          key_facts: mergedFacts,
          open_questions: [followUpQuestion],
          last_intent: processingResult.intent,
        },
        { onConflict: 'memory_key' }
      )

      return withCookie(
        NextResponse.json(
          {
            response: followUpQuestion,
            metadata: {
              followUpQuestion,
              requiresClarification: true,
              caseProcessing: processingResult,
              activeCaseId: resolvedCaseId,
            },
          },
          { status: 200 }
        )
      )
    }

    const caseContext = caseContextData ? buildCaseContext(caseContextData) : ''
    const caseKeywords = caseContextData ? extractCaseKeywords(caseContextData) : ''
    const memoryContext = buildMemoryContext(memoryRow)

    const rawMessageForAgent = attachmentContext
      ? `${message}\n\nThe user uploaded documents. Use the excerpts below in your analysis.${caseContext}${memoryContext}\n${attachmentContext}`
      : `${message}${caseContext}${memoryContext}${attachmentMetadata}`

    const messageForAgent = truncateText(rawMessageForAgent, 12000)
    const threadId = `thread_${Date.now()}_${userId}`

    let usePremiumAgents = false
    if (authUserId) {
      const { data: activeSub } = await supabaseAdmin
        .from('subscriptions')
        .select('id, plan_type')
        .eq('user_id', authUserId)
        .in('status', ['active', 'past_due', 'trialing'])
        .maybeSingle()
      const planLabel = (activeSub?.plan_type || '').toString().toLowerCase()
      usePremiumAgents =
        planLabel.includes('standard') ||
        planLabel.includes('essential') ||
        planLabel.includes('plus') ||
        planLabel.includes('premium') ||
        planLabel.includes('pro')
    }

    const agentResponse = usePremiumAgents
      ? await invokeLegalAgent(messageForAgent, threadId, userId, sanitizedHistory, caseKeywords, {
          useDiscriminator: true,
          useSearch: true,
          includeCitations: true,
        })
      : await invokeFreeLegalAgent(messageForAgent, threadId, userId, sanitizedHistory, caseKeywords)

    if (!agentResponse.response || !agentResponse.response.trim()) {
      return withCookie(
        NextResponse.json(
          {
            response: 'I had trouble generating a response. Please try again in a moment.',
            metadata: { emptyResponse: true },
          },
          { status: 200 }
        )
      )
    }

    const actionItems = extractActionItems(`${message}\n${agentResponse.response}`)
    if (actionItems.length > 0) {
      const rows = actionItems.map((item) => ({
        memory_key: memoryKey,
        user_id: authUserId || null,
        guest_id: guestId || null,
        case_id: resolvedCaseId || null,
        conversation_id: sessionInfo.conversationId || conversationId || null,
        title: item.title,
        due_date: item.dueDate,
        status: 'pending',
        source_text: truncateText(message, 400),
      }))
      await supabaseAdmin.from('chat_action_items').insert(rows)
    }

    const incomingFacts = extractKeyFactsFromMessage(message)
    const mergedFacts = mergeFacts(memoryRow?.key_facts, incomingFacts)
    await supabaseAdmin.from('chat_memory').upsert(
      {
        memory_key: memoryKey,
        user_id: authUserId || null,
        guest_id: guestId || null,
        case_id: resolvedCaseId || null,
        conversation_id: sessionInfo.conversationId || conversationId || null,
        memory_summary: truncateText(`User: ${message} | Assistant: ${agentResponse.response}`, 480),
        key_facts: mergedFacts,
        open_questions: [],
        last_intent: processingResult.intent,
      },
      { onConflict: 'memory_key' }
    )

    if (chatManager.shouldPersistMessages()) {
      await chatManager.storeRawMessage(
        agentResponse.response,
        'assistant',
        {
          autoGenerated: true,
          type: 'legal_agent_response',
          caseId: processingResult.caseId || null,
          sources: agentResponse.sources || [],
          actionItems,
        },
        processingResult.caseId || sessionInfo.activeCaseId || null
      )
    }

    return withCookie(
      NextResponse.json(
        {
          response: agentResponse.response,
          metadata: {
            documentGenerated: agentResponse.document_generated,
            guidanceProvided: agentResponse.guidance_provided,
            nextSteps: agentResponse.next_steps,
            sources: agentResponse.sources || [],
            caseProcessing: processingResult,
            activeCaseId: processingResult.caseId || sessionInfo.activeCaseId,
            pendingCalendarEntries: (processingResult as any).pendingCalendarEntries || null,
            followUpQuestion,
            actionItems,
          },
        },
        { status: 200 }
      )
    )
  } catch (error: any) {
    await captureServerException(error, {
      component: 'chat',
      route: '/api/chat',
      method: request.method,
      userId: authUserId || null,
      url: request.url,
    })

    if (error instanceof MessageLimitError) {
      return NextResponse.json(
        {
          response: error.message,
          metadata: { limitType: 'message', limitReached: true },
        },
        { status: 200 }
      )
    }

    if (error?.message?.includes('rate limit') || error?.status === 429) {
      return NextResponse.json(
        { response: "⚠️ I'm experiencing high demand right now. Please try again in a moment." },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        message: error?.message || 'Chat failed',
        response: 'I apologize, but I encountered an error. Please try again or rephrase your question.',
      },
      { status: 500 }
    )
  }
}
