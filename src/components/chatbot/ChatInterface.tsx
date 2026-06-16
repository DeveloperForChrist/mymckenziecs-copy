"use client"
import { useState, useRef, useEffect } from 'react';
import type { CSSProperties, FormEvent, ChangeEvent, KeyboardEvent } from 'react'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import ChatEmptyState from '@/components/chatbot/ChatEmptyState'
import ReportIssueModal from '@/components/chatbot/ReportIssueModal'
import NoticeModal from '@/components/chatbot/NoticeModal'
import ChatComposer from '@/components/chatbot/ChatComposer'
import ChatMessageList from '@/components/chatbot/ChatMessageList'
import {
  attachAssistantPresentationMetadata,
  formatAssistantResponse,
  normalizeAssistantResponsePayload,
  parseAssistantResponse,
} from '@/lib/chat/assistant-presentation'
import { fetchConversationHistoryPage } from '@/lib/chat/history-client'
import { useChatAuthPlan, type InitialChatPlanState } from '@/components/chatbot/hooks/useChatAuthPlan'
import { useConversationBootstrap } from '@/components/chatbot/hooks/useConversationBootstrap'
import { hasCaseProfileAccess } from '@/lib/plans/access'
import { formatSupportedAttachmentTypes, isSupportedChatAttachment } from '@/lib/chat/attachments'
import type {
  AssistantMetadata,
  Message,
  AttachmentDisplay,
  SourceReference
} from '@/components/chatbot/chat-types'

// Generate a proper UUID v4
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const linkStyle: CSSProperties = {
  color: '#ef4444',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontWeight: 600
}

const typingAccentColor = 'rgba(236, 72, 153, 0.95)'
const statusDotFrames = ['.  ', '.. ', '...']

const StatusIndicator = ({ label = 'Thinking', compact = false }: { label?: string; compact?: boolean }) => {
  const [dotFrameIndex, setDotFrameIndex] = useState(0)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDotFrameIndex((current) => (current + 1) % statusDotFrames.length)
    }, 420)

    return () => window.clearInterval(intervalId)
  }, [])

  const padding = compact ? '6px 8px' : '8px 10px'
  const dotFrame = statusDotFrames[dotFrameIndex] || statusDotFrames[0]

  return (
    <div
      aria-live="polite"
      aria-label={`${label}…`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding,
        borderRadius: 999,
        background: 'transparent',
        color: typingAccentColor,
      }}
    >
      <span
        style={{
          color: typingAccentColor,
          fontSize: compact ? '0.84rem' : '0.92rem',
          fontWeight: 600,
          letterSpacing: '0.01em',
          lineHeight: 1.2,
        }}
      >
        {label}
        <span
          aria-hidden="true"
          data-status-dots="true"
          style={{
            display: 'inline-block',
            minWidth: compact ? '1.65em' : '1.9em',
            whiteSpace: 'pre',
            textAlign: 'left',
          }}
        >
          {dotFrame}
        </span>
      </span>
    </div>
  )
}

 const stripTrailingUrlPunctuation = (url: string) => {
   let cleaned = url.trim()
   while (cleaned.length > 0 && /[)\].,;:!]/.test(cleaned[cleaned.length - 1])) {
     cleaned = cleaned.slice(0, -1)
   }
   if (cleaned.startsWith('(') || cleaned.startsWith('[')) {
     cleaned = cleaned.slice(1)
   }
   return cleaned
 }

