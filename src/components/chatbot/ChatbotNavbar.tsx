'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import AppTopbar from '@/components/layout/AppTopbar'

interface Conversation {
  id: string;
  title: string;
  timestamp: string;
  caseId?: string;
}

const FREE_USER_MESSAGE_LIMIT_24H = 20;
const GUEST_MESSAGE_LIMIT = 5;
const ESSENTIAL_MESSAGE_LIMIT_PER_THREAD = 30;
const PLUS_MESSAGE_LIMIT_PER_THREAD = 50;



export default function ChatbotNavbar({ onPlanLoaded }: { onPlanLoaded?: (loaded: boolean) => void } = {}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showHistory, setShowHistory] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [historyLimited, setHistoryLimited] = useState(false)
  const [plan, setPlan] = useState<string | null>(null)
  const [planLoaded, setPlanLoaded] = useState(true) // Default to loaded for faster UX
  const [freemiumMessageCount, setFreemiumMessageCount] = useState(0)
  const [premiumThreadMessageCount, setPremiumThreadMessageCount] = useState(0)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [canMessageAgainAt, setCanMessageAgainAt] = useState<string | null>(null)
  const [planInfo, setPlanInfo] = useState<any>(null)
  const [historyLimitedSince, setHistoryLimitedSince] = useState<string | null>(null)
  const [cases, setCases] = useState<any[]>([])
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [uid, setUid] = useState<string | null>(null)
  const [sessionMessages, setSessionMessages] = useState<{ role: string; content: string; timestamp: string }[]>([])
  // Fetch plan info on mount
    useEffect(() => {
      // Fetch plan info
      fetch('/api/user/plan')
        .then(res => res.ok ? res.json() : null)
        .then(data => setPlanInfo(data))
        .catch(() => setPlanInfo(null));
    }, []);
    useEffect(() => {
      const supabase = getSupabaseBrowserClient();
      supabase.auth.getUser().then(({ data }) => {
        setUid(data?.user?.id || null);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUid(session?.user?.id || null);
      });
      return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('selectedCaseId') : null;
      if (stored) setActiveCaseId(stored);
    }, []);

    useEffect(() => {
      const fetchCases = async () => {
        if (!uid) {
          setCases([]);
          return;
        }
        try {
          const res = await fetch('/api/cases');
          const data = await res.json();
          setCases(Array.isArray(data.cases) ? data.cases : []);
        } catch (err) {
          console.error('Failed to fetch cases', err);
        }
      };
      fetchCases();
    }, [uid]);
    const activeCase = cases.find((c) => c.id === activeCaseId) || null;
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    // Set initial state immediately for faster loading
    setPlanLoaded(true);
    if (onPlanLoaded) onPlanLoaded(true);

    const loadPlan = async (accessToken: string | null, userId: string | null) => {
      if (!userId) {
        setIsLoggedIn(false);
        setPlan('Free');
        return;
      }
      setIsLoggedIn(true);
      try {
        const response = await fetch('/api/user/plan', {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
        });
        if (!response.ok) {
          throw new Error('Failed to fetch plan');
        }
        const data = await response.json();
        if (cancelled) return;
        setPlan((data.plan || 'Free').toString());
      } catch (error) {
        if (!cancelled) {
          setPlan('Free');
          // Silently fail - user will still get Free plan access
        }
      }
      // Note: planLoaded already set to true above, no need to set again
    };

    supabase.auth.getSession().then((res: any) => {
      if (cancelled) return;
      const session = res?.data?.session;
      const accessToken = session?.access_token || null;
      const userId = session?.user?.id || null;
      loadPlan(accessToken, userId);
    });

    const listener = supabase.auth.onAuthStateChange((...args: any[]) => {
      if (cancelled) return;
      const session = args[1];
      const accessToken = session?.access_token || null;
      const userId = session?.user?.id || null;
      loadPlan(accessToken, userId);
    });

    return () => {
      cancelled = true;
      listener?.data?.subscription?.unsubscribe?.();
    };
  }, [onPlanLoaded]);

  const normalizedPlan = (plan || '').toLowerCase();
  const isFreemiumPlan = planLoaded && isLoggedIn && Boolean(plan) && (
    normalizedPlan.includes('free') ||
    normalizedPlan.includes('freemium') ||
    normalizedPlan.includes('guest')
  );
  const isPlusPlan = normalizedPlan.includes('plus') || normalizedPlan.includes('premium pro');
  const threadMessageLimit = isPlusPlan ? PLUS_MESSAGE_LIMIT_PER_THREAD : ESSENTIAL_MESSAGE_LIMIT_PER_THREAD;
  const shouldShowHistory = planLoaded && isLoggedIn && !isFreemiumPlan;
  const shouldShowSessionHistory = planLoaded && isLoggedIn && isFreemiumPlan;

  const getUtcDayKey = () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const buildFreemiumStorageKey = () => `freemiumMessageCount:${getUtcDayKey()}`;

  const updateFreemiumCounter = useCallback((countOverride?: number | null) => {
    if (typeof window === 'undefined') return;

    if (typeof countOverride === 'number' && !Number.isNaN(countOverride)) {
      setFreemiumMessageCount(Math.min(Math.max(countOverride, 0), FREE_USER_MESSAGE_LIMIT_24H));
      return;
    }

    const storageKey = buildFreemiumStorageKey();
    const stored = localStorage.getItem(storageKey);
    const parsed = stored ? Number.parseInt(stored, 10) : 0;
    const safeValue = Number.isNaN(parsed) ? 0 : parsed;
    setFreemiumMessageCount(Math.min(Math.max(safeValue, 0), FREE_USER_MESSAGE_LIMIT_24H));
  }, []);

  // On mount, restore counter from localStorage immediately (before API call)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = buildFreemiumStorageKey();
    const stored = localStorage.getItem(storageKey);
    const parsed = stored ? Number.parseInt(stored, 10) : 0;
    const safeValue = Number.isNaN(parsed) ? 0 : parsed;
    // Restore immediately from localStorage (no 0 flash)
    setFreemiumMessageCount(Math.min(Math.max(safeValue, 0), FREE_USER_MESSAGE_LIMIT_24H));
  }, []);

  useEffect(() => {
    updateFreemiumCounter();
  }, [updateFreemiumCounter]);

  useEffect(() => {
    if (planLoaded && !isFreemiumPlan && historyLimited) {
      setHistoryLimited(false);
    }
  }, [isFreemiumPlan, historyLimited, planLoaded]);

  useEffect(() => {
    if (isSidebarOpen && shouldShowHistory) {
      loadChatHistory();
    }
  }, [isSidebarOpen, shouldShowHistory]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleSessionHistory = (event: Event) => {
      const detail = (event as CustomEvent<{ messages?: { role: string; content: string; timestamp: string }[] }>).detail;
      setSessionMessages(Array.isArray(detail?.messages) ? detail!.messages! : []);
    };
    const handleSessionClear = () => setSessionMessages([]);
    window.addEventListener('sessionHistoryUpdated', handleSessionHistory as EventListener);
    window.addEventListener('sessionHistoryCleared', handleSessionClear as EventListener);
    return () => {
      window.removeEventListener('sessionHistoryUpdated', handleSessionHistory as EventListener);
      window.removeEventListener('sessionHistoryCleared', handleSessionClear as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleCustomCount = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      if (!detail) return;
      updateFreemiumCounter(detail.count ?? null);
    };

    window.addEventListener('freemiumMessageCountChanged', handleCustomCount as EventListener);
    return () => window.removeEventListener('freemiumMessageCountChanged', handleCustomCount as EventListener);
  }, [updateFreemiumCounter]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key.startsWith('freemiumMessageCount:')) {
        updateFreemiumCounter();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [updateFreemiumCounter]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateFreemiumCounter();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [updateFreemiumCounter]);

  useEffect(() => {
    if (!planLoaded || !isFreemiumPlan) return;
    const fetchMessageCount = async () => {
      const supabase = getSupabaseBrowserClient();
      const res = await supabase.auth.getSession();
      const sessionData = (res as any)?.data;
      const userId = sessionData?.session?.user?.id || null;
      if (!userId) return;
      localStorage.setItem('userId', userId);
      const params = new URLSearchParams({ userId });
      fetch(`/api/message-count?${params.toString()}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (typeof data?.count === 'number') {
            setFreemiumMessageCount(Math.min(data.count, FREE_USER_MESSAGE_LIMIT_24H));
            setCanMessageAgainAt(data?.canMessageAgainAt || null);
          }
        })
        .catch(() => undefined);
    };
    fetchMessageCount();
  }, [planLoaded, isFreemiumPlan]);

  // Fetch premium per-thread message count when conversation changes
  useEffect(() => {
    if (!planLoaded || isFreemiumPlan || !currentConversationId) return;
    
    const fetchPremiumThreadMessageCount = async () => {
      try {
        const response = await fetch(`/api/message-count?conversationId=${encodeURIComponent(currentConversationId)}`);
        if (response.ok) {
          const data = await response.json();
          if (typeof data?.count === 'number') {
            setPremiumThreadMessageCount(Math.min(data.count, threadMessageLimit));
          }
        }
      } catch (error) {
        console.error('Failed to fetch premium thread message count:', error);
      }
    };

    fetchPremiumThreadMessageCount();
  }, [planLoaded, isFreemiumPlan, currentConversationId, threadMessageLimit]);

  // Listen for conversation ID changes from ChatInterface
  useEffect(() => {
    const handleConversationChange = (event: Event) => {
      const conversationId = (event as CustomEvent<string>).detail;
      setCurrentConversationId(conversationId);
    };

    window.addEventListener('currentConversationIdChanged', handleConversationChange as EventListener);
    return () => window.removeEventListener('currentConversationIdChanged', handleConversationChange as EventListener);
  }, []);

  const displayedMessageCount = Math.min(freemiumMessageCount, FREE_USER_MESSAGE_LIMIT_24H);
  const remainingMessages = Math.max(FREE_USER_MESSAGE_LIMIT_24H - displayedMessageCount, 0);
  const guestMessageCount = Math.min(
    sessionMessages.filter((msg) => msg.role === 'user').length,
    GUEST_MESSAGE_LIMIT
  );

  const loadChatHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/chat-history`);
      const data = await response.json();
      
      if (response.ok) {
        setConversations(data.conversations || []);
        setHistoryLimited(Boolean(data.limited));
        setHistoryLimitedSince(typeof data.freemiumSince === 'string' ? data.freemiumSince : null);
      } else {
        setHistoryLimited(false);
        setHistoryLimitedSince(null);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      setHistoryLimited(false);
      setHistoryLimitedSince(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    }
  };

  const splitConversationsByPlan = () => {
    if (!historyLimitedSince) {
      return { paid: [], free: conversations };
    }
    const pivot = new Date(historyLimitedSince).getTime();
    const paid: Conversation[] = [];
    const free: Conversation[] = [];
    conversations.forEach((conv) => {
      const ts = new Date(conv.timestamp).getTime();
      if (!Number.isNaN(ts) && ts < pivot) {
        paid.push(conv);
      } else {
        free.push(conv);
      }
    });
    return { paid, free };
  };

  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the conversation
    
    if (!confirm('Are you sure you want to delete this conversation?')) {
      return;
    }

    try {
      const response = await fetch('/api/chat-history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId })
      });

      if (response.ok) {
        // Remove from local state
        setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      } else {
        alert('Failed to delete conversation');
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete conversation');
    }
  };

  return (
    <>
      <AppTopbar
        left={(
          !isLoggedIn ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                paddingLeft: '8px'
              }}
            >
              <div style={{
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
              }}>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.8)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Guest:
                </span>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: guestMessageCount >= GUEST_MESSAGE_LIMIT ? '#ef4444' : '#ec4899'
                }}>
                  {guestMessageCount}/{GUEST_MESSAGE_LIMIT}
                </span>
              </div>
            </div>
          ) : isFreemiumPlan ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                paddingLeft: '8px'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(239, 68, 68, 0.1)',
                paddingLeft: '10px',
                paddingRight: '12px',
                paddingTop: '6px',
                paddingBottom: '6px',
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.2)'
              }}>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.8)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Messages:
                </span>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H 
                    ? '#ef4444'
                    : displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H * 0.8
                    ? '#f97316'
                    : '#8b5cf6'
                }}>
                  {displayedMessageCount}/{FREE_USER_MESSAGE_LIMIT_24H}
                </span>
              </div>
            </div>
          ) : planLoaded && isLoggedIn && !isFreemiumPlan && currentConversationId ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                paddingLeft: '8px'
              }}
            >
              <div style={{
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
              }}>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.8)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Thread:
                </span>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: premiumThreadMessageCount >= threadMessageLimit 
                    ? '#ef4444'
                    : premiumThreadMessageCount >= threadMessageLimit * 0.8
                    ? '#f97316'
                    : '#8b5cf6'
                }}>
                  {premiumThreadMessageCount}/{threadMessageLimit}
                </span>
              </div>
            </div>
          ) : null
        )}
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
                <Link
                  href="/dashboard"
                  className="app-button-secondary"
                >
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link href="/auth/signup" style={{ color: '#fff', fontWeight: 700, fontSize: '1.2rem', textDecoration: 'underline', marginRight: '8px' }}>Sign Up</Link>
                  <Link href="/auth/signin" style={{ color: '#fff', fontWeight: 600, fontSize: '1.2rem', textDecoration: 'underline' }}>Sign in</Link>
                </>
              )
            )}
          </div>
        )}
        className="chatbot-fixed"
      />
      <style jsx>{`
        .app-topbar.chatbot-fixed {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
        }
      `}</style>

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
          {/* Active case */}
          {cases.length > 0 && activeCase && (
            <div style={{
              marginBottom: '10px',
              padding: '14px',
              background: 'linear-gradient(135deg, rgba(15,23,42,0.6) 0%, rgba(30,41,59,0.8) 100%)',
              borderRadius: '10px',
              border: '1.5px solid rgba(148,163,184,0.2)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              boxShadow: '0 2px 8px rgba(60,0,80,0.08)'
            }}>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px', color: '#e2e8f0', letterSpacing: '0.4px' }}>
                Active case
              </div>
              <div style={{ fontSize: '13px', color: '#e2e8f0' }}>
                {activeCase.title || 'Untitled case'}
              </div>
              {activeCase.case_type && (
                <div style={{ fontSize: '12px', color: 'rgba(226,232,240,0.7)', marginTop: '4px' }}>
                  {activeCase.case_type}
                </div>
              )}
            </div>
          )}

          {/* Plan Info Display */}
          <div style={{
            marginBottom: '10px',
            padding: '14px',
            background: 'linear-gradient(135deg, #1e293b 0%, #312e81 100%)',
            borderRadius: '10px',
            border: '1.5px solid rgba(139,92,246,0.18)',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 500,
            boxShadow: '0 2px 8px rgba(60,0,80,0.08)'
          }}>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px', color: '#a5b4fc', letterSpacing: '0.5px' }}>
              Active Plan
            </div>
            {planInfo ? (
              <>
                <div><b>Plan:</b> {planInfo.plan || 'Free'}</div>
                {planInfo.nextBillingDate && <div><b>Renews:</b> {formatDate(planInfo.nextBillingDate)}</div>}
                <div><b>Status:</b> {planInfo.planStatus || 'Active'}</div>
              </>
            ) : (
              <div>Loading plan info...</div>
            )}
          </div>

          {!isFreemiumPlan && (
            <button
              onClick={() => (window.location.href = '/chatbot?new=true')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '15px 20px',
                background:
                  hoveredItem === 'new' ? 'rgba(123, 43, 123, 0.28)' : 'rgba(123, 43, 123, 0.20)',
                color: 'white',
                border:
                  hoveredItem === 'new'
                    ? '1px solid rgba(200,150,230,0.35)'
                    : '1px solid rgba(200,150,230,0.25)',
                borderRadius: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow:
                  hoveredItem === 'new'
                    ? '0 4px 12px rgba(103, 25, 103, 0.35)'
                    : '0 2px 6px rgba(0,0,0,0.2)',
                transform: hoveredItem === 'new' ? 'translateY(-1px)' : 'none',
                transition: 'all 0.2s ease',
                fontSize: '16px'
              }}
              onMouseEnter={() => setHoveredItem('new')}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <span>➕</span> New Chat
            </button>
          )}

          {/* Message Counter for Freemium Users */}
          {isFreemiumPlan && (
            <div style={{
              marginTop: '12px',
              padding: '16px',
              background: displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H 
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.2) 100%)'
                : displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H * 0.8
                ? 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(234, 88, 12, 0.2) 100%)'
                : 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(124, 58, 237, 0.15) 100%)',
              border: displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H 
                ? '1.5px solid rgba(239, 68, 68, 0.4)'
                : displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H * 0.8
                ? '1.5px solid rgba(249, 115, 22, 0.4)'
                : '1.5px solid rgba(139, 92, 246, 0.3)',
              borderRadius: '12px',
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{ 
                fontSize: '12px', 
                color: 'rgba(255,255,255,0.7)',
                marginBottom: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                📊 Message Usage
              </div>
              <div style={{
                width: '100%',
                height: '6px',
                background: 'rgba(0,0,0,0.4)',
                borderRadius: '3px',
                overflow: 'hidden',
                marginBottom: '10px'
              }}>
                <div style={{
                  width: `${(displayedMessageCount / FREE_USER_MESSAGE_LIMIT_24H) * 100}%`,
                  height: '100%',
                  background: displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H 
                    ? 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)'
                    : displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H * 0.8
                    ? 'linear-gradient(90deg, #f97316 0%, #ea580c 100%)'
                    : 'linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%)',
                  transition: 'width 0.3s ease',
                  boxShadow: displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H * 0.8
                    ? `0 0 12px ${displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H ? '#ef4444' : '#f97316'}`
                    : 'none'
                }} />
              </div>
              <div style={{ 
                fontSize: '14px', 
                fontWeight: 700,
                color: '#fff',
                marginBottom: '3px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>
                  {displayedMessageCount} / {FREE_USER_MESSAGE_LIMIT_24H}
                </span>
                <span style={{
                  fontSize: '12px',
                  color: displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H
                    ? '#ef4444'
                    : displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H * 0.8
                    ? '#f97316'
                    : 'rgba(255,255,255,0.6)',
                  fontWeight: 600
                }}>
                  {displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H
                    ? '🔴 Full'
                    : displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H * 0.8
                    ? '🟠 Near limit'
                    : '🟢 Good'}
                </span>
              </div>
              <div style={{
                fontSize: '12px',
                color: 'rgba(255,255,255,0.6)',
                marginBottom: '12px',
                fontStyle: 'italic'
              }}>
                {displayedMessageCount >= FREE_USER_MESSAGE_LIMIT_24H && canMessageAgainAt ? (
                  <>
                    Limit reached. Come back at {new Date(canMessageAgainAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} to continue messaging
                  </>
                ) : (
                  <>
                    {remainingMessages} {remainingMessages === 1 ? 'message' : 'messages'} remaining (24h window)
                  </>
                )}
              </div>
              {remainingMessages > 0 && remainingMessages <= 5 && (
                <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 600, marginBottom: '10px' }}>
                  {remainingMessages} messages left in your 24-hour window
                </div>
              )}
              <Link
                href="/pricing"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, #f7b267 0%, #f79d65 45%, #f25c54 100%)',
                  color: 'white',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                  boxShadow: '0 4px 12px rgba(242, 92, 84, 0.4)',
                  transition: 'all 0.2s ease',
                  border: '1px solid rgba(255,255,255,0.15)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(242, 92, 84, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(242, 92, 84, 0.4)';
                }}
              >
                Upgrade to Premium
              </Link>
            </div>
          )}

          {shouldShowHistory && (
            <div style={{
              marginTop: '18px',
              padding: '16px',
              background: 'rgba(17,24,39,0.45)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.12)'
            }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Conversation history
              </div>
              {historyLimited && (
                <div style={{ fontSize: '12px', color: 'rgba(251,191,36,0.9)', marginBottom: '10px', fontWeight: 600 }}>
                  {historyLimitedSince
                    ? 'Free plan shows your next 5 threads. Older paid chats are still available.'
                    : 'Free plan shows your last 5 threads. Upgrade to unlock full history.'}
                </div>
              )}
              {loadingHistory ? (
                <div style={{ fontSize: '12px', color: 'rgba(226,232,240,0.7)' }}>Loading history…</div>
              ) : conversations.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'rgba(226,232,240,0.7)' }}>No conversations yet.</div>
              ) : (
                (() => {
                  const { paid, free } = splitConversationsByPlan();
                  const renderList = (items: Conversation[]) => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {items.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => {
                            window.location.href = `/chatbot?conversationId=${conv.id}`;
                          }}
                          style={{
                            textAlign: 'left',
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(15,23,42,0.35)',
                            color: '#e2e8f0',
                            padding: '10px 12px',
                            borderRadius: '10px',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                            {conv.title || 'Conversation'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'rgba(226,232,240,0.6)' }}>
                            {formatDate(conv.timestamp)}
                          </div>
                        </button>
                      ))}
                    </div>
                  );

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '260px', overflowY: 'auto' }}>
                      {historyLimitedSince && paid.length > 0 && (
                        <div>
                          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', color: 'rgba(226,232,240,0.6)', marginBottom: '6px' }}>
                            Paid plan history
                          </div>
                          {renderList(paid)}
                        </div>
                      )}
                      {historyLimitedSince && free.length > 0 && (
                        <div>
                          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', color: 'rgba(226,232,240,0.6)', marginBottom: '6px' }}>
                            Freemium history
                          </div>
                          {renderList(free)}
                        </div>
                      )}
                      {!historyLimitedSince && renderList(conversations)}
                    </div>
                  );
                })()
              )}
            </div>
          )}
          {shouldShowSessionHistory && (
            <div style={{
              marginTop: '18px',
              padding: '16px',
              background: 'rgba(17,24,39,0.45)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.12)'
            }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Session history
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(226,232,240,0.7)', marginBottom: '10px' }}>
                Visible only while this tab is open.
              </div>
              {sessionMessages.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'rgba(226,232,240,0.7)' }}>No messages yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                  {sessionMessages.slice(-12).map((msg, idx) => (
                    <div
                      key={`${msg.timestamp}-${idx}`}
                      style={{
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(15,23,42,0.35)',
                        color: '#e2e8f0',
                        padding: '10px 12px',
                        borderRadius: '10px'
                      }}
                    >
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', color: 'rgba(226,232,240,0.6)', marginBottom: '6px' }}>
                        {msg.role === 'user' ? 'You' : 'MymckenzieCS'}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        {msg.content ? msg.content.slice(0, 120) : 'Message'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(226,232,240,0.6)' }}>
                        {new Date(msg.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1500
          }}
        />
      )}
    </>
  )
}
