'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import AppTopbar from '@/components/layout/AppTopbar'
import ChatConversationHistory from '@/components/chatbot/ChatConversationHistory'
import DeleteConversationModal from '@/components/chatbot/DeleteConversationModal'

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
  const [planLoaded, setPlanLoaded] = useState(false)
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
  const [deleteTargetConversationId, setDeleteTargetConversationId] = useState<string | null>(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeletingConversation, setIsDeletingConversation] = useState(false)
  const [deleteConversationError, setDeleteConversationError] = useState<string | null>(null)
  const premiumThreadCountRef = useRef(0)
  const premiumThreadCountCacheRef = useRef<Record<string, number>>({})
  const currentConversationIdRef = useRef<string | null>(null)
  useEffect(() => {
    premiumThreadCountRef.current = premiumThreadMessageCount
  }, [premiumThreadMessageCount])
  useEffect(() => {
    currentConversationIdRef.current = currentConversationId
  }, [currentConversationId])
  // Fetch plan info on mount
    useEffect(() => {
      fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' })
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
      const handleActiveCaseChanged = (event: Event) => {
        const detail = (event as CustomEvent<{ caseId?: string | null }>).detail;
        const nextCaseId = detail?.caseId?.trim();
        if (!nextCaseId) return;
        setActiveCaseId(nextCaseId);
      };
      window.addEventListener('activeCaseChanged', handleActiveCaseChanged as EventListener);
      return () => window.removeEventListener('activeCaseChanged', handleActiveCaseChanged as EventListener);
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
    const workingOnLabel = activeCase?.title?.trim()
      || activeCase?.case_type?.trim()
      || 'General guidance';
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    const loadPlan = async (userId: string | null) => {
      if (!userId) {
        setIsLoggedIn(false);
        setPlan('Free');
        setPlanLoaded(true);
        if (onPlanLoaded) onPlanLoaded(true);
        return;
      }
      setIsLoggedIn(true);
      try {
        const response = await fetch('/api/user/plan', {
          credentials: 'include',
          cache: 'no-store'
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
      if (!cancelled) {
        setPlanLoaded(true);
        if (onPlanLoaded) onPlanLoaded(true);
      }
    };

    supabase.auth.getSession().then((res: any) => {
      if (cancelled) return;
      const session = res?.data?.session;
      const userId = session?.user?.id || null;
      loadPlan(userId);
    });

    const listener = supabase.auth.onAuthStateChange((...args: any[]) => {
      if (cancelled) return;
      const authEvent = String(args[0] || '');
      const session = args[1];
      const userId = session?.user?.id || null;
      if (!userId && authEvent !== 'SIGNED_OUT') {
        return;
      }
      loadPlan(userId);
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
  const isPlusPlan =
    normalizedPlan.includes('plus') ||
    normalizedPlan.includes('premium pro') ||
    normalizedPlan.includes('premium cheap');
  const threadMessageLimit = isPlusPlan ? PLUS_MESSAGE_LIMIT_PER_THREAD : ESSENTIAL_MESSAGE_LIMIT_PER_THREAD;
  const shouldShowHistory = planLoaded && isLoggedIn && !isFreemiumPlan;
  const shouldShowSessionHistory = planLoaded && isLoggedIn && isFreemiumPlan;

  const getUtcDayKey = useCallback(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);
  const buildFreemiumStorageKey = useCallback(
    () => `freemiumMessageCount:${getUtcDayKey()}`,
    [getUtcDayKey]
  );
  const buildPremiumThreadCountStorageKey = useCallback(
    (conversationId: string) => `premiumThreadCount:${conversationId}`,
    []
  );
  const readPersistedPremiumThreadCount = useCallback((conversationId: string): number | null => {
    if (typeof window === 'undefined' || !conversationId) return null;
    const raw = localStorage.getItem(buildPremiumThreadCountStorageKey(conversationId));
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : Math.max(parsed, 0);
  }, [buildPremiumThreadCountStorageKey]);
  const writePersistedPremiumThreadCount = useCallback((conversationId: string, count: number) => {
    if (typeof window === 'undefined' || !conversationId) return;
    const bounded = Math.max(0, Math.min(count, threadMessageLimit));
    localStorage.setItem(buildPremiumThreadCountStorageKey(conversationId), String(bounded));
  }, [buildPremiumThreadCountStorageKey, threadMessageLimit]);
  const readKnownPremiumThreadCount = useCallback((conversationId: string): number | null => {
    if (!conversationId) return null;
    const hasMemory = Object.prototype.hasOwnProperty.call(premiumThreadCountCacheRef.current, conversationId);
    const memoryValue = hasMemory ? premiumThreadCountCacheRef.current[conversationId] : null;
    const persistedValue = readPersistedPremiumThreadCount(conversationId);
    if (typeof memoryValue === 'number' && typeof persistedValue === 'number') {
      return Math.max(memoryValue, persistedValue);
    }
    if (typeof memoryValue === 'number') return memoryValue;
    if (typeof persistedValue === 'number') return persistedValue;
    return null;
  }, [readPersistedPremiumThreadCount]);

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
  }, [buildFreemiumStorageKey]);

  // On mount, restore counter from localStorage immediately (before API call)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = buildFreemiumStorageKey();
    const stored = localStorage.getItem(storageKey);
    const parsed = stored ? Number.parseInt(stored, 10) : 0;
    const safeValue = Number.isNaN(parsed) ? 0 : parsed;
    // Restore immediately from localStorage (no 0 flash)
    setFreemiumMessageCount(Math.min(Math.max(safeValue, 0), FREE_USER_MESSAGE_LIMIT_24H));
  }, [buildFreemiumStorageKey]);

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
      fetch(`/api/message-count?${params.toString()}`, { cache: 'no-store' })
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

  const fetchPremiumThreadMessageCount = useCallback(async (
    conversationIdOverride?: string | null,
    options?: { minimumCount?: number }
  ) => {
    const targetConversationId = (conversationIdOverride || currentConversationId || '').trim();
    if (!planLoaded || isFreemiumPlan || !targetConversationId) return;
    try {
      const response = await fetch(
        `/api/message-count?conversationId=${encodeURIComponent(targetConversationId)}`,
        { credentials: 'include', cache: 'no-store' }
      );
      if (response.ok) {
        const data = await response.json();
        if (typeof data?.count === 'number') {
          const boundedServerCount = Math.min(data.count, threadMessageLimit);
          const cached = readKnownPremiumThreadCount(targetConversationId);
          const providedMinimum =
            typeof options?.minimumCount === 'number'
              ? Math.min(Math.max(options.minimumCount, 0), threadMessageLimit)
              : null;
          const boundedMinimum = Math.max(cached ?? 0, providedMinimum ?? 0);
          const resolvedCount = Math.max(boundedServerCount, boundedMinimum);
          premiumThreadCountCacheRef.current[targetConversationId] = resolvedCount;
          writePersistedPremiumThreadCount(targetConversationId, resolvedCount);
          if ((currentConversationIdRef.current || '').trim() === targetConversationId) {
            setPremiumThreadMessageCount(resolvedCount);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch premium thread message count:', error);
    }
  }, [
    planLoaded,
    isFreemiumPlan,
    currentConversationId,
    threadMessageLimit,
    readKnownPremiumThreadCount,
    writePersistedPremiumThreadCount
  ]);

  // Fetch premium per-thread message count when conversation changes or plan state becomes ready.
  useEffect(() => {
    const targetConversationId = (currentConversationId || '').trim();
    if (!targetConversationId) return;
    const cached = readKnownPremiumThreadCount(targetConversationId);
    if (cached !== null) {
      setPremiumThreadMessageCount(Math.max(0, Math.min(cached, threadMessageLimit)));
    }
    void fetchPremiumThreadMessageCount(targetConversationId, {
      minimumCount: cached ?? 0
    });
  }, [fetchPremiumThreadMessageCount, currentConversationId, threadMessageLimit, readKnownPremiumThreadCount]);

  // Listen for explicit refresh signals from ChatInterface after sends/regenerations.
  useEffect(() => {
    const handleCounterRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string; delta?: number; count?: number }>).detail;
      const nextConversationId = (detail?.conversationId || '').trim();
      const delta = typeof detail?.delta === 'number' ? detail.delta : 0;
      const absoluteCount = typeof detail?.count === 'number' ? detail.count : null;

      if (absoluteCount !== null) {
        const cacheKey = (nextConversationId || currentConversationId || '').trim();
        const bounded = Math.max(0, Math.min(absoluteCount, threadMessageLimit));
        const cached = cacheKey ? readKnownPremiumThreadCount(cacheKey) : null;
        const resolved = Math.max(bounded, cached ?? 0);
        if (nextConversationId) {
          setCurrentConversationId(nextConversationId);
        }
        if (cacheKey) {
          premiumThreadCountCacheRef.current[cacheKey] = resolved;
          writePersistedPremiumThreadCount(cacheKey, resolved);
        }
        if (
          !cacheKey ||
          cacheKey === (currentConversationIdRef.current || '').trim() ||
          cacheKey === nextConversationId
        ) {
          setPremiumThreadMessageCount(resolved);
        }
        return;
      }

      if (delta !== 0) {
        const cacheKey = (nextConversationId || currentConversationId || '').trim();
        if (!cacheKey) return;
        const currentKey = (currentConversationIdRef.current || '').trim();
        const baseline =
          cacheKey === currentKey
            ? premiumThreadCountRef.current
            : (readKnownPremiumThreadCount(cacheKey) ?? 0);
        const bounded = Math.max(0, Math.min(baseline + delta, threadMessageLimit));
        premiumThreadCountCacheRef.current[cacheKey] = bounded;
        writePersistedPremiumThreadCount(cacheKey, bounded);
        setPremiumThreadMessageCount(bounded);
        if (nextConversationId) {
          setCurrentConversationId(nextConversationId);
        }
        return;
      }

      if (nextConversationId) {
        setCurrentConversationId(nextConversationId);
        const minimumCount = readKnownPremiumThreadCount(nextConversationId) ?? 0;
        window.setTimeout(() => {
          void fetchPremiumThreadMessageCount(nextConversationId, { minimumCount });
        }, 450);
        return;
      }
      void fetchPremiumThreadMessageCount();
    };

    window.addEventListener('premiumThreadMessageCountChanged', handleCounterRefresh as EventListener);
    return () => window.removeEventListener('premiumThreadMessageCountChanged', handleCounterRefresh as EventListener);
  }, [
    fetchPremiumThreadMessageCount,
    currentConversationId,
    readKnownPremiumThreadCount,
    threadMessageLimit,
    writePersistedPremiumThreadCount
  ]);

  // Listen for conversation ID changes from ChatInterface
  useEffect(() => {
    const handleConversationChange = (event: Event) => {
      const conversationId = (event as CustomEvent<string>).detail;
      setCurrentConversationId(conversationId);
      const cached = readKnownPremiumThreadCount(conversationId);
      if (cached !== null) {
        setPremiumThreadMessageCount(Math.max(0, Math.min(cached, threadMessageLimit)));
      }
    };

    window.addEventListener('currentConversationIdChanged', handleConversationChange as EventListener);
    return () => window.removeEventListener('currentConversationIdChanged', handleConversationChange as EventListener);
  }, [threadMessageLimit, readKnownPremiumThreadCount]);

  // Bootstrap conversation ID in case navbar mounts after the initial broadcast event.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('conversationId');
    const fromStorage = localStorage.getItem('currentConversationId');
    const initialConversationId = (fromUrl || fromStorage || '').trim();
    if (initialConversationId) {
      setCurrentConversationId(initialConversationId);
      const cached = readKnownPremiumThreadCount(initialConversationId);
      if (cached !== null) {
        setPremiumThreadMessageCount(Math.max(0, Math.min(cached, threadMessageLimit)));
      }
    }
  }, [threadMessageLimit, readKnownPremiumThreadCount]);

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
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${day} ${time}`;
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

  const { paid: paidConversations, free: freeConversations } = splitConversationsByPlan();

  const openConversation = (conversationId: string) => {
    window.location.href = `/chatbot?conversationId=${conversationId}`;
  };

  const closeDeleteModal = () => {
    if (isDeletingConversation) return;
    setIsDeleteModalOpen(false);
    setDeleteTargetConversationId(null);
    setDeleteConversationError(null);
  };

  const handleDeleteConversation = (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the conversation
    setDeleteTargetConversationId(conversationId);
    setDeleteConversationError(null);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteConversation = async () => {
    if (!deleteTargetConversationId || isDeletingConversation) return;
    setIsDeletingConversation(true);
    setDeleteConversationError(null);
    try {
      const response = await fetch('/api/chat-history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: deleteTargetConversationId })
      });

      if (response.ok) {
        setConversations(prev => prev.filter(conv => conv.id !== deleteTargetConversationId));
        setIsDeleteModalOpen(false);
        setDeleteTargetConversationId(null);
      } else {
        setDeleteConversationError('Failed to delete conversation. Please try again.');
      }
    } catch (error) {
      console.error('Delete failed:', error);
      setDeleteConversationError('Failed to delete conversation. Please try again.');
    } finally {
      setIsDeletingConversation(false);
    }
  };

  return (
    <>
      <AppTopbar
        left={(
          !planLoaded ? null : !isLoggedIn ? (
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
                  Messages:
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
        center={(
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 12px',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.22)',
              background: 'rgba(255,255,255,0.08)',
              color: '#f8fafc',
              maxWidth: '100%'
            }}
            title={workingOnLabel}
          >
            <span style={{ fontSize: '12px', color: 'rgba(248,250,252,0.78)', letterSpacing: '0.3px' }}>
              Working on:
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '340px'
              }}
            >
              {workingOnLabel}
            </span>
          </div>
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

        .session-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(233, 196, 255, 0.75) rgba(255, 255, 255, 0.05);
          scrollbar-gutter: stable;
        }

        .session-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .session-scroll::-webkit-scrollbar-track {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(15, 23, 42, 0.22));
          border-radius: 999px;
          border: 1px solid rgba(236, 72, 153, 0.18);
          margin: 4px 0;
        }

        .session-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(
            180deg,
            rgba(255, 226, 246, 0.94) 0%,
            rgba(240, 171, 252, 0.9) 45%,
            rgba(217, 70, 239, 0.78) 100%
          );
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          box-shadow: inset 0 0 0 1px rgba(36, 8, 47, 0.28), 0 1px 7px rgba(236, 72, 153, 0.28);
          min-height: 26px;
        }

        .session-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(
            180deg,
            rgba(255, 238, 250, 0.98) 0%,
            rgba(244, 190, 255, 0.95) 40%,
            rgba(232, 121, 249, 0.88) 100%
          );
          box-shadow: inset 0 0 0 1px rgba(36, 8, 47, 0.22), 0 2px 10px rgba(232, 121, 249, 0.34);
        }

        .session-scroll::-webkit-scrollbar-button {
          display: none;
          width: 0;
          height: 0;
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
            <ChatConversationHistory
              historyLimited={historyLimited}
              historyLimitedSince={historyLimitedSince}
              loadingHistory={loadingHistory}
              conversations={conversations}
              paidConversations={paidConversations}
              freeConversations={freeConversations}
              formatDate={formatDate}
              onOpenConversation={openConversation}
              onDeleteConversation={handleDeleteConversation}
            />
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
                <div className="session-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
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
                        {formatDate(msg.timestamp)}
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