const convertUrlsToLinks = (segment: string) => {
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)\]]+)\)/g
  const urlPattern = /https?:\/\/[^\s]+/g
  const parts: (string | JSX.Element)[] = []
  let cursor = 0
  let key = 0
  let mdMatch

  while ((mdMatch = markdownLinkPattern.exec(segment)) !== null) {
    const matchIndex = mdMatch.index
    if (matchIndex > cursor) {
      const before = segment.slice(cursor, matchIndex)
      parts.push(...convertUrlsToLinks(before))
    }

    const label = mdMatch[1]
    const href = stripTrailingUrlPunctuation(mdMatch[2])
    parts.push(
      <a
        key={`md-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
      >
        {label}
      </a>
    )

    cursor = matchIndex + mdMatch[0].length
  }

  const remaining = segment.slice(cursor)
  const urlParts: (string | JSX.Element)[] = []
  let lastUrlIndex = 0
  let urlMatch
  while ((urlMatch = urlPattern.exec(remaining)) !== null) {
    if (urlMatch.index > lastUrlIndex) {
      urlParts.push(remaining.substring(lastUrlIndex, urlMatch.index))
    }

    const raw = urlMatch[0]
    const cleaned = stripTrailingUrlPunctuation(raw)
    const trailing = raw.slice(cleaned.length)

    urlParts.push(
      <a
        key={`url-${key++}`}
        href={cleaned}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
      >
        {cleaned}
      </a>
    )
    if (trailing) urlParts.push(trailing)

    lastUrlIndex = urlPattern.lastIndex
  }
  if (lastUrlIndex < remaining.length) {
    urlParts.push(remaining.substring(lastUrlIndex))
  }

  return [...parts, ...urlParts]
}

const stripAssistantSourcesBlock = (text: string) => {
  if (!text) return text
  const sourcesBlockRegex =
    /(\n{1,2}(?:Reviewed\s+\d+\s+sources[\s\S]*$|Sources\s+reviewed:[\s\S]*$|Verified\s+sources[\s\S]*$|Sources?:[\s\S]*$))/i
  const withoutSourcesBlock = text.replace(sourcesBlockRegex, '')
  const withoutReferenceIndex = withoutSourcesBlock
    .replace(/^\s*Reference\s+index:\s*[^\n]*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
  return withoutReferenceIndex.trim()
}

// Helper function to render numbered citations with hover tooltips
const renderSourceCitations = (text: string | JSX.Element, sources?: SourceReference[]): (string | JSX.Element)[] => {
  if (typeof text !== 'string') {
    return [text]
  }

  if (!sources || sources.length === 0) {
    // Hide orphaned citation tags when no source metadata is available.
    return [text.replace(/\s*\[\d+\]/g, '').trim()]
  }
  
  const citationPattern = /\[(\d+)\]/g
  const parts: (string | JSX.Element)[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  
  while ((match = citationPattern.exec(text)) !== null) {
    const citationNumber = parseInt(match[1], 10)
    const source = sources.find(s => s.number === citationNumber)
    
    if (lastIndex < match.index) {
      parts.push(text.slice(lastIndex, match.index))
    }
    
    if (source) {
        parts.push(
        <a
          key={`citation-${citationNumber}-${match.index}`}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          title={source.title}
          style={{
            color: '#ef4444',
            fontWeight: 700,
            textDecoration: 'none',
            cursor: 'pointer',
            padding: '0 2px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ef4444'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#ef4444'
          }}
        >
          [{citationNumber}]
        </a>
      )
    } else {
      parts.push(match[0])
    }
    
    lastIndex = citationPattern.lastIndex
  }
  
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  
  return parts.length > 0 ? parts : [text]
}

// Render citations first, then only convert explicit URLs to links.
export const renderMessageContent = (text: string, sources?: SourceReference[]): (string | JSX.Element)[] => {
  const citationProcessed = renderSourceCitations(text, sources)
  const finalParts: (string | JSX.Element)[] = []

  for (const citPart of citationProcessed) {
    if (typeof citPart === 'string') {
      finalParts.push(...convertUrlsToLinks(citPart))
    } else {
      finalParts.push(citPart)
    }
  }

  return finalParts
}

type UploadedAttachment = {
  name: string;
  downloadURL: string;
  storagePath: string;
  size: number;
  mimeType?: string | null;
};

const getMessageIdentity = (message: Pick<Message, 'id' | 'role' | 'content' | 'timestamp'>) => {
  if (typeof message.id === 'string' && message.id.trim()) {
    return `id:${message.id}`
  }

  const timestampValue =
    message.timestamp instanceof Date
      ? message.timestamp.toISOString()
      : new Date(message.timestamp).toISOString()

  return `fallback:${message.role}:${timestampValue}:${message.content}`
}

const normalizeUserId = (value?: string | null) => {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.startsWith('anon_') ? trimmed : `anon_${trimmed}`
}

const getSessionHistoryKey = (userId: string) => `chatSessionHistory:${userId}`

const clearSessionHistory = (userId?: string | null) => {
  if (typeof window === 'undefined') return
  if (!userId) return
  sessionStorage.removeItem(getSessionHistoryKey(userId))
  window.dispatchEvent(new CustomEvent('sessionHistoryCleared'))
}

const getSessionStartKey = (userId: string) => `chatSessionStart:${userId}`

const getOrInitSessionStart = (userId: string) => {
  if (typeof window === 'undefined') return new Date().toISOString()
  const key = getSessionStartKey(userId)
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const now = new Date().toISOString()
  sessionStorage.setItem(key, now)
  return now
}

type ChatInterfaceProps = {
  initialAuthPlan?: InitialChatPlanState | null
  composerPlacement?: 'viewport' | 'pane'
  paneWidth?: 'full' | 'standard'
  conversationHomeHref?: string
  guestHomeHref?: string
  anonymousMessageLimit?: number | null
}

export default function ChatInterface({
  initialAuthPlan = null,
  composerPlacement = 'viewport',
  paneWidth = 'full',
  conversationHomeHref,
  guestHomeHref,
  anonymousMessageLimit = null,
}: ChatInterfaceProps = {}) {
  const dockComposerToPane = composerPlacement === 'pane'
  const useFullPaneWidth = dockComposerToPane && paneWidth === 'full'
  const shouldConstrainPaneContent = dockComposerToPane && paneWidth === 'standard'
  const [caseId, setCaseId] = useState<string>("");
  const supabase = getSupabaseBrowserClient();
  const pendingActiveCaseOverrideRef = useRef<string | null>(null)

  const normalizeCaseId = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(trimmed) ? trimmed : null;
  };

  const {
    supabaseUser,
    plan,
    paidAccess,
    platformAccess,
    planLoaded,
    authLoaded,
  } = useChatAuthPlan({ supabase, clearSessionHistory, initialState: initialAuthPlan })
  const canUseCaseContext = Boolean(supabaseUser) && planLoaded && hasCaseProfileAccess(plan || '')

  useEffect(() => {
    if (!canUseCaseContext) return
    const stored = localStorage.getItem("selectedCaseId");
    const normalizedStoredCaseId = normalizeCaseId(stored);
    if (normalizedStoredCaseId) setCaseId(normalizedStoredCaseId);
    if (stored && !normalizedStoredCaseId) localStorage.removeItem('selectedCaseId')
  }, [canUseCaseContext]);

  useEffect(() => {
    if (!planLoaded) return
    if (!supabaseUser || canUseCaseContext) return
    setCaseId('')
    pendingActiveCaseOverrideRef.current = null
    localStorage.removeItem('selectedCaseId')
    window.dispatchEvent(new CustomEvent('activeCaseChanged', { detail: { caseId: null } }))
  }, [supabaseUser, planLoaded, canUseCaseContext])

  useEffect(() => {
    const handler = (event: Event) => {
      if (!canUseCaseContext) return
      const detail = (event as CustomEvent<{ caseId?: string | null }>).detail;
      if (detail?.caseId === null) {
        setCaseId('')
        pendingActiveCaseOverrideRef.current = null
        localStorage.removeItem('selectedCaseId')
        return
      }
      const normalizedNextCaseId = normalizeCaseId(detail?.caseId);
      if (!normalizedNextCaseId) return;
      setCaseId(normalizedNextCaseId);
      localStorage.setItem('selectedCaseId', normalizedNextCaseId)
      pendingActiveCaseOverrideRef.current = normalizedNextCaseId
    };
    window.addEventListener('activeCaseChanged', handler as EventListener);
    return () => window.removeEventListener('activeCaseChanged', handler as EventListener);
  }, [canUseCaseContext]);

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [userId, setUserId] = useState<string>('anonymous')
  const [conversationId, setConversationId] = useState<string>('')
  const [showWordLimitWarning, setShowWordLimitWarning] = useState(false)
  const [feedbackState, setFeedbackState] = useState<{[key: number]: 'like' | 'dislike' | null}>({})
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportIssue, setReportIssue] = useState('')
  const [reportProblem, setReportProblem] = useState('')
  const [reportingMessageIndex, setReportingMessageIndex] = useState<number | null>(null)
  const [reportingMessageContent, setReportingMessageContent] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [guestUploadWarning, setGuestUploadWarning] = useState<string | null>(null)
  const [showGuestSignupModal, setShowGuestSignupModal] = useState(false)
  const [guestSignupReason, setGuestSignupReason] = useState<'upload' | 'limit'>('upload')
  const [isConversationBootstrapping, setIsConversationBootstrapping] = useState(true)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false)
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string } | null>(null)
  const [floatingNotice, setFloatingNotice] = useState<string | null>(null)
  const [activeInlineStreamMessageId, setActiveInlineStreamMessageId] = useState<string | null>(null)
  const isSignedInPlanLocked = Boolean(supabaseUser) && planLoaded && !platformAccess
  const canUploadAttachments = Boolean(supabaseUser) && paidAccess
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const streamFlushTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const streamTypingMessageIdRef = useRef<string | null>(null)
  const streamPendingDeltaRef = useRef('')
  const streamRawTextRef = useRef('')
  const streamStatusTypingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const streamStatusTypingMessageIdRef = useRef<string | null>(null)
  const streamStatusPendingLabelRef = useRef('')
  const pendingStreamFinalizeRef = useRef<{
    messageId: string
    fullText: string
    metadata?: AssistantMetadata
  } | null>(null)
  const chatRequestAbortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prevLineCountRef = useRef<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const conversationIdRef = useRef('')
  const loadingOlderHistoryRef = useRef(false)
  const floatingNoticeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastScrollTopRef = useRef(0)
  const lastWindowScrollYRef = useRef(0)
  const isNearBottomRef = useRef(true)
  const isProgrammaticScrollRef = useRef(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false)

  const extractBasicDailySearchNotice = (metadata?: AssistantMetadata): string | null => {
    const value = metadata?.basicDailySearchNotice
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
  const formatLimitReturnTime = (value?: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const extractAssistantFreeLimitNotice = (metadata?: AssistantMetadata): string | null => {
    if (!metadata?.assistantFreeLimitNotice) return null
    const returnTime = formatLimitReturnTime(metadata.canMessageAgainAt)
    return returnTime
      ? `You have hit your limit. Come back at ${returnTime} to continue, or upgrade your plan for more access.`
      : 'You have hit your limit. Come back later to continue, or upgrade your plan for more access.'
  }
  const extractComposerNotice = (metadata?: AssistantMetadata): string | null =>
    extractAssistantFreeLimitNotice(metadata) || extractBasicDailySearchNotice(metadata)

  const showFloatingNotice = (message: string | null | undefined) => {
    const normalized = String(message || '').trim()
    if (!normalized) return
    if (floatingNoticeTimeoutRef.current) {
      clearTimeout(floatingNoticeTimeoutRef.current)
      floatingNoticeTimeoutRef.current = null
    }
    setFloatingNotice(normalized)
    floatingNoticeTimeoutRef.current = setTimeout(() => {
      setFloatingNotice(null)
      floatingNoticeTimeoutRef.current = null
    }, 5200)
  }

  useEffect(() => {
    return () => {
      if (floatingNoticeTimeoutRef.current) {
        clearTimeout(floatingNoticeTimeoutRef.current)
        floatingNoticeTimeoutRef.current = null
      }
    }
  }, [])
  const [showScrollToBottomButtonByWindow, setShowScrollToBottomButtonByWindow] = useState(false)
  const initialPendingStatusLabel = 'Thinking...'

  const scrollToBottom = (behavior: 'auto' | 'smooth' = 'smooth') => {
    const container = scrollContainerRef.current
    if (container) {
      isProgrammaticScrollRef.current = true
      container.scrollTo({ top: container.scrollHeight, behavior })
      lastScrollTopRef.current = container.scrollHeight
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior })
    }
    isNearBottomRef.current = true
    setShowScrollToBottomButton(false)
    setShowScrollToBottomButtonByWindow(false)
  }

  useEffect(() => {
    conversationIdRef.current = conversationId.trim()
    loadingOlderHistoryRef.current = false
    setLoadingOlderHistory(false)
  }, [conversationId])

  const loadOlderMessages = async () => {
    const requestedConversationId = conversationIdRef.current
    if (!requestedConversationId || !historyCursor || !hasMoreHistory || isConversationBootstrapping) {
      return
    }

    if (loadingOlderHistoryRef.current) {
      return
    }

    const container = scrollContainerRef.current
    const previousScrollHeight = container?.scrollHeight ?? 0
    const previousScrollTop = container?.scrollTop ?? 0

    loadingOlderHistoryRef.current = true
    setLoadingOlderHistory(true)

    try {
      const data = await fetchConversationHistoryPage({
        conversationId: requestedConversationId,
        before: historyCursor,
      })

      if (conversationIdRef.current !== requestedConversationId) {
        return
      }

      setHistoryCursor(data.nextCursor)
      setHasMoreHistory(data.hasMoreOlder)
      setMessages((prev) => {
        if (!data.messages.length) return prev
        const existingKeys = new Set(prev.map((message) => getMessageIdentity(message)))
        const olderMessages = data.messages.filter((message) => !existingKeys.has(getMessageIdentity(message)))
        return olderMessages.length > 0 ? [...olderMessages, ...prev] : prev
      })

      requestAnimationFrame(() => {
        const nextContainer = scrollContainerRef.current
        if (!nextContainer || conversationIdRef.current !== requestedConversationId) return
        const scrollDelta = nextContainer.scrollHeight - previousScrollHeight
        nextContainer.scrollTop = previousScrollTop + scrollDelta
        lastScrollTopRef.current = nextContainer.scrollTop
      })
    } catch (error: any) {
      console.error('Failed to load older history:', error)
    } finally {
      if (conversationIdRef.current === requestedConversationId) {
        loadingOlderHistoryRef.current = false
        setLoadingOlderHistory(false)
      }
    }
  }

  const handleScroll = () => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }
    const currentTop = container.scrollTop
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false
      lastScrollTopRef.current = currentTop
      return
    }

    const maxScrollable = container.scrollHeight - container.clientHeight
    const distanceFromBottom = maxScrollable - container.scrollTop
    const isNearBottom = maxScrollable <= 2 || distanceFromBottom <= 2
    isNearBottomRef.current = isNearBottom

    if (isNearBottom !== autoScroll) {
      setAutoScroll(isNearBottom)
    }
    const isScrollingUp = currentTop < lastScrollTopRef.current - 1
    const isScrollingDown = currentTop > lastScrollTopRef.current + 1
    if (isNearBottom || messages.length === 0) {
      setShowScrollToBottomButton(false)
    } else if (isScrollingUp) {
      setShowScrollToBottomButton(true)
    } else if (isScrollingDown) {
      setShowScrollToBottomButton(false)
    }
    lastScrollTopRef.current = currentTop

    if (
      currentTop <= 80 &&
      hasMoreHistory &&
      !loadingOlderHistoryRef.current &&
      !isConversationBootstrapping &&
      conversationIdRef.current
    ) {
      void loadOlderMessages()
    }
  }

  const jumpToLatest = () => {
    scrollToBottom('smooth')
    setAutoScroll(true)
    isNearBottomRef.current = true
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }
  }

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    lastScrollTopRef.current = container.scrollTop
    const maxScrollable = container.scrollHeight - container.clientHeight
    const distanceFromBottom = maxScrollable - container.scrollTop
    const isNearBottom = maxScrollable <= 2 || distanceFromBottom <= 2
    isNearBottomRef.current = isNearBottom
    setAutoScroll(isNearBottom)
    setShowScrollToBottomButton(false)
  }, [messages.length])

  useEffect(() => {
    if (typeof window === 'undefined') return
    lastWindowScrollYRef.current = window.scrollY
    const onWindowScroll = () => {
      const currentY = window.scrollY
      const isScrollingUp = currentY < lastWindowScrollYRef.current - 1
      const isScrollingDown = currentY > lastWindowScrollYRef.current + 1
      const doc = document.documentElement
      const nearPageBottom = currentY + window.innerHeight >= doc.scrollHeight - 2

      if (nearPageBottom || messages.length === 0) {
        setShowScrollToBottomButtonByWindow(false)
      } else if (isScrollingUp) {
        setShowScrollToBottomButtonByWindow(true)
      } else if (isScrollingDown) {
        setShowScrollToBottomButtonByWindow(false)
      }

      lastWindowScrollYRef.current = currentY
    }

    window.addEventListener('scroll', onWindowScroll, { passive: true })
    return () => window.removeEventListener('scroll', onWindowScroll)
  }, [messages.length])

  useEffect(() => {
    if (isConversationBootstrapping || loadingOlderHistory || !hasMoreHistory || messages.length === 0) {
      return
    }

    const container = scrollContainerRef.current
    if (!container || !conversationIdRef.current) {
      return
    }

    if (container.scrollHeight <= container.clientHeight + 48) {
      void loadOlderMessages()
    }
  }, [conversationId, hasMoreHistory, isConversationBootstrapping, loadingOlderHistory, messages.length])

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      // Could add a toast notification here
    } catch (err: any) {
      console.error('Failed to copy:', err)
    }
  }

  const handleAttachClick = () => {
    if (!supabaseUser) {
      setGuestSignupReason('upload')
      setShowGuestSignupModal(true)
      return
    }
    if (!canUploadAttachments) {
      setNoticeModal({
        title: 'Document uploads are on Plus',
        message: 'Free Assistant includes chat and limited web search. Upgrade to an Assistant Plus or workspace plan to upload documents in chat.',
      })
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (!supabaseUser) {
      setGuestSignupReason('upload')
      setShowGuestSignupModal(true)
      e.target.value = ''
      return
    }
    if (!canUploadAttachments) {
      setNoticeModal({
        title: 'Document uploads are on Plus',
        message: 'Free Assistant includes chat and limited web search. Upgrade to an Assistant Plus or workspace plan to upload documents in chat.',
      })
      e.target.value = ''
      return
    }
    const supportedFiles = files.filter((file) => isSupportedChatAttachment({ name: file.name, type: file.type || null }))
    const unsupportedFiles = files.filter((file) => !isSupportedChatAttachment({ name: file.name, type: file.type || null }))

    if (unsupportedFiles.length > 0) {
      const unsupportedNames = unsupportedFiles
        .map((file) => file.name)
        .slice(0, 3)
        .join(', ')
      setGuestUploadWarning(
        `Unsupported file type: ${unsupportedNames}. Supported types: ${formatSupportedAttachmentTypes()}.`
      )
    } else {
      setGuestUploadWarning(null)
    }

    if (supportedFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...supportedFiles])
    }
    e.target.value = ''
  }

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const sanitizeFilename = (value: string) => {
    const trimmed = value.replace(/\s+/g, ' ').trim()
    return trimmed.replace(/[^a-zA-Z0-9._\- ]/g, '').trim() || 'uploaded-document'
  }

  const uploadAttachments = async (files: File[], targetCaseId?: string | null): Promise<UploadedAttachment[]> => {
    if (!files.length) return []
    if (!supabaseUser) {
      setGuestSignupReason('upload')
      setShowGuestSignupModal(true)
      return []
    }
    if (!canUploadAttachments) {
      throw new Error('Document uploads are available on Assistant Plus and higher plans.')
    }

    const uploaded: UploadedAttachment[] = []
    const errors: string[] = []
    const formData = new FormData()
    if (targetCaseId?.trim()) {
      formData.append('caseId', targetCaseId.trim())
    }
    for (const file of files) {
      formData.append('files', file, sanitizeFilename(file.name))
    }

    try {
      const response = await fetch('/api/chat-upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.message || 'Upload failed')
      }

      if (Array.isArray(data?.files)) {
        data.files.forEach((file: UploadedAttachment) => {
          uploaded.push(file)
        })
      }
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      console.error('Attachment upload failed', error)
      errors.push(message)
    }

    if (!uploaded.length && errors.length > 0) {
      throw new Error(errors[0])
    }

    if (errors.length > 0) {
      setGuestUploadWarning('Some attachments failed to upload. Please retry the missing files.')
    }

    return uploaded
  }

  const composeMessageWithAttachments = (text: string, attachments: AttachmentDisplay[]) => {
    const readyAttachments = attachments.filter((file) => file.downloadURL)
    if (!readyAttachments.length) return text
    const baseMessage = text.trim().length > 0 ? text.trim() : 'Uploaded documents for review.'
    const attachmentLines = readyAttachments.map((file) => `- ${file.name}: ${file.downloadURL}`).join('\n')
    return `${baseMessage}\n\nAttachments:\n${attachmentLines}`
  }

  const handleFeedback = async (messageIndex: number, type: 'like' | 'dislike' | 'report', content: string) => {
    if (type === 'report') {
      // Open modal for report
      setReportingMessageIndex(messageIndex)
      setReportingMessageContent(content)
      setShowReportModal(true)
      return
    }

    try {
      await fetch('/api/admin/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          conversationId,
          messageIndex,
          feedbackType: type,
          messageContent: content,
          timestamp: new Date().toISOString()
        })
      })
      
      setFeedbackState(prev => ({
        ...prev,
        [messageIndex]: type
      }))
    } catch (error: any) {
      console.error('Failed to submit feedback:', error)
    }
  }

  const handleSubmitReport = async () => {
    if (!reportIssue.trim() || !reportProblem.trim()) {
      setNoticeModal({ title: 'Missing details', message: 'Please fill in all report fields.' })
      return
    }

    try {
      await fetch('/api/admin/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          conversationId,
          messageIndex: reportingMessageIndex,
          feedbackType: 'report',
          messageContent: reportingMessageContent,
          reportIssue,
          reportProblem,
          timestamp: new Date().toISOString()
        })
      })

      // Close modal and reset
      setShowReportModal(false)
      setReportIssue('')
      setReportProblem('')
      setReportingMessageIndex(null)
      setReportingMessageContent('')
      
      setNoticeModal({ title: 'Report submitted', message: 'Thank you for your feedback.' })
    } catch (error: any) {
      console.error('Failed to submit report:', error)
      setNoticeModal({ title: 'Submit failed', message: 'Failed to submit report. Please try again.' })
    }
  }

  const handleCloseReportModal = () => {
    setShowReportModal(false)
    setReportIssue('')
    setReportProblem('')
    setReportingMessageIndex(null)
    setReportingMessageContent('')
  }

  const handleRegenerate = async (messageIndex: number) => {
    // Get the user message that prompted this response
    const userMsg = messages[messageIndex - 1]
    if (!userMsg || userMsg.role !== 'user') return

    // Remove the current bot response
    setMessages(prev => prev.slice(0, messageIndex))
    
    // Resend the user's message
    setLoading(true)
    setLoadingLabel(initialPendingStatusLabel)

    const sessionStart = getOrInitSessionStart(supabaseUser?.id || 'anonymous')
    const sessionUserMessageCount =
      messages.filter((msg) => msg.role === 'user').length + 1
    let targetConversationId =
      (conversationId || (typeof window !== 'undefined' ? localStorage.getItem('currentConversationId') : '') || '').trim()
    if (!targetConversationId) {
      targetConversationId = generateUUID()
      setConversationId(targetConversationId)
      if (typeof window !== 'undefined') {
        localStorage.setItem('currentConversationId', targetConversationId)
      }
    }

    let activeCaseOverride: string | null = null
    let streamedAssistantMessageId: string | null = null
    try {
      const regenAttachments = userMsg.attachments || []
      const regenMessage = regenAttachments.length
        ? composeMessageWithAttachments(userMsg.content, regenAttachments)
        : userMsg.content
      const attachmentsOnly = regenAttachments.length > 0 && userMsg.content.trim() === 'Uploaded documents for review.'
      activeCaseOverride = canUseCaseContext ? pendingActiveCaseOverrideRef.current : null
      pendingActiveCaseOverrideRef.current = null
      const controller = new AbortController()
      chatRequestAbortRef.current = controller
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mymckenzie-stream': '1',
        },
        signal: controller.signal,
        body: JSON.stringify({ 
          message: regenMessage, 
          history: messages.slice(0, messageIndex - 1),
          userId: userId,
          conversationId: targetConversationId,
          activeCaseId: canUseCaseContext ? activeCaseOverride || undefined : undefined,
          attachments: regenAttachments,
          attachmentsOnly: attachmentsOnly,
          sessionMessageCount: sessionUserMessageCount,
          sessionStartedAt: sessionStart
        }),
      })

      const isStreamResponse = (response.headers.get('content-type') || '').includes('application/x-ndjson')
      if (isStreamResponse) {
        const assistantMessageId = `assistant_regen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        streamedAssistantMessageId = assistantMessageId
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isTyping: true,
          streamStatusLabel: null,
        }

        setMessages((prev) => [...prev, assistantMessage])
        streamRawTextRef.current = ''
        setActiveInlineStreamMessageId(assistantMessageId)
        typeStreamStatusById(assistantMessageId, initialPendingStatusLabel)

        if (!response.ok) {
          throw new Error('Streaming request failed')
        }

        try {
          await consumeAssistantStream(response, assistantMessageId)
        } finally {
          setActiveInlineStreamMessageId((current) => current === assistantMessageId ? null : current)
        }
        chatRequestAbortRef.current = null
        setLoading(false)
        setLoadingLabel(null)
        return
      }

      const rawData = await response.json()
      const data = normalizeAssistantResponsePayload(rawData) || rawData

      if (!response.ok) {
        const message =
          (typeof data?.response === 'string' && data.response.trim()) ||
          (typeof data?.message === 'string' && data.message.trim()) ||
          (typeof data?.error === 'string' && data.error.trim()) ||
          'Failed to get response'
        throw new Error(message)
      }

      if (canUseCaseContext && data?.metadata?.activeCaseId) {
        const resolvedCaseId = String(data.metadata.activeCaseId).trim()
        if (resolvedCaseId) {
          setCaseId(resolvedCaseId)
          localStorage.setItem('selectedCaseId', resolvedCaseId)
        }
      }

      const assistantText = stripAssistantSourcesBlock(String(data.response || ''))
      const assistantMessageId = `assistant_regen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isTyping: true,
        metadata: data.metadata as AssistantMetadata | undefined
      }

      setMessages((prev) => [...prev, assistantMessage])

      typeMessageById(
        assistantText,
        assistantMessageId,
        () => showFloatingNotice(extractComposerNotice(data.metadata as AssistantMetadata | undefined))
      )
      chatRequestAbortRef.current = null
    } catch (error: any) {
      chatRequestAbortRef.current = null
      if (error?.name === 'AbortError') {
        if (activeCaseOverride) pendingActiveCaseOverrideRef.current = activeCaseOverride
        setActiveInlineStreamMessageId(null)
        setLoading(false)
        setLoadingLabel(null)
        return
      }
      if (activeCaseOverride) pendingActiveCaseOverrideRef.current = activeCaseOverride
      setActiveInlineStreamMessageId(null)
      setLoading(false)
      setLoadingLabel(null)
      const errorText = error instanceof Error && error.message
        ? error.message
        : 'MyMcKenzieCS is unavailable to help right now. Please try again later.'
      const targetMessageId = streamedAssistantMessageId || `assistant_regen_error_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      replaceStreamedMessageWithTypedErrorById(targetMessageId, errorText)
    }
  }

  // Auto-expand textarea — derive min/max from CSS and only grow when line count changes
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    // reset to auto to get accurate scrollHeight
    ta.style.height = 'auto'
    const computed = window.getComputedStyle(ta)
    const lineHeightPx = parseFloat(computed.lineHeight) || 20
    const scrollH = ta.scrollHeight
    const currentLines = Math.max(1, Math.round(scrollH / lineHeightPx))

    const maxLines = 10
    const clampedLines = Math.min(currentLines, maxLines)

    // Read CSS min-height (e.g. '32px') and use it as JS minimum
    const cssMinHeight = parseFloat(computed.minHeight || '') || 32
    const paddingY = (parseFloat(computed.paddingTop || '0') + parseFloat(computed.paddingBottom || '0')) || 8

    // Compute the max height from maxLines so JS and maxLines are consistent
    const computedMaxHeight = Math.max(cssMinHeight, Math.round(maxLines * lineHeightPx + paddingY))

    if (clampedLines !== prevLineCountRef.current) {
      const desiredHeight = Math.round(clampedLines * lineHeightPx + paddingY)
      const newHeight = Math.max(cssMinHeight, Math.min(computedMaxHeight, desiredHeight))
      ta.style.height = `${newHeight}px`
      prevLineCountRef.current = clampedLines
    } else {
      // keep existing height — prevents tiny jumps
      if (ta.clientHeight < cssMinHeight) ta.style.height = `${cssMinHeight}px`
    }
  }, [input])

  useEffect(() => {
    if (autoScroll) {
      scrollToBottom()
    }
  }, [messages.length, autoScroll])

  const runTypingAnimation = (
    fullText: string,
    applyUpdate: (prev: Message[], text: string, isDone: boolean) => Message[],
    onDone?: () => void
  ) => {
    const strippedText = stripAssistantSourcesBlock(fullText)
    const fallbackText = typeof fullText === 'string' ? fullText.trim() : ''
    const sanitizedText = strippedText || fallbackText

    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current)
      typingIntervalRef.current = null
    }

    if (!sanitizedText) {
      setMessages((prev) => applyUpdate(prev, '', true))
      setLoading(false)
      setLoadingLabel(null)
      onDone?.()
      return
    }

    const totalLength = sanitizedText.length
    // Strict character-by-character typing for a natural output reveal.
    const tickMs = 14
    let cursor = 0

    const tick = () => {
      cursor = Math.min(totalLength, cursor + 1)
      const rawChunk = sanitizedText.slice(0, cursor)
      const isDone = cursor >= totalLength
      const chunk = formatAssistantResponse(rawChunk)

      setMessages((prev) => applyUpdate(prev, chunk, isDone))

      if (isDone) {
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current)
          typingIntervalRef.current = null
        }
        setLoading(false)
        setLoadingLabel(null)
        onDone?.()
      }
    }

    tick()
    if (cursor < totalLength) {
      typingIntervalRef.current = setInterval(tick, tickMs)
    }
  }

  const typeMessageById = (fullText: string, messageId: string, onDone?: () => void) => {
    runTypingAnimation(fullText, (prev, text, isDone) => {
      const targetIndex = prev.findIndex((m) => m.id === messageId)
      if (targetIndex < 0) return prev

      const target = prev[targetIndex]
      const nextIsTyping = !isDone
      const nextMetadata = isDone
        ? (attachAssistantPresentationMetadata(text, target.metadata) as AssistantMetadata | undefined)
        : target.metadata

      if (target.content === text && target.isTyping === nextIsTyping && target.metadata === nextMetadata) {
        return prev
      }

      const updated = [...prev]
      updated[targetIndex] = {
        ...target,
        content: text,
        isTyping: nextIsTyping,
        metadata: nextMetadata
      }
      return updated
    }, onDone)
  }

  const commitFinalStreamedMessageById = (
    messageId: string,
    fullText: string,
    metadata?: AssistantMetadata
  ) => {
    pendingStreamFinalizeRef.current = null
    streamTypingMessageIdRef.current = null
    streamRawTextRef.current = fullText
    if (streamFlushTimeoutRef.current) {
      clearTimeout(streamFlushTimeoutRef.current)
      streamFlushTimeoutRef.current = null
    }

    const formattedAssistantText = formatAssistantResponse(fullText)
    setMessages((prev) => {
      const targetIndex = prev.findIndex((m) => m.id === messageId)
      if (targetIndex < 0) return prev

      const target = prev[targetIndex]
      const updated = [...prev]
      updated[targetIndex] = {
        ...target,
        content: formattedAssistantText,
        isTyping: false,
        streamStatusLabel: null,
        metadata: attachAssistantPresentationMetadata(
          formattedAssistantText,
          metadata || target.metadata
        ) as AssistantMetadata | undefined,
      }
      return updated
    })
    showFloatingNotice(extractComposerNotice(metadata))
  }

  const flushStreamDeltaBufferById = (messageId: string) => {
    const pending = streamPendingDeltaRef.current
    if (pending) {
      streamPendingDeltaRef.current = ''
      streamRawTextRef.current = `${streamRawTextRef.current}${pending}`

      setMessages((prev) => {
        const targetIndex = prev.findIndex((m) => m.id === messageId)
        if (targetIndex < 0) return prev

        const target = prev[targetIndex]
        const updated = [...prev]
        updated[targetIndex] = {
          ...target,
          content: formatAssistantResponse(streamRawTextRef.current),
          isTyping: true,
          streamStatusLabel: null,
        }
        return updated
      })
    }

    const pendingFinalize = pendingStreamFinalizeRef.current
    if (pendingFinalize && pendingFinalize.messageId === messageId && !streamPendingDeltaRef.current) {
      const assistantText = stripAssistantSourcesBlock(String(pendingFinalize.fullText || ''))
      commitFinalStreamedMessageById(messageId, assistantText, pendingFinalize.metadata)
    }
  }

  const scheduleStreamFlushById = (messageId: string, delayMs: number = 18) => {
    streamTypingMessageIdRef.current = messageId
    if (streamFlushTimeoutRef.current) return

    streamFlushTimeoutRef.current = setTimeout(() => {
      streamFlushTimeoutRef.current = null
      const activeMessageId = streamTypingMessageIdRef.current
      if (!activeMessageId) return
      flushStreamDeltaBufferById(activeMessageId)
    }, delayMs)
  }

  const appendStreamDeltaById = (messageId: string, delta: string) => {
    if (!delta) return
    clearTypedStreamStatusById(messageId)
    streamTypingMessageIdRef.current = messageId
    streamPendingDeltaRef.current += delta
    scheduleStreamFlushById(messageId)
  }

  const setInlineStreamStatusById = (messageId: string, statusLabel: string | null) => {
    const normalizedStatus = String(statusLabel || '').trim()

    setMessages((prev) => {
      const targetIndex = prev.findIndex((m) => m.id === messageId)
      if (targetIndex < 0) return prev

      const target = prev[targetIndex]
      if ((target.content || '').trim()) {
        if (!target.streamStatusLabel) return prev
        const updated = [...prev]
        updated[targetIndex] = {
          ...target,
          streamStatusLabel: null,
        }
        return updated
      }

      const nextStatus = normalizedStatus || null
      if ((target.streamStatusLabel || null) === nextStatus) return prev

      const updated = [...prev]
      updated[targetIndex] = {
        ...target,
        streamStatusLabel: nextStatus,
      }
      return updated
    })
  }

  const stopTypedStreamStatus = () => {
    if (streamStatusTypingIntervalRef.current) {
      clearTimeout(streamStatusTypingIntervalRef.current)
      streamStatusTypingIntervalRef.current = null
    }
    streamStatusTypingMessageIdRef.current = null
    streamStatusPendingLabelRef.current = ''
  }

  const clearTypedStreamStatusById = (messageId: string) => {
    if (streamStatusTypingMessageIdRef.current === messageId) {
      stopTypedStreamStatus()
    }
    setLoadingLabel(null)
    setInlineStreamStatusById(messageId, null)
  }

  const typeStreamStatusById = (messageId: string, statusLabel: string | null) => {
    const normalizedStatus = String(statusLabel || '').trim()

    clearTypedStreamStatusById(messageId)
    if (!normalizedStatus) return

    streamStatusTypingMessageIdRef.current = messageId
    streamStatusPendingLabelRef.current = normalizedStatus
    let cursor = 0

    const resolveTickMs = (remainingLength: number) => {
      if (remainingLength > 20) return 30
      if (remainingLength > 8) return 38
      return 48
    }

    const tick = () => {
      streamStatusTypingIntervalRef.current = null
      if (streamStatusTypingMessageIdRef.current !== messageId) return

      const targetLabel = streamStatusPendingLabelRef.current
      if (!targetLabel) {
        clearTypedStreamStatusById(messageId)
        return
      }

      cursor = Math.min(targetLabel.length, cursor + 1)
      const nextStatus = targetLabel.slice(0, cursor)
      setLoadingLabel(nextStatus)
      setInlineStreamStatusById(messageId, nextStatus)

      if (cursor >= targetLabel.length) {
        return
      }

      streamStatusTypingIntervalRef.current = setTimeout(
        tick,
        resolveTickMs(targetLabel.length - cursor)
      )
    }

    tick()
  }

  const finalizeStreamedMessageById = (
    messageId: string,
    fullText: string,
    metadata?: AssistantMetadata
  ) => {
    const assistantText = stripAssistantSourcesBlock(String(fullText || ''))
    clearTypedStreamStatusById(messageId)
    pendingStreamFinalizeRef.current = {
      messageId,
      fullText: assistantText,
      metadata,
    }

    if (streamPendingDeltaRef.current) {
      scheduleStreamFlushById(messageId, 0)
      return
    }

    commitFinalStreamedMessageById(messageId, assistantText, metadata)
  }

  const replaceStreamedMessageWithTypedErrorById = (messageId: string, errorText: string) => {
    if (streamFlushTimeoutRef.current) {
      clearTimeout(streamFlushTimeoutRef.current)
      streamFlushTimeoutRef.current = null
    }
    if (streamTypingMessageIdRef.current === messageId) {
      streamTypingMessageIdRef.current = null
    }
    if (pendingStreamFinalizeRef.current?.messageId === messageId) {
      pendingStreamFinalizeRef.current = null
    }
    streamPendingDeltaRef.current = ''
    streamRawTextRef.current = ''
    clearTypedStreamStatusById(messageId)

    setMessages((prev) => {
      const targetIndex = prev.findIndex((m) => m.id === messageId)
      if (targetIndex < 0) {
        return [
          ...prev,
          {
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isTyping: true,
            streamStatusLabel: null,
            metadata: undefined,
          },
        ]
      }

      const target = prev[targetIndex]
      const updated = [...prev]
      updated[targetIndex] = {
        ...target,
        content: '',
        isTyping: true,
        streamStatusLabel: null,
        metadata: undefined,
      }
      return updated
    })

    typeMessageById(errorText, messageId)
  }

  const consumeAssistantStream = async (response: Response, assistantMessageId: string) => {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Streaming response body was unavailable')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)

        if (line) {
          const event = JSON.parse(line) as {
            type?: string
            delta?: string
            message?: string
            payload?: unknown
          }

          if (event.type === 'delta' && typeof event.delta === 'string') {
            appendStreamDeltaById(assistantMessageId, event.delta)
          } else if (event.type === 'status' && typeof event.message === 'string') {
            typeStreamStatusById(assistantMessageId, event.message)
          } else if (event.type === 'done') {
            const data = normalizeAssistantResponsePayload(event.payload) || event.payload
            if (!data || typeof (data as any).response !== 'string') {
              throw new Error('Streaming response completed with an invalid payload')
            }
            const payload = data as { response: string; metadata?: AssistantMetadata }
            finalizeStreamedMessageById(assistantMessageId, payload.response, payload.metadata)
            return payload
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Streaming request failed')
          }
        }

        newlineIndex = buffer.indexOf('\n')
      }

      if (done) break
    }

    throw new Error('Streaming response ended before completion')
  }

  useConversationBootstrap({
    normalizeUserId,
    generateUUID,
    conversationHomeHref,
    setUserId,
    setMessages,
    setConversationId,
    setHistoryCursor,
    setHasMoreHistory,
    setIsConversationBootstrapping
  })

  useEffect(() => {
    const handleConversationDeleted = (event: Event) => {
      const deletedConversationId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId?.trim()
      if (!deletedConversationId) return

      const activeConversationId =
        conversationIdRef.current ||
        (typeof window !== 'undefined' ? localStorage.getItem('currentConversationId') || '' : '')
      const urlConversationId =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('conversationId') || ''
          : ''

      if (activeConversationId !== deletedConversationId && urlConversationId !== deletedConversationId) {
        return
      }

      chatRequestAbortRef.current?.abort()
      chatRequestAbortRef.current = null
      streamRawTextRef.current = ''
      streamPendingDeltaRef.current = ''
      streamStatusPendingLabelRef.current = ''
      pendingStreamFinalizeRef.current = null
      setActiveInlineStreamMessageId(null)
      setMessages([])
      setHistoryCursor(null)
      setHasMoreHistory(false)
      setLoadingOlderHistory(false)
      loadingOlderHistoryRef.current = false
      setLoading(false)
      setLoadingLabel(null)

      const nextConversationId = generateUUID()
      setConversationId(nextConversationId)
      conversationIdRef.current = nextConversationId
      localStorage.setItem('currentConversationId', nextConversationId)

      const nextHref = conversationHomeHref || window.location.pathname
      window.history.replaceState({}, '', nextHref)
    }

    window.addEventListener('chatConversationDeleted', handleConversationDeleted as EventListener)
    return () => window.removeEventListener('chatConversationDeleted', handleConversationDeleted as EventListener)
  }, [conversationHomeHref])

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (textareaRef.current && input === '') {
      textareaRef.current.style.height = 'auto'
    }
  }, [input]);

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    const words = text.trim().split(/\s+/).filter(word => word.length > 0)
    const count = words.length
    if (count > 600) {
      const truncated = words.slice(0, 600).join(' ')
      setInput(truncated)
      setShowWordLimitWarning(true)
      return
    }
    setShowWordLimitWarning(false)
    setInput(text)

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  const handleInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const canSubmit = input.trim().length > 0 || attachedFiles.length > 0
    if (isSignedInPlanLocked) {
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !loading && canSubmit) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleStopGeneration = () => {
    if (chatRequestAbortRef.current) {
      chatRequestAbortRef.current.abort()
      chatRequestAbortRef.current = null
    }
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current)
      typingIntervalRef.current = null
    }
    if (streamFlushTimeoutRef.current) {
      clearTimeout(streamFlushTimeoutRef.current)
      streamFlushTimeoutRef.current = null
    }
    stopTypedStreamStatus()
    streamPendingDeltaRef.current = ''
    streamTypingMessageIdRef.current = null
    streamRawTextRef.current = ''
    pendingStreamFinalizeRef.current = null
    setMessages(prev => {
      const updated = [...prev]
      const lastIndex = updated.length - 1
      if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
        updated[lastIndex] = {
          ...updated[lastIndex],
          isTyping: false,
          metadata: attachAssistantPresentationMetadata(
            stripAssistantSourcesBlock(updated[lastIndex].content || ''),
            updated[lastIndex].metadata
          ) as AssistantMetadata | undefined
        }
      }
      return updated
    })
    setLoading(false)
    setLoadingLabel(null)
  }

  const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault()
    const hasText = input.trim().length > 0
    const hasAttachments = attachedFiles.length > 0
    if ((!hasText && !hasAttachments) || loading) return
    if (isSignedInPlanLocked) {
      setNoticeModal({
        title: 'Chat is locked',
        message: 'Your plan is currently paused. Your dashboard remains available in read-only mode and your documents stay safe. Resume your plan to continue chatting.',
      })
      return
    }
    if (!supabaseUser && typeof anonymousMessageLimit === 'number' && anonymousMessageLimit > 0) {
      const nextGuestMessageCount = messages.filter((msg) => msg.role === 'user').length + 1
      if (nextGuestMessageCount > anonymousMessageLimit) {
        setGuestSignupReason('limit')
        setShowGuestSignupModal(true)
        return
      }
    }
    if (hasAttachments && !supabaseUser) {
      setGuestSignupReason('upload')
      setShowGuestSignupModal(true)
      return
    }
    if (hasAttachments && !canUploadAttachments) {
      setNoticeModal({
        title: 'Document uploads are on Plus',
        message: 'Free Assistant includes chat and limited web search. Upgrade to an Assistant Plus or workspace plan to upload documents in chat.',
      })
      return
    }

    const rawInput = input
    setGuestUploadWarning(null)
    setLoading(true)
    setLoadingLabel(initialPendingStatusLabel)
    const displayMessage = hasText ? rawInput.trim() : 'Uploaded documents for review.'
    const filesToUpload = [...attachedFiles]
    const optimisticAttachments: AttachmentDisplay[] = filesToUpload.map((file) => ({
      name: file.name,
      size: file.size,
      mimeType: file.type || null,
      status: 'uploading'
    }))
    const optimisticMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const userMessage: Message = {
      id: optimisticMessageId,
      role: 'user',
      content: displayMessage,
      timestamp: new Date(),
      attachments: optimisticAttachments
    }

    setMessages((prev) => [...prev, userMessage])
    let targetConversationId =
      (conversationId || (typeof window !== 'undefined' ? localStorage.getItem('currentConversationId') : '') || '').trim()
    if (!targetConversationId) {
      targetConversationId = generateUUID()
      setConversationId(targetConversationId)
      if (typeof window !== 'undefined') {
        localStorage.setItem('currentConversationId', targetConversationId)
      }
    }
    setInput('')
    setAttachedFiles([])

    let uploadedAttachments: UploadedAttachment[] = []
    if (hasAttachments) {
      try {
        uploadedAttachments = await uploadAttachments(filesToUpload, canUseCaseContext ? caseId : null)
      } catch (error: any) {
        console.error('Attachment upload failed', error)
        const message = error instanceof Error ? error.message : 'Attachment upload failed. Please try again.'
        setNoticeModal({ title: 'Attachment upload failed', message })
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMessageId))
        setInput(rawInput)
        setAttachedFiles(filesToUpload)
        setLoading(false)
        setLoadingLabel(null)
        return
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === optimisticMessageId
            ? {
                ...msg,
                attachments: uploadedAttachments.map((file) => ({
                  ...file,
                  status: 'ready'
                }))
              }
            : msg
        )
      )
    } else {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === optimisticMessageId
            ? { ...msg, attachments: [] }
            : msg
        )
      )
    }

    const composedMessage = composeMessageWithAttachments(displayMessage, uploadedAttachments)
    const sessionStart = getOrInitSessionStart(supabaseUser?.id || 'anonymous')
    const sessionUserMessageCount =
      messages.filter((msg) => msg.role === 'user').length + 1

    let activeCaseOverride: string | null = null
    let streamedAssistantMessageId: string | null = null
    try {
      activeCaseOverride = canUseCaseContext ? pendingActiveCaseOverrideRef.current : null
      pendingActiveCaseOverrideRef.current = null
      const controller = new AbortController()
      chatRequestAbortRef.current = controller
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mymckenzie-stream': '1',
        },
        signal: controller.signal,
        body: JSON.stringify({ 
          message: composedMessage, 
          history: messages,
          userId: userId,
          conversationId: targetConversationId,
          activeCaseId: canUseCaseContext ? activeCaseOverride || undefined : undefined,
          attachments: uploadedAttachments,
          attachmentsOnly: !hasText && uploadedAttachments.length > 0,
          sessionMessageCount: sessionUserMessageCount,
          sessionStartedAt: sessionStart
        }),
      })

      const isStreamResponse = (response.headers.get('content-type') || '').includes('application/x-ndjson')
      if (isStreamResponse) {
        const assistantMessageId = `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        streamedAssistantMessageId = assistantMessageId
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isTyping: true,
          streamStatusLabel: null,
        }

        setMessages((prev) => [...prev, assistantMessage])
        streamRawTextRef.current = ''
        setActiveInlineStreamMessageId(assistantMessageId)
        typeStreamStatusById(assistantMessageId, initialPendingStatusLabel)

        if (!response.ok) {
          throw new Error('Streaming request failed')
        }

        try {
          await consumeAssistantStream(response, assistantMessageId)
        } finally {
          setActiveInlineStreamMessageId((current) => current === assistantMessageId ? null : current)
        }
        chatRequestAbortRef.current = null
        setLoading(false)
        setLoadingLabel(null)
        return
      }

      const raw = await response.text()
      const parsedData = (() => {
        try {
          return raw ? JSON.parse(raw) : null
        } catch {
          return null
        }
      })()
      const data = normalizeAssistantResponsePayload(parsedData) || parsedData

      if (!response.ok) {
        const serverMessage =
          data && typeof data.response === 'string' && data.response.trim()
            ? data.response.trim()
            : data && typeof data.message === 'string' && data.message.trim()
              ? data.message.trim()
              : data && typeof data.error === 'string' && data.error.trim()
                ? data.error.trim()
                : ''
        const details = serverMessage || 'Request failed. Please try again.'
        throw new Error(details)
      }

      if (!data || typeof data.response !== 'string' || !data.response.trim()) {
        throw new Error('API 200: Invalid response payload')
      }

      const assistantText = stripAssistantSourcesBlock(String(data.response || ''))
      const assistantMessageId = `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isTyping: true,
        metadata: data.metadata as AssistantMetadata | undefined
      }

      setMessages((prev) => [...prev, assistantMessage])
      typeMessageById(
        assistantText,
        assistantMessageId,
        () => showFloatingNotice(extractComposerNotice(data.metadata as AssistantMetadata | undefined))
      )
      chatRequestAbortRef.current = null
    } catch (error: any) {
      chatRequestAbortRef.current = null
      if (error?.name === 'AbortError') {
        if (activeCaseOverride) pendingActiveCaseOverrideRef.current = activeCaseOverride
        setActiveInlineStreamMessageId(null)
        setLoading(false)
        setLoadingLabel(null)
        return
      }
      if (activeCaseOverride) pendingActiveCaseOverrideRef.current = activeCaseOverride
      setActiveInlineStreamMessageId(null)
      setLoading(false)
      setLoadingLabel(null)
      const errorText = error instanceof Error && error.message
        ? error.message
        : 'MyMcKenzieCS is unavailable to help right now. Please try again later.'
      const targetMessageId = streamedAssistantMessageId || `assistant_error_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      replaceStreamedMessageWithTypedErrorById(targetMessageId, errorText)
    }
  }

  const containerStyle: CSSProperties = {
    width: '100%',
    background: 'transparent',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: '0',
    minHeight: dockComposerToPane ? 0 : '100%',
    height: dockComposerToPane ? '100%' : undefined,
    flex: dockComposerToPane ? '1 1 auto' : undefined,
  }

  const stageStyle: CSSProperties = {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    color: '#f1f5f9',
    fontFamily: 'inherit',
    minHeight: dockComposerToPane ? '100%' : 'calc(100vh - 88px)',
    height: dockComposerToPane ? '100%' : undefined,
    padding: '0',
    position: 'relative'
  }
  const messageContentMaxWidth = 'min(700px, 100%)'
  const messageLanePadding = '0'

  return (
    <>
      <div style={containerStyle}>
        <div style={stageStyle}>
        {/* Top spacer to match full-bleed layout */}
        <div style={{ height: '22px', display: 'flex', alignItems: 'center', padding: '0 max(10px, env(safe-area-inset-right)) 0 max(10px, env(safe-area-inset-left))' }} />


        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            minHeight: 0,
            width: '100%',
            alignItems: 'center',
            justifyContent: 'flex-end',
            position: 'relative',
            paddingBottom: dockComposerToPane ? 'clamp(18px, 4vh, 36px)' : 'clamp(180px, 28vh, 240px)',
          }}
        >
                  <div
                    style={{
                      width: '100%',
                      margin: '20px auto 0 auto',
                      boxSizing: 'border-box',
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: '120px',
                    }}
                  >
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="chat-message-scroll-container"
              style={{
                flex: 1,
                overflowY: 'auto',
                minHeight: 0,
                width: '100%',
                paddingLeft: 0,
                paddingRight: 0,
                scrollbarGutter: 'stable',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: messageContentMaxWidth,
                  minHeight: '100%',
                  margin: '0 auto',
                  padding: messageLanePadding,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
            {loadingOlderHistory && messages.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '8px 0 12px',
                }}
              >
                <StatusIndicator label="Loading older messages" compact />
              </div>
            )}
            {messages.length === 0 && !isConversationBootstrapping && (
              <ChatEmptyState authLoaded={authLoaded} hasUser={Boolean(supabaseUser)} />
            )}

            <ChatMessageList
              messages={messages}
              feedbackState={feedbackState}
              parseAssistantResponse={parseAssistantResponse}
              renderMessageContent={renderMessageContent}
              onCopyMessage={handleCopy}
              formatAssistantResponse={formatAssistantResponse}
              onRegenerate={(messageIndex) => {
                void handleRegenerate(messageIndex)
              }}
              onFeedback={(messageIndex, type, content) => {
                void handleFeedback(messageIndex, type, content)
              }}
              loading={loading && !activeInlineStreamMessageId}
              loadingLabel={loadingLabel}
              messagesEndRef={messagesEndRef}
              StatusIndicatorComponent={StatusIndicator}
              scrollContainerRef={scrollContainerRef}
              fullWidth={useFullPaneWidth}
            />
              </div>
            </div>
          </div>
          {(showScrollToBottomButton || showScrollToBottomButtonByWindow) && messages.length > 0 && (
            <button
              type="button"
              onClick={jumpToLatest}
              aria-label="Scroll to bottom"
              title="Scroll to bottom"
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                bottom: dockComposerToPane ? '24px' : 'clamp(130px, 20vh, 176px)',
                width: '38px',
                height: '38px',
                borderRadius: '999px',
                border: '1px solid rgba(165,180,252,0.45)',
                background: 'linear-gradient(135deg, #1e293b 0%, #312e81 100%)',
                color: '#f4f4f5',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 120,
                boxShadow: '0 8px 24px rgba(30, 41, 59, 0.45)',
                backdropFilter: 'blur(4px)'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="m7 14 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

          <ChatComposer
            onSubmit={handleSubmit}
            showGuestSignupModal={showGuestSignupModal}
            onCloseGuestSignupModal={() => setShowGuestSignupModal(false)}
            guestSignupReason={guestSignupReason}
            guestHomeHref={guestHomeHref}
            anonymousMessageLimit={anonymousMessageLimit}
            attachedFiles={attachedFiles}
            onRemoveFile={handleRemoveFile}
            guestUploadWarning={guestUploadWarning}
            textareaRef={textareaRef}
            input={input}
            onInputChange={handleInputChange}
            onInputKeyDown={handleInputKeyDown}
            loading={loading}
            fileInputRef={fileInputRef}
            onFileChange={handleFileChange}
            onAttachClick={handleAttachClick}
            hasSupabaseUser={canUploadAttachments}
            onStopGeneration={handleStopGeneration}
            canSubmit={!isSignedInPlanLocked && (input.trim().length > 0 || attachedFiles.length > 0)}
            showWordLimitWarning={showWordLimitWarning}
            isPlanLocked={isSignedInPlanLocked}
            planLockMessage="Plan paused: chat is locked. Your documents remain safe and available in read-only mode."
            dockToPane={dockComposerToPane}
            paneWidth={paneWidth}
          />

        {floatingNotice && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: 'clamp(108px, 16vh, 146px)',
              width: 'min(92%, 540px)',
              padding: '12px 16px',
              borderRadius: '16px',
              border: '1px solid rgba(251, 191, 36, 0.45)',
              background: 'linear-gradient(135deg, rgba(69, 26, 3, 0.96) 0%, rgba(120, 53, 15, 0.94) 100%)',
              color: '#fef3c7',
              boxShadow: '0 18px 48px rgba(15, 23, 42, 0.35)',
              backdropFilter: 'blur(10px)',
              zIndex: 140,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: '0.95rem', lineHeight: 1.45 }}>{floatingNotice}</span>
            <button
              type="button"
              onClick={() => {
                if (floatingNoticeTimeoutRef.current) {
                  clearTimeout(floatingNoticeTimeoutRef.current)
                  floatingNoticeTimeoutRef.current = null
                }
                setFloatingNotice(null)
              }}
              aria-label="Dismiss notice"
              style={{
                flex: '0 0 auto',
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '1rem',
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        )}

        <ReportIssueModal
          isOpen={showReportModal}
          issue={reportIssue}
          problem={reportProblem}
          onIssueChange={setReportIssue}
          onProblemChange={setReportProblem}
          onCancel={handleCloseReportModal}
          onSubmit={handleSubmitReport}
        />
        <NoticeModal notice={noticeModal} onClose={() => setNoticeModal(null)} />
        <style jsx>{`
          .chat-message-scroll-container::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        </div>
      </div>
    </>
  );
}
