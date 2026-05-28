"use client"

import { Suspense, useEffect, useMemo, useState } from 'react'
import ChatInterface from '@/components/chatbot/ChatInterface'
import CaseLawSearchPageClient from '@/components/dashboard/CaseLawSearchPageClient'
import DocumentsClientNew from '@/components/dashboard/DocumentsClientNew'
import SettingsPageClient from '@/components/settings/SettingsPageClient'
import type { InitialChatPlanState } from '@/components/chatbot/hooks/useChatAuthPlan'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import styles from './assistantProduct.module.css'

type Conversation = {
  id: string
  title: string
  timestamp: string
}

type AssistantProductClientProps = {
  initialChatPlan?: InitialChatPlanState | null
}

type AssistantView = 'chat' | 'documents' | 'caseLaw' | 'settings'

const formatDate = (isoDate: string) => {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

const isPremiumStoragePlan = (plan?: string | null) => {
  const label = String(plan || '').toLowerCase()
  return label.includes('premium +') || label.includes('premium plus') || label.includes('premium pro') || label.includes('assistant pro')
}

const isAssistantProPlan = (plan?: string | null) => {
  const label = String(plan || '').toLowerCase()
  return label.includes('assistant pro')
}

export default function AssistantProductClient({ initialChatPlan = null }: AssistantProductClientProps) {
  const [isSignedIn, setIsSignedIn] = useState(Boolean(initialChatPlan?.userId))
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeView, setActiveView] = useState<AssistantView>('chat')

  const hasDocumentStorage = useMemo(
    () => isPremiumStoragePlan(initialChatPlan?.plan),
    [initialChatPlan?.plan]
  )
  const hasCaseLawPage = useMemo(
    () => isAssistantProPlan(initialChatPlan?.plan),
    [initialChatPlan?.plan]
  )

  const settingsPlan = useMemo(() => ({
    plan: initialChatPlan?.plan || 'No plan',
    planStatus: initialChatPlan?.planStatus || 'inactive',
    paidAccess: Boolean(initialChatPlan?.paidAccess),
    publicMarket: 'GB' as const,
  }), [initialChatPlan?.paidAccess, initialChatPlan?.plan, initialChatPlan?.planStatus])

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabaseBrowserClient()

    const syncAuth = async () => {
      const { data } = await supabase.auth.getUser()
      if (!cancelled) setIsSignedIn(Boolean(data?.user))
    }

    void syncAuth()
    const listener = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setIsSignedIn(Boolean(session?.user))
    })

    return () => {
      cancelled = true
      listener.data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    const loadHistory = async () => {
      setLoadingHistory(true)
      try {
        const response = await fetch('/api/chat-history', { cache: 'no-store', credentials: 'include' })
        const data = await response.json().catch(() => ({}))
        if (!cancelled && response.ok) setConversations(Array.isArray(data?.conversations) ? data.conversations : [])
      } catch {
        if (!cancelled) setConversations([])
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    }
    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [isSignedIn])

  const openConversation = (conversationId: string) => {
    window.location.href = `/assistant?conversationId=${encodeURIComponent(conversationId)}`
  }

  const startNewChat = () => {
    setActiveView('chat')
    window.location.href = '/assistant?new=true'
  }

  const deleteConversation = async (conversationId: string) => {
    const ok = window.confirm('Delete this conversation?')
    if (!ok) return
    const response = await fetch('/api/chat-history', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ conversationId }),
    })
    if (response.ok) {
      setConversations((current) => current.filter((item) => item.id !== conversationId))
    }
  }

  return (
    <main className={styles.shell}>
      {isSignedIn && (
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarCollapsed}`}>
          <div className={styles.sidebarHeader}>
            {sidebarOpen && <span>MyMcKenzieCS</span>}
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setSidebarOpen((current) => !current)}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? '‹' : '›'}
            </button>
          </div>

          {sidebarOpen && (
            <>
              <button type="button" className={styles.newChatLink} onClick={startNewChat}>
                New chat
              </button>

              <div className={styles.sidebarSectionTitle}>Chat history</div>
              <div className={styles.historyList}>
                {loadingHistory ? (
                  <div className={styles.sidebarMuted}>Loading history...</div>
                ) : conversations.length === 0 ? (
                  <div className={styles.sidebarMuted}>No conversations yet.</div>
                ) : (
                  conversations.map((conversation) => (
                    <div key={conversation.id} className={styles.historyItem}>
                      <button type="button" onClick={() => openConversation(conversation.id)}>
                        <span>{conversation.title || 'Conversation'}</span>
                        <small>{formatDate(conversation.timestamp)}</small>
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => void deleteConversation(conversation.id)}
                        aria-label="Delete conversation"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>

              {hasDocumentStorage && (
                <div className={styles.storageBlock}>
                  <div className={styles.sidebarSectionTitle}>Tools</div>
                  <button
                    type="button"
                    className={`${styles.storageLink} ${activeView === 'documents' ? styles.sidebarNavActive : ''}`}
                    onClick={() => setActiveView('documents')}
                  >
                    Documents
                  </button>
                  {hasCaseLawPage && (
                    <button
                      type="button"
                      className={`${styles.storageLink} ${activeView === 'caseLaw' ? styles.sidebarNavActive : ''}`}
                      onClick={() => setActiveView('caseLaw')}
                    >
                      Case Law
                    </button>
                  )}
                </div>
              )}

              <div className={styles.sidebarFooter}>
                <button
                  type="button"
                  className={`${styles.sidebarNavLink} ${activeView === 'settings' ? styles.sidebarNavActive : ''}`}
                  onClick={() => setActiveView('settings')}
                >
                  Settings
                </button>
              </div>
            </>
          )}
        </aside>
      )}

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <h1>MyMcKenzie Assistant</h1>
          </div>
        </header>
        {activeView === 'chat' ? (
          <div className={styles.chatPane}>
            <ChatInterface
              initialAuthPlan={initialChatPlan}
              composerPlacement="pane"
              paneWidth="standard"
              conversationHomeHref="/assistant"
              anonymousMessageLimit={3}
            />
          </div>
        ) : activeView === 'documents' ? (
          <div className={styles.embeddedPane}>
            <DocumentsClientNew
              initialCanUpload={Boolean(initialChatPlan?.platformAccess ?? initialChatPlan?.paidAccess)}
              initialPlanLoaded={Boolean(initialChatPlan?.userId)}
              dashboardHrefOverride="/assistant"
              documentsHrefOverride="/assistant"
            />
          </div>
        ) : activeView === 'caseLaw' ? (
          <div className={styles.embeddedPane}>
            <CaseLawSearchPageClient
              initialUserPlan={initialChatPlan?.plan || 'Assistant Pro'}
              initialHasPaidAccess={Boolean(initialChatPlan?.paidAccess)}
              initialPlanChecked={Boolean(initialChatPlan?.userId)}
              dashboardHrefOverride="/assistant"
              settingsHrefOverride="/assistant"
              forceAccess={hasCaseLawPage}
            />
          </div>
        ) : (
          <div className={styles.embeddedPane}>
            <Suspense fallback={null}>
              <SettingsPageClient initialBillingPlan={settingsPlan} dashboardHrefOverride="/assistant" mode="embedded" />
            </Suspense>
          </div>
        )}
      </section>
    </main>
  )
}
