'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { MouseEvent } from 'react'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import AppTopbar from '@/components/layout/AppTopbar'
import ChatConversationHistory from '@/components/chatbot/ChatConversationHistory'
import DeleteConversationModal from '@/components/chatbot/DeleteConversationModal'

interface Conversation {
  id: string
  title: string
  timestamp: string
  caseId?: string
}

const GUEST_MESSAGE_LIMIT = 10
const PREMIUM_MESSAGE_LIMIT_PER_THREAD = 25
const PREMIUM_PLUS_MESSAGE_LIMIT_PER_THREAD = 30

const threadLimitForPlan = (normalizedPlan: string): number => {
  if (
    normalizedPlan.includes('premium +') ||
    normalizedPlan.includes('premium plus') ||
    normalizedPlan.includes('plus') ||
    normalizedPlan.includes('premium pro')
  ) {
    return PREMIUM_PLUS_MESSAGE_LIMIT_PER_THREAD
  }
  if (normalizedPlan.includes('basic') || normalizedPlan.includes('essential') || normalizedPlan.includes('premium cheap')) {
    return 20
  }
  return PREMIUM_MESSAGE_LIMIT_PER_THREAD
}

export default function ChatbotNavbar({ onPlanLoaded }: { onPlanLoaded?: (loaded: boolean) => void } = {}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [plan, setPlan] = useState<string | null>(null)
  const [planLoaded, setPlanLoaded] = useState(false)
  const [threadMessageCount, setThreadMessageCount] = useState(0)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [planInfo, setPlanInfo] = useState<any>(null)
  const [planInfoLoaded, setPlanInfoLoaded] = useState(false)
  const [cases, setCases] = useState<any[]>([])
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [uid, setUid] = useState<string | null>(null)
  const [guestMessageCount, setGuestMessageCount] = useState(0)
  const [deleteTargetConversationId, setDeleteTargetConversationId] = useState<string | null>(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeletingConversation, setIsDeletingConversation] = useState(false)
  const [deleteConversationError, setDeleteConversationError] = useState<string | null>(null)

  const threadCountRef = useRef(0)
  const threadCountCacheRef = useRef<Record<string, number>>({})
  const currentConversationIdRef = useRef<string | null>(null)

  useEffect(() => {
    threadCountRef.current = threadMessageCount
  }, [threadMessageCount])

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId
  }, [currentConversationId])

  useEffect(() => {
    setPlanInfoLoaded(false)
    fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPlanInfo(data))
      .catch(() => setPlanInfo(null))
      .finally(() => setPlanInfoLoaded(true))
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => {
      setUid(data?.user?.id || null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user?.id || null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('selectedCaseId') : null
    if (stored) setActiveCaseId(stored)
  }, [])

  useEffect(() => {
    const handleActiveCaseChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ caseId?: string | null }>).detail
      const nextCaseId = detail?.caseId?.trim()
      if (!nextCaseId) return
      setActiveCaseId(nextCaseId)
    }
    window.addEventListener('activeCaseChanged', handleActiveCaseChanged as EventListener)
    return () => window.removeEventListener('activeCaseChanged', handleActiveCaseChanged as EventListener)
  }, [])

  useEffect(() => {
    const fetchCases = async () => {
      if (!uid) {
        setCases([])
        return
      }
      try {
        const res = await fetch('/api/cases')
        const data = await res.json()
        setCases(Array.isArray(data.cases) ? data.cases : [])
      } catch (err) {
        console.error('Failed to fetch cases', err)
      }
    }
    void fetchCases()
  }, [uid])

  const activeCase = cases.find((c) => c.id === activeCaseId) || null
  const workingOnLabel = activeCase?.title?.trim() || activeCase?.case_type?.trim() || 'General guidance'

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let cancelled = false

    const loadPlan = async (userId: string | null) => {
      if (!userId) {
        setIsLoggedIn(false)
        setPlan(null)
        setPlanLoaded(true)
        onPlanLoaded?.(true)
        return
      }

      setIsLoggedIn(true)
      try {
        const response = await fetch('/api/user/plan', {
          credentials: 'include',
          cache: 'no-store'
        })
        if (!response.ok) throw new Error('Failed to fetch plan')
        const data = await response.json()
        if (cancelled) return
        setPlan((data.plan || '').toString())
      } catch (_error) {
        if (!cancelled) {
          setPlan('')
        }
      }
      if (!cancelled) {
        setPlanLoaded(true)
        onPlanLoaded?.(true)
      }
    }

    supabase.auth.getSession().then((res: any) => {
      if (cancelled) return
      const session = res?.data?.session
      const userId = session?.user?.id || null
      void loadPlan(userId)
    })

    const listener = supabase.auth.onAuthStateChange((...args: any[]) => {
      if (cancelled) return
      const authEvent = String(args[0] || '')
      const session = args[1]
      const userId = session?.user?.id || null
      if (!userId && authEvent !== 'SIGNED_OUT') return
      void loadPlan(userId)
    })

    return () => {
      cancelled = true
      listener?.data?.subscription?.unsubscribe?.()
    }
  }, [onPlanLoaded])

  const normalizedPlan = (plan || '').toLowerCase()
  const threadMessageLimit = threadLimitForPlan(normalizedPlan)
  const shouldShowHistory = planLoaded && isLoggedIn

  const buildThreadCountStorageKey = useCallback(
    (conversationId: string) => `threadCount:${conversationId}`,
    []
  )

  const readPersistedThreadCount = useCallback((conversationId: string): number | null => {
    if (typeof window === 'undefined' || !conversationId) return null
    const raw = localStorage.getItem(buildThreadCountStorageKey(conversationId))
    if (!raw) return null
    const parsed = Number.parseInt(raw, 10)
    return Number.isNaN(parsed) ? null : Math.max(parsed, 0)
  }, [buildThreadCountStorageKey])

  const writePersistedThreadCount = useCallback((conversationId: string, count: number) => {
    if (typeof window === 'undefined' || !conversationId) return
    const bounded = Math.max(0, Math.min(count, threadMessageLimit))
    localStorage.setItem(buildThreadCountStorageKey(conversationId), String(bounded))
  }, [buildThreadCountStorageKey, threadMessageLimit])

  const readKnownThreadCount = useCallback((conversationId: string): number | null => {
    if (!conversationId) return null
    const hasMemory = Object.prototype.hasOwnProperty.call(threadCountCacheRef.current, conversationId)
    const memoryValue = hasMemory ? threadCountCacheRef.current[conversationId] : null
    const persistedValue = readPersistedThreadCount(conversationId)
    if (typeof memoryValue === 'number' && typeof persistedValue === 'number') {
      return Math.max(memoryValue, persistedValue)
    }
    if (typeof memoryValue === 'number') return memoryValue
    if (typeof persistedValue === 'number') return persistedValue
    return null
  }, [readPersistedThreadCount])

  const fetchThreadMessageCount = useCallback(async (
    conversationIdOverride?: string | null,
    options?: { minimumCount?: number }
  ) => {
    const targetConversationId = (conversationIdOverride || currentConversationId || '').trim()
    if (!planLoaded || !targetConversationId) return
    try {
      const response = await fetch(
        `/api/message-count?conversationId=${encodeURIComponent(targetConversationId)}`,
        { credentials: 'include', cache: 'no-store' }
      )
      if (response.ok) {
        const data = await response.json()
        if (typeof data?.count === 'number') {
          const boundedServerCount = Math.min(data.count, threadMessageLimit)
          const cached = readKnownThreadCount(targetConversationId)
          const providedMinimum =
            typeof options?.minimumCount === 'number'
              ? Math.min(Math.max(options.minimumCount, 0), threadMessageLimit)
              : null
          const boundedMinimum = Math.max(cached ?? 0, providedMinimum ?? 0)
          const resolvedCount = Math.max(boundedServerCount, boundedMinimum)
          threadCountCacheRef.current[targetConversationId] = resolvedCount
          writePersistedThreadCount(targetConversationId, resolvedCount)
          if ((currentConversationIdRef.current || '').trim() === targetConversationId) {
            setThreadMessageCount(resolvedCount)
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch thread message count:', error)
    }
  }, [
    planLoaded,
    currentConversationId,
    threadMessageLimit,
    readKnownThreadCount,
    writePersistedThreadCount
  ])

  useEffect(() => {
    const targetConversationId = (currentConversationId || '').trim()
    if (!targetConversationId) return
    const cached = readKnownThreadCount(targetConversationId)
    if (cached !== null) {
      setThreadMessageCount(Math.max(0, Math.min(cached, threadMessageLimit)))
    }
    void fetchThreadMessageCount(targetConversationId, {
      minimumCount: cached ?? 0
    })
  }, [fetchThreadMessageCount, currentConversationId, threadMessageLimit, readKnownThreadCount])

  useEffect(() => {
    const handleCounterRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string; delta?: number; count?: number }>).detail
      const nextConversationId = (detail?.conversationId || '').trim()
      const delta = typeof detail?.delta === 'number' ? detail.delta : 0
      const absoluteCount = typeof detail?.count === 'number' ? detail.count : null

      if (!isLoggedIn) {
        if (absoluteCount !== null) {
          setGuestMessageCount(Math.max(0, Math.min(absoluteCount, GUEST_MESSAGE_LIMIT)))
        } else if (delta !== 0) {
          setGuestMessageCount((prev) => Math.max(0, Math.min(prev + delta, GUEST_MESSAGE_LIMIT)))
        }
        return
      }

      if (absoluteCount !== null) {
        const cacheKey = (nextConversationId || currentConversationId || '').trim()
        const bounded = Math.max(0, Math.min(absoluteCount, threadMessageLimit))
        const cached = cacheKey ? readKnownThreadCount(cacheKey) : null
        const resolved = Math.max(bounded, cached ?? 0)
        if (nextConversationId) setCurrentConversationId(nextConversationId)
        if (cacheKey) {
          threadCountCacheRef.current[cacheKey] = resolved
          writePersistedThreadCount(cacheKey, resolved)
        }
        if (!cacheKey || cacheKey === (currentConversationIdRef.current || '').trim() || cacheKey === nextConversationId) {
          setThreadMessageCount(resolved)
        }
        return
      }

      if (delta !== 0) {
        const cacheKey = (nextConversationId || currentConversationId || '').trim()
        if (!cacheKey) return
        const currentKey = (currentConversationIdRef.current || '').trim()
        const baseline = cacheKey === currentKey ? threadCountRef.current : (readKnownThreadCount(cacheKey) ?? 0)
        const bounded = Math.max(0, Math.min(baseline + delta, threadMessageLimit))
        threadCountCacheRef.current[cacheKey] = bounded
        writePersistedThreadCount(cacheKey, bounded)
        setThreadMessageCount(bounded)
        if (nextConversationId) setCurrentConversationId(nextConversationId)
        return
      }

      if (nextConversationId) {
        setCurrentConversationId(nextConversationId)
        const minimumCount = readKnownThreadCount(nextConversationId) ?? 0
        window.setTimeout(() => {
          void fetchThreadMessageCount(nextConversationId, { minimumCount })
        }, 450)
        return
      }
      void fetchThreadMessageCount()
    }

    // Event name kept for compatibility with ChatInterface dispatcher.
    window.addEventListener('premiumThreadMessageCountChanged', handleCounterRefresh as EventListener)
    return () => window.removeEventListener('premiumThreadMessageCountChanged', handleCounterRefresh as EventListener)
  }, [
    fetchThreadMessageCount,
    currentConversationId,
    threadMessageLimit,
    readKnownThreadCount,
    writePersistedThreadCount,
    isLoggedIn
  ])

  useEffect(() => {
    const handleConversationChange = (event: Event) => {
      const conversationId = (event as CustomEvent<string>).detail
      setCurrentConversationId(conversationId)
      const cached = readKnownThreadCount(conversationId)
      if (cached !== null) {
        setThreadMessageCount(Math.max(0, Math.min(cached, threadMessageLimit)))
      } else {
        setThreadMessageCount(0)
      }
    }
    window.addEventListener('currentConversationIdChanged', handleConversationChange as EventListener)
    return () => window.removeEventListener('currentConversationIdChanged', handleConversationChange as EventListener)
  }, [threadMessageLimit, readKnownThreadCount])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('conversationId')
    const fromStorage = localStorage.getItem('currentConversationId')
    const initialConversationId = (fromUrl || fromStorage || '').trim()
    if (initialConversationId) {
      setCurrentConversationId(initialConversationId)
      const cached = readKnownThreadCount(initialConversationId)
      if (cached !== null) {
        setThreadMessageCount(Math.max(0, Math.min(cached, threadMessageLimit)))
      } else {
        setThreadMessageCount(0)
      }
    }
  }, [threadMessageLimit, readKnownThreadCount])

  useEffect(() => {
    if (isLoggedIn) return
    fetch('/api/message-count', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (typeof data?.count === 'number') {
          setGuestMessageCount(Math.max(0, Math.min(data.count, GUEST_MESSAGE_LIMIT)))
        }
      })
      .catch(() => undefined)
  }, [isLoggedIn])

  const loadChatHistory = async () => {
    setLoadingHistory(true)
    try {
      const response = await fetch('/api/chat-history')
      const data = await response.json()
      if (response.ok) {
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error('Failed to load chat history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    if (isSidebarOpen && shouldShowHistory) {
      void loadChatHistory()
    }
  }, [isSidebarOpen, shouldShowHistory])

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate)
    if (Number.isNaN(date.getTime())) return 'Unknown date'
    const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    return `${day} ${time}`
  }

  const openConversation = (conversationId: string) => {
    window.location.href = `/chatbot?conversationId=${conversationId}`
  }

  const closeDeleteModal = () => {
    if (isDeletingConversation) return
    setIsDeleteModalOpen(false)
    setDeleteTargetConversationId(null)
    setDeleteConversationError(null)
  }

  const handleDeleteConversation = (conversationId: string, e: MouseEvent) => {
    e.stopPropagation()
    setDeleteTargetConversationId(conversationId)
    setDeleteConversationError(null)
    setIsDeleteModalOpen(true)
  }

  const confirmDeleteConversation = async () => {
    if (!deleteTargetConversationId || isDeletingConversation) return
    setIsDeletingConversation(true)
    setDeleteConversationError(null)
    try {
      const response = await fetch('/api/chat-history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: deleteTargetConversationId })
      })

      if (response.ok) {
        setConversations((prev) => prev.filter((conv) => conv.id !== deleteTargetConversationId))
        setIsDeleteModalOpen(false)
        setDeleteTargetConversationId(null)
      } else {
        setDeleteConversationError('Failed to delete conversation. Please try again.')
      }
    } catch (error) {
      console.error('Delete failed:', error)
      setDeleteConversationError('Failed to delete conversation. Please try again.')
    } finally {
      setIsDeletingConversation(false)
    }
  }

  return (
    <>
      <AppTopbar
        left={(
          !planLoaded ? null : !isLoggedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(236, 72, 153, 0.12)',
                  paddingLeft: '10px',
                  paddingRight: '12px',
                  paddingTop: '6px',
                  paddingBottom: '6px',
                  borderRadius: '8px',
                  border: '1px solid rgba(236, 72, 153, 0.25)'
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Guest:
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: guestMessageCount >= GUEST_MESSAGE_LIMIT ? '#ef4444' : '#ec4899' }}>
                  {guestMessageCount}/{GUEST_MESSAGE_LIMIT}
                </span>
              </div>
            </div>
          ) : planLoaded && isLoggedIn && currentConversationId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(139, 92, 246, 0.15)',
                  paddingLeft: '10px',
                  paddingRight: '12px',
                  paddingTop: '6px',
                  paddingBottom: '6px',
                  borderRadius: '8px',
                  border: '1px solid rgba(139, 92, 246, 0.3)'
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Messages:
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color:
                      threadMessageCount >= threadMessageLimit
                        ? '#ef4444'
                        : threadMessageCount >= threadMessageLimit * 0.8
                          ? '#f97316'
                          : '#8b5cf6'
                  }}
                >
                  {threadMessageCount}/{threadMessageLimit}
                </span>
              </div>
            </div>
          ) : null
        )}
        center={null}
        right={(
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isLoggedIn && (
              <button
                type="button"
                className="app-icon-button"
                aria-label="Open chat sidebar"
                onClick={() => setIsSidebarOpen(true)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
            {planLoaded && (
              isLoggedIn ? (
                <Link href="/dashboard" className="app-button-secondary">
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link href="/pricing" style={{ color: '#fff', fontWeight: 700, fontSize: '1.2rem', textDecoration: 'underline', marginRight: '8px' }}>Register</Link>
                  <Link href="/auth/signin" style={{ color: '#fff', fontWeight: 600, fontSize: '1.2rem', textDecoration: 'underline' }}>Sign in</Link>
                </>
              )
            )}
          </div>
        )}
        className="chatbot-fixed"
      />

      {isLoggedIn && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: isSidebarOpen ? 0 : '-350px',
            width: '320px',
            height: '100vh',
            background: '#270427',
            boxShadow: isSidebarOpen ? '-2px 0 10px rgba(0,0,0,0.5)' : 'none',
            transition: 'right 0.3s ease',
            zIndex: 2000,
            color: 'white',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            style={{
              padding: '20px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Chat Sidebar</h3>
            <button
              onClick={() => setIsSidebarOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cases.length > 0 && activeCase && (
              <div
                style={{
                  marginBottom: '10px',
                  padding: '14px',
                  background: 'linear-gradient(135deg, rgba(15,23,42,0.6) 0%, rgba(30,41,59,0.8) 100%)',
                  borderRadius: '10px',
                  border: '1.5px solid rgba(148,163,184,0.2)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px', color: '#e2e8f0', letterSpacing: '0.4px' }}>
                  Active case
                </div>
                <div style={{ fontSize: '13px', color: '#e2e8f0' }}>{activeCase.title || 'Untitled case'}</div>
                {activeCase.case_type && (
                  <div style={{ fontSize: '12px', color: 'rgba(226,232,240,0.7)', marginTop: '4px' }}>
                    {activeCase.case_type}
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                marginBottom: '10px',
                padding: '14px',
                background: 'linear-gradient(135deg, #1e293b 0%, #312e81 100%)',
                borderRadius: '10px',
                border: '1.5px solid rgba(139,92,246,0.18)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px', color: '#a5b4fc', letterSpacing: '0.5px' }}>
                Active Plan
              </div>
              {planInfo ? (
                <>
                  <div><b>Plan:</b> {planInfo.plan || plan || 'No plan'}</div>
                  {planInfo.nextBillingDate && <div><b>Renews:</b> {formatDate(planInfo.nextBillingDate)}</div>}
                  <div><b>Status:</b> {planInfo.planStatus || 'Active'}</div>
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(139,92,246,0.25)' }}>
                    <div style={{ fontSize: '12px', color: 'rgba(196,181,253,0.95)', marginBottom: '4px', letterSpacing: '0.3px' }}>
                      Working on
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        color: '#ffffff',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title={workingOnLabel}
                    >
                      {workingOnLabel}
                    </div>
                  </div>
                </>
              ) : (
                <div>{planInfoLoaded ? 'Plan info unavailable.' : 'Loading plan info...'}</div>
              )}
            </div>

            <button
              onClick={() => (window.location.href = '/chatbot?new=true')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '15px 20px',
                background: hoveredItem === 'new' ? 'rgba(123, 43, 123, 0.28)' : 'rgba(123, 43, 123, 0.20)',
                color: 'white',
                border: hoveredItem === 'new' ? '1px solid rgba(200,150,230,0.35)' : '1px solid rgba(200,150,230,0.25)',
                borderRadius: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: hoveredItem === 'new' ? '0 4px 12px rgba(103, 25, 103, 0.35)' : '0 2px 6px rgba(0,0,0,0.2)',
                transform: hoveredItem === 'new' ? 'translateY(-1px)' : 'none',
                transition: 'all 0.2s ease',
                fontSize: '16px'
              }}
              onMouseEnter={() => setHoveredItem('new')}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <span>➕</span> New Chat
            </button>

            {shouldShowHistory && (
              <ChatConversationHistory
                loadingHistory={loadingHistory}
                conversations={conversations}
                formatDate={formatDate}
                onOpenConversation={openConversation}
                onDeleteConversation={handleDeleteConversation}
              />
            )}
          </div>
        </div>
      )}

      {isLoggedIn && isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.4)',
            zIndex: 1999
          }}
        />
      )}

      <DeleteConversationModal
        isOpen={isDeleteModalOpen}
        isDeleting={isDeletingConversation}
        error={deleteConversationError}
        onCancel={closeDeleteModal}
        onConfirm={confirmDeleteConversation}
      />
    </>
  )
}
