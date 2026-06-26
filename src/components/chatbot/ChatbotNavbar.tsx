'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import type { MouseEvent } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import AppTopbar from '@/components/layout/AppTopbar'
import ChatConversationHistory from '@/components/chatbot/ChatConversationHistory'
import DeleteConversationModal from '@/components/chatbot/DeleteConversationModal'
import { hasCaseProfileAccess } from '@/lib/plans/access'
import { isTrialingStripeStatus } from '@/lib/payments/subscription-status'
import { getAppMarketFromPathname, getAppRouteForMarket } from '@/lib/markets/app-routes'
import { getConversationStorageKey } from '@/lib/chat/conversation-storage'
import { buildMarketAwareAuthHref, getPublicMarket, getPublicRouteForMarket } from '@/lib/markets/public-routes'

interface Conversation {
  id: string
  title: string
  timestamp: string
  caseId?: string
}

type CaseSummary = {
  id: string
  title?: string | null
  case_type?: string | null
}

type ChatbotNavbarProps = {
  onPlanLoaded?: (loaded: boolean) => void
  initialPlanInfo?: { plan?: string | null; planStatus?: string | null; paidAccess?: boolean } | null
  initialIsLoggedIn?: boolean
}

export default function ChatbotNavbar({
  onPlanLoaded,
  initialPlanInfo = null,
  initialIsLoggedIn = false,
}: ChatbotNavbarProps = {}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(initialIsLoggedIn))
  const [plan, setPlan] = useState<string | null>(
    initialPlanInfo?.plan ? initialPlanInfo.plan.toString() : null
  )
  const [planLoaded, setPlanLoaded] = useState(Boolean(initialIsLoggedIn))
  const [planInfo, setPlanInfo] = useState<any>(initialPlanInfo)
  const [planInfoLoaded, setPlanInfoLoaded] = useState(Boolean(initialPlanInfo))
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [uid, setUid] = useState<string | null>(null)
  const [deleteTargetConversationId, setDeleteTargetConversationId] = useState<string | null>(null)
  const [deleteMode, setDeleteMode] = useState<'single' | 'all'>('single')
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeletingConversation, setIsDeletingConversation] = useState(false)
  const [deleteConversationError, setDeleteConversationError] = useState<string | null>(null)
  const [isCaseProfileModalOpen, setIsCaseProfileModalOpen] = useState(false)
  const [caseProfileId, setCaseProfileId] = useState<string | null>(null)
  const [caseTitle, setCaseTitle] = useState('')
  const [caseNumber, setCaseNumber] = useState('')
  const [hearingDate, setHearingDate] = useState('')
  const [caseSummary, setCaseSummary] = useState('')
  const [isCaseProfileLoading, setIsCaseProfileLoading] = useState(false)
  const [isCaseProfileSaving, setIsCaseProfileSaving] = useState(false)
  const [isCaseProfileDeleting, setIsCaseProfileDeleting] = useState(false)
  const [caseProfileStatus, setCaseProfileStatus] = useState<string | null>(null)
  const [caseProfileError, setCaseProfileError] = useState<string | null>(null)

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
      const user = data?.user || null
      setUid(user?.id || null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null
      setUid(user?.id || null)
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
      if (detail?.caseId === null) {
        setActiveCaseId(null)
        return
      }
      const nextCaseId = detail?.caseId?.trim()
      if (!nextCaseId) return
      setActiveCaseId(nextCaseId)
    }
    window.addEventListener('activeCaseChanged', handleActiveCaseChanged as EventListener)
    return () => window.removeEventListener('activeCaseChanged', handleActiveCaseChanged as EventListener)
  }, [])

  const activeCase = cases.find((c) => c.id === activeCaseId) || null
  const workingOnLabel = activeCase?.title?.trim() || activeCase?.case_type?.trim() || 'General guidance'
  const caseProfilePlanLabel = (planInfo?.plan || plan || '').toString()
  const canUseCaseProfile = planLoaded && isLoggedIn && hasCaseProfileAccess(caseProfilePlanLabel)
  const publicMarket = getPublicMarket({
    pathname,
    explicitMarket: searchParams?.get('market'),
    countryCode: planInfo?.publicMarket,
  })
  const appMarket = getAppMarketFromPathname(pathname)
  const pricingHref = getPublicRouteForMarket('/pricing', publicMarket)
  const signInHref = buildMarketAwareAuthHref('/auth/signin', publicMarket)
  const dashboardHref = getAppRouteForMarket('/dashboard', appMarket)
  const chatbotHref = getAppRouteForMarket('/chatbot', appMarket)

  useEffect(() => {
    const fetchCases = async () => {
      if (!uid || !canUseCaseProfile) {
        setCases([])
        return
      }
      try {
        const res = await fetch('/api/cases?limit=200&offset=0')
        const data = await res.json()
        setCases(Array.isArray(data.cases) ? data.cases : [])
      } catch (err) {
        console.error('Failed to fetch cases', err)
      }
    }
    void fetchCases()
  }, [uid, canUseCaseProfile])

  useEffect(() => {
    if (canUseCaseProfile) return
    setCases([])
    setActiveCaseId(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('selectedCaseId')
      window.dispatchEvent(new CustomEvent('activeCaseChanged', { detail: { caseId: null } }))
    }
  }, [canUseCaseProfile])

  useEffect(() => {
    if (!planLoaded) return
    onPlanLoaded?.(true)
  }, [planLoaded, onPlanLoaded])

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

  const shouldShowHistory = planLoaded && isLoggedIn

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
    const next = new URL(chatbotHref, 'https://app.local')
    next.searchParams.set('conversationId', conversationId)
    window.location.href = `${next.pathname}${next.search}${next.hash}`
  }

  const startFreshConversation = () => {
    const conversationStorageKey = getConversationStorageKey(typeof window !== 'undefined' ? localStorage.getItem('userId') : '')
    const next = new URL(chatbotHref, 'https://app.local')
    const nextHref = `${next.pathname}${next.search}${next.hash}`
    localStorage.removeItem(conversationStorageKey)
    window.dispatchEvent(
      new CustomEvent('chatFreshConversationRequested', {
        detail: { homeHref: nextHref },
      })
    )
    window.history.replaceState({}, '', nextHref)
    setIsSidebarOpen(false)
  }

  const closeDeleteModal = () => {
    if (isDeletingConversation) return
    setIsDeleteModalOpen(false)
    setDeleteTargetConversationId(null)
    setDeleteMode('single')
    setDeleteConversationError(null)
  }

  const handleDeleteConversation = (conversationId: string, e: MouseEvent) => {
    e.stopPropagation()
    setDeleteTargetConversationId(conversationId)
    setDeleteMode('single')
    setDeleteConversationError(null)
    setIsDeleteModalOpen(true)
  }

  const handleDeleteAllConversations = () => {
    setDeleteTargetConversationId(null)
    setDeleteMode('all')
    setDeleteConversationError(null)
    setIsDeleteModalOpen(true)
  }

  const confirmDeleteConversation = async () => {
    if ((deleteMode === 'single' && !deleteTargetConversationId) || isDeletingConversation) return
    setIsDeletingConversation(true)
    setDeleteConversationError(null)
    try {
      const conversationStorageKey = getConversationStorageKey(typeof window !== 'undefined' ? localStorage.getItem('userId') : '')
      const activeConversationId = new URLSearchParams(window.location.search).get('conversationId') || ''
      const storedConversationId = localStorage.getItem(conversationStorageKey) || ''
      const response = await fetch('/api/chat-history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          deleteMode === 'all'
            ? { deleteAll: true, activeConversationId: activeConversationId || storedConversationId }
            : { conversationId: deleteTargetConversationId }
        )
      })

      if (response.ok) {
        if (deleteMode === 'all') {
          const next = new URL(chatbotHref, 'https://app.local')
          const nextHref = `${next.pathname}${next.search}${next.hash}`
          localStorage.removeItem(conversationStorageKey)
          window.history.replaceState({}, '', nextHref)
          window.dispatchEvent(
            new CustomEvent('chatFreshConversationRequested', {
              detail: { homeHref: nextHref },
            })
          )
          setConversations([])
          setIsDeleteModalOpen(false)
          setDeleteTargetConversationId(null)
          setDeleteMode('single')
          return
        }
        const deletedConversationId = deleteTargetConversationId
        const deletedActiveConversation =
          activeConversationId === deletedConversationId || storedConversationId === deletedConversationId

        if (deletedActiveConversation) {
          localStorage.removeItem(conversationStorageKey)
          const next = new URL(chatbotHref, 'https://app.local')
          window.history.replaceState({}, '', `${next.pathname}${next.search}${next.hash}`)
        }

        window.dispatchEvent(
          new CustomEvent('chatConversationDeleted', {
            detail: {
              conversationId: deletedConversationId,
              wasActive: deletedActiveConversation,
            },
          })
        )

        setConversations((prev) => prev.filter((conv) => conv.id !== deleteTargetConversationId))
        setIsDeleteModalOpen(false)
        setDeleteTargetConversationId(null)
        setDeleteMode('single')
      } else {
        setDeleteConversationError(
          deleteMode === 'all'
            ? 'Failed to delete conversations. Please try again.'
            : 'Failed to delete conversation. Please try again.'
        )
      }
    } catch (error) {
      console.error('Delete failed:', error)
      setDeleteConversationError(
        deleteMode === 'all'
          ? 'Failed to delete conversations. Please try again.'
          : 'Failed to delete conversation. Please try again.'
      )
    } finally {
      setIsDeletingConversation(false)
    }
  }

  const clearCaseProfileForm = () => {
    setCaseProfileId(null)
    setCaseTitle('')
    setCaseNumber('')
    setHearingDate('')
    setCaseSummary('')
  }

  const publishActiveCaseChanged = (nextCaseId: string | null) => {
    if (typeof window === 'undefined') return
    if (nextCaseId) {
      localStorage.setItem('selectedCaseId', nextCaseId)
    } else {
      localStorage.removeItem('selectedCaseId')
    }
    window.dispatchEvent(new CustomEvent('activeCaseChanged', { detail: { caseId: nextCaseId } }))
  }

  const loadCaseProfile = async () => {
    setIsCaseProfileLoading(true)
    setCaseProfileError(null)
    setCaseProfileStatus(null)
    try {
      const response = await fetch('/api/user/case-details', { credentials: 'include' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 403) {
          setCaseProfileError('Case profile is available on Premium and Premium + plans.')
          clearCaseProfileForm()
          return
        }
        setCaseProfileError(typeof data?.error === 'string' ? data.error : 'Failed to load case profile.')
        return
      }

      const item = data?.case
      if (!item) {
        clearCaseProfileForm()
        return
      }

      setCaseProfileId(typeof item.id === 'string' ? item.id : null)
      setCaseTitle(typeof item.title === 'string' && item.title !== 'Untitled case' ? item.title : '')
      setCaseNumber(typeof item.external_id === 'string' ? item.external_id : '')
      setHearingDate(typeof item.case_type === 'string' ? item.case_type : '')
      setCaseSummary(typeof item.description === 'string' ? item.description : '')
    } catch {
      setCaseProfileError('Failed to load case profile.')
    } finally {
      setIsCaseProfileLoading(false)
    }
  }

  const openCaseProfileModal = async () => {
    if (!canUseCaseProfile) return
    setIsCaseProfileModalOpen(true)
    await loadCaseProfile()
  }

  useEffect(() => {
    if (!canUseCaseProfile && isCaseProfileModalOpen) {
      setIsCaseProfileModalOpen(false)
    }
  }, [canUseCaseProfile, isCaseProfileModalOpen])

  const handleSaveCaseProfile = async () => {
    if (isCaseProfileSaving || isCaseProfileDeleting) return
    setIsCaseProfileSaving(true)
    setCaseProfileError(null)
    setCaseProfileStatus(null)
    try {
      const hasAnyInput = Boolean(caseNumber.trim() || hearingDate.trim() || caseTitle.trim() || caseSummary.trim())
      if (!hasAnyInput) {
        const deleteResponse = await fetch('/api/user/case-details', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ caseId: caseProfileId }),
        })
        const deleteData = await deleteResponse.json().catch(() => ({}))
        if (!deleteResponse.ok) {
          setCaseProfileError(typeof deleteData?.error === 'string' ? deleteData.error : 'Failed to clear case profile.')
          return
        }
        clearCaseProfileForm()
        setActiveCaseId(null)
        publishActiveCaseChanged(null)
        setCaseProfileStatus('Case profile cleared.')
        return
      }

      const res = await fetch('/api/user/case-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          caseId: caseNumber || null,
          caseType: hearingDate || null,
          caseTitle: caseTitle || null,
          caseDescription: caseSummary || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCaseProfileError(typeof data?.error === 'string' ? data.error : 'Failed to save case profile.')
        return
      }

      if (data?.case?.id) {
        const savedCaseId = String(data.case.id)
        setCaseProfileId(savedCaseId)
        setActiveCaseId(savedCaseId)
        publishActiveCaseChanged(savedCaseId)
        setCaseProfileStatus('Case profile saved.')
        void fetch('/api/cases?limit=200&offset=0')
          .then((r) => r.json())
          .then((d) => setCases(Array.isArray(d.cases) ? d.cases : []))
          .catch(() => null)
      }
    } catch {
      setCaseProfileError('Failed to save case profile.')
    } finally {
      setIsCaseProfileSaving(false)
    }
  }

  const handleDeleteCaseProfile = async () => {
    if (isCaseProfileDeleting || isCaseProfileSaving) return
    setIsCaseProfileDeleting(true)
    setCaseProfileError(null)
    setCaseProfileStatus(null)
    try {
      const res = await fetch('/api/user/case-details', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ caseId: caseProfileId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCaseProfileError(typeof data?.error === 'string' ? data.error : 'Failed to delete case profile.')
        return
      }
      clearCaseProfileForm()
      setActiveCaseId(null)
      publishActiveCaseChanged(null)
      setCaseProfileStatus('Case profile cleared.')
      void fetch('/api/cases?limit=200&offset=0')
        .then((r) => r.json())
        .then((d) => setCases(Array.isArray(d.cases) ? d.cases : []))
        .catch(() => null)
    } catch {
      setCaseProfileError('Failed to delete case profile.')
    } finally {
      setIsCaseProfileDeleting(false)
    }
  }

  return (
    <>
      <AppTopbar
        left={(
          canUseCaseProfile ? (
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '8px' }}>
              <button
                type="button"
                onClick={() => void openCaseProfileModal()}
                style={{
                  border: '1px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  borderRadius: '10px',
                  padding: '6px 10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title="Open case profile"
              >
                Case Profile
              </button>
            </div>
          ) : null
        )}
        center={null}
        right={(
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                <Link href={dashboardHref} className="app-button-secondary">
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href={pricingHref}
                    style={{
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 'clamp(0.88rem, 2.6vw, 1rem)',
                      textDecoration: 'underline',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Register
                  </Link>
                  <Link
                    href={signInHref}
                    style={{
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 'clamp(0.88rem, 2.6vw, 1rem)',
                      textDecoration: 'underline',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Sign in
                  </Link>
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
            right: 0,
            width: 'min(92vw, 340px)',
            height: '100vh',
            background: '#270427',
            boxShadow: isSidebarOpen ? '-2px 0 10px rgba(0,0,0,0.5)' : 'none',
            transition: 'transform 0.3s ease',
            transform: isSidebarOpen ? 'translateX(0)' : 'translateX(100%)',
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
            {canUseCaseProfile && cases.length > 0 && activeCase && (
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
                  {planInfo.nextBillingDate && (
                    <div>
                      <b>{isTrialingStripeStatus(planInfo.planStatus) ? 'First charge:' : 'Renews:'}</b> {formatDate(planInfo.nextBillingDate)}
                    </div>
                  )}
                  <div><b>Status:</b> {planInfo.planStatus || 'Active'}</div>
                  {canUseCaseProfile && (
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
                  )}
                </>
              ) : (
                <div>{planInfoLoaded ? 'Plan info unavailable.' : 'Loading plan info...'}</div>
              )}
            </div>

            <button
              onClick={startFreshConversation}
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
                onDeleteAllConversations={handleDeleteAllConversations}
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

      {isCaseProfileModalOpen && (
        <div
          onClick={() => setIsCaseProfileModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 2600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, 100%)',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'linear-gradient(180deg, #19031b 0%, #220629 100%)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '16px',
              boxShadow: '0 30px 70px rgba(0,0,0,0.5)',
              color: '#fff',
              padding: '18px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Case Profile</h3>
              <button
                type="button"
                onClick={() => setIsCaseProfileModalOpen(false)}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.25)',
                  color: '#fff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                aria-label="Close case profile modal"
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 14px', opacity: 0.9, fontSize: '14px' }}>
              Fill in case details if you want more tailored responses. You can also leave this empty.
            </p>

            {caseProfileError && (
              <div style={{ marginBottom: '12px', padding: '10px', borderRadius: '10px', background: 'rgba(127,29,29,0.35)', border: '1px solid rgba(248,113,113,0.35)', color: '#fecaca', fontSize: '13px' }}>
                {caseProfileError}
              </div>
            )}
            {caseProfileStatus && (
              <div style={{ marginBottom: '12px', padding: '10px', borderRadius: '10px', background: 'rgba(20,83,45,0.35)', border: '1px solid rgba(74,222,128,0.35)', color: '#bbf7d0', fontSize: '13px' }}>
                {caseProfileStatus}
              </div>
            )}

            <div style={{ display: 'grid', gap: '10px' }}>
              <label style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
                <span style={{ opacity: 0.9 }}>Case Number</span>
                <input
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  disabled={isCaseProfileLoading || isCaseProfileSaving || isCaseProfileDeleting}
                  style={{ height: '40px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '0 12px' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
                <span style={{ opacity: 0.9 }}>Case Title</span>
                <input
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  disabled={isCaseProfileLoading || isCaseProfileSaving || isCaseProfileDeleting}
                  style={{ height: '40px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '0 12px' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
                <span style={{ opacity: 0.9 }}>Hearing Date / Type</span>
                <input
                  value={hearingDate}
                  onChange={(e) => setHearingDate(e.target.value)}
                  disabled={isCaseProfileLoading || isCaseProfileSaving || isCaseProfileDeleting}
                  style={{ height: '40px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '0 12px' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
                <span style={{ opacity: 0.9 }}>Case Summary</span>
                <textarea
                  rows={6}
                  value={caseSummary}
                  onChange={(e) => setCaseSummary(e.target.value)}
                  disabled={isCaseProfileLoading || isCaseProfileSaving || isCaseProfileDeleting}
                  style={{ borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '10px 12px', resize: 'vertical' }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleDeleteCaseProfile}
                disabled={isCaseProfileLoading || isCaseProfileSaving || isCaseProfileDeleting}
                style={{
                  border: '1px solid rgba(248,113,113,0.45)',
                  background: 'rgba(127,29,29,0.35)',
                  color: '#fecaca',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  cursor: 'pointer'
                }}
              >
                {isCaseProfileDeleting ? 'Clearing…' : 'Clear Profile'}
              </button>
              <button
                type="button"
                onClick={handleSaveCaseProfile}
                disabled={isCaseProfileLoading || isCaseProfileSaving || isCaseProfileDeleting}
                style={{
                  border: '1px solid rgba(96,165,250,0.5)',
                  background: 'rgba(37,99,235,0.35)',
                  color: '#dbeafe',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  cursor: 'pointer'
                }}
              >
                {isCaseProfileSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DeleteConversationModal
        isOpen={isDeleteModalOpen}
        isDeleting={isDeletingConversation}
        error={deleteConversationError}
        onCancel={closeDeleteModal}
        onConfirm={confirmDeleteConversation}
        mode={deleteMode}
      />
    </>
  )
}
