'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  Bell,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FolderOpen,
  HelpCircle,
  Home,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  UserPlus,
  UserRound,
  UserCircle2,
  UsersRound,
  Video,
  XCircle,
} from 'lucide-react';
import ChatInterface from '@/components/chatbot/ChatInterface';
import { VideoCallPanel } from '@/components/video-call/VideoCallPanel';
import InboxPage from './InboxPage';
import LeadsPage from './LeadsPage';
import AlertsPage from './AlertsPage';
import ClientMattersPage from './ClientMattersPage';
import BusinessProfilePage from './BusinessProfilePage';
import DirectoryClient from '@/components/directory/DirectoryClient';
import ChatConversationHistory from '@/components/chatbot/ChatConversationHistory';
import DeleteConversationModal from '@/components/chatbot/DeleteConversationModal';
import type { InitialChatPlanState } from '@/components/chatbot/hooks/useChatAuthPlan';
import CaseLawSearchPageClient from '@/components/dashboard/CaseLawSearchPageClient';
import DocumentsClientNew from './documents-tool/DocumentsClientNew';
import EnhancedCalendarClient from '@/components/dashboard/EnhancedCalendarClient';
import NotesPageClient from './notes-tool/NotesPageClient';
import SettingsPageClient from '@/components/settings/SettingsPageClient';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import HostedVideoMeeting from '@/components/video/HostedVideoMeeting';
import {
  BUSINESS_CLEAR_DOCUMENTS_FILTER_EVENT,
  BUSINESS_MEETINGS_UPDATED_EVENT,
  BUSINESS_OPEN_DOCUMENTS_EVENT,
} from '@/lib/events/business-events';
import {
  BUSINESS_ALERTS_STORAGE_KEY,
  BUSINESS_ALERTS_UPDATED_EVENT,
  countUnreadAlerts,
  dispatchBusinessAlertsRefresh,
  loadStoredAlerts,
} from '@/lib/business/alerts-cache';
import BusinessFeedbackPage from './BusinessFeedbackPage';
import styles from './businessDashboard.module.css';

type NavItem = {
  id: string;
  label: string;
  description: string;
  icon: typeof Home;
  count?: string;
};

const navItems: NavItem[] = [
  {
    id: 'home',
    label: 'MyMcKenzie Assistant',
    description: 'Business chat assistant',
    icon: Bot,
  },
  {
    id: 'clients',
    label: 'Client Work',
    description: 'Client work items and profiles',
    icon: BriefcaseBusiness,
  },
  {
    id: 'documents',
    label: 'Document Storage',
    description: 'Files, folders, and evidence',
    icon: FolderOpen,
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'Drafts, summaries, and saved notes',
    icon: BookOpen,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    description: 'Events, deadlines, and reminders',
    icon: CalendarClock,
  },
  {
    id: 'leads',
    label: 'Leads',
    description: 'Enquiries, intake, and follow-ups',
    icon: UserRound,
  },
  {
    id: 'video',
    label: 'Client Meetings',
    description: 'Consultations and meeting rooms',
    icon: Video,
  },
  {
    id: 'messages',
    label: 'Inbox',
    description: 'Client and work conversations',
    icon: MessageSquare,
  },
  {
    id: 'notifications',
    label: 'Alerts',
    description: 'Alerts across clients and teams',
    icon: Bell,
  },
  {
    id: 'case-law',
    label: 'Case Law DB',
    description: 'Authorities and saved cases',
    icon: BookOpen,
  },
  {
    id: 'profile',
    label: 'My Profile',
    description: 'Public directory listing',
    icon: UserCircle2,
  },
  {
    id: 'directory',
    label: 'Directory',
    description: 'Browse all McKenzie Friends',
    icon: UsersRound,
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Account, billing, and support',
    icon: Settings,
  },
  {
    id: 'feedback',
    label: 'Feedback',
    description: 'Product ideas and improvement requests',
    icon: Sparkles,
  },
];

type BusinessDashboardClientProps = {
  initialChatPlan: InitialChatPlanState;
  initialActiveId?: NavItem['id'];
};

type ChatConversation = {
  id: string;
  title: string;
  timestamp: string;
};

type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

type ClientContact = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string;
  source?: 'database' | 'local';
};

type ClientMeeting = {
  id: string;
  clientId: string | null;
  clientName: string;
  clientEmail: string;
  title: string;
  description: string;
  meetingDate: string;
  meetingTime: string;
  durationMinutes: number;
  roomName: string;
  status: MeetingStatus;
  source?: 'database' | 'local';
};

type MeetingFormState = {
  clientId: string;
  clientName: string;
  clientEmail: string;
  title: string;
  meetingDate: string;
  meetingTime: string;
  durationMinutes: string;
  description: string;
};

type InboxComposePreset = {
  to: string;
  subject: string;
  body?: string;
  caseId?: string;
  matterLabel?: string;
} | null;

const NEW_CLIENT_VALUE = '__new_client__';
const LOCAL_CLIENTS_KEY = 'mymckenzie-business-meeting-clients';
const LOCAL_MEETINGS_KEY = 'mymckenzie-business-client-meetings';

function getTodayInputValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getDefaultMeetingTime() {
  const date = new Date();
  if (date.getMinutes() >= 30) {
    date.setHours(date.getHours() + 1);
    date.setMinutes(0, 0, 0);
  } else {
    date.setMinutes(30, 0, 0);
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function createInitialMeetingForm(): MeetingFormState {
  return {
    clientId: NEW_CLIENT_VALUE,
    clientName: '',
    clientEmail: '',
    title: 'Client consultation',
    meetingDate: getTodayInputValue(),
    meetingTime: getDefaultMeetingTime(),
    durationMinutes: '45',
    description: '',
  };
}

function createLocalId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function slugRoomPart(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
}

function createRoomName(userId: string, clientName: string, meetingDate: string) {
  const owner = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'business';
  const client = slugRoomPart(clientName) || 'client';
  return `mymckenzie-${owner}-${client}-${meetingDate.replace(/-/g, '')}-${createLocalId('room').slice(-8)}`;
}

function loadLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocalJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

function normaliseMeetingTime(value: unknown) {
  if (typeof value !== 'string' || !value) return '';
  return value.slice(0, 5);
}

function mapClientRow(row: any): ClientContact {
  return {
    id: String(row.id),
    name: String(row.name || 'Client'),
    email: String(row.email || ''),
    phone: row.phone || undefined,
    company: row.company || undefined,
    notes: row.notes || undefined,
    source: 'database',
  };
}

function mapMeetingRow(row: any, clientsById: Map<string, ClientContact>): ClientMeeting {
  const client = row.client_id ? clientsById.get(String(row.client_id)) : null;
  return {
    id: String(row.id),
    clientId: row.client_id ? String(row.client_id) : null,
    clientName: client?.name || 'Client',
    clientEmail: client?.email || '',
    title: String(row.title || 'Client consultation'),
    description: String(row.description || ''),
    meetingDate: String(row.meeting_date || getTodayInputValue()),
    meetingTime: normaliseMeetingTime(row.meeting_time),
    durationMinutes: Number(row.duration_minutes || 45),
    roomName: String(row.room_name || ''),
    status: (row.status || 'scheduled') as MeetingStatus,
    source: 'database',
  };
}

function sortMeetings(a: ClientMeeting, b: ClientMeeting) {
  return `${a.meetingDate}T${a.meetingTime || '00:00'}`.localeCompare(`${b.meetingDate}T${b.meetingTime || '00:00'}`);
}

function formatMeetingWhen(meeting: ClientMeeting) {
  const date = new Date(`${meeting.meetingDate}T${meeting.meetingTime || '00:00'}`);
  const dateLabel = Number.isNaN(date.getTime())
    ? meeting.meetingDate
    : new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(date);
  return `${dateLabel}${meeting.meetingTime ? `, ${meeting.meetingTime}` : ''}`;
}

function statusClassName(status: MeetingStatus) {
  if (status === 'in_progress') return `${styles.meetingStatusPill} ${styles.meetingStatusLive}`;
  if (status === 'completed') return `${styles.meetingStatusPill} ${styles.meetingStatusDone}`;
  if (status === 'cancelled' || status === 'no_show') {
    return `${styles.meetingStatusPill} ${styles.meetingStatusCancelled}`;
  }
  return `${styles.meetingStatusPill} ${styles.meetingStatusScheduled}`;
}

  
                                                        
function SidebarPagePlaceholder({ activeId }: { activeId: NavItem['id'] }) {
  const label = navItems.find((item) => item.id === activeId)?.label ?? 'Page';
  return (
    <div className={styles.placeholderShell}>
      <span className={styles.visuallyHidden}>{label}</span>
    </div>
  );
}

function formatChatHistoryDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

function BusinessChatWorkspace({ initialChatPlan }: { initialChatPlan: InitialChatPlanState }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deleteTargetConversationId, setDeleteTargetConversationId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [deleteConversationError, setDeleteConversationError] = useState<string | null>(null);
  const businessChatHref = '/business/dashboard';

  const loadChatHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch('/api/chat-history', { credentials: 'include', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
      }
    } catch (error) {
      console.error('Failed to load business chat history:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (sidebarOpen) void loadChatHistory();
  }, [sidebarOpen, loadChatHistory]);

  const openConversation = (conversationId: string) => {
    const next = new URL(businessChatHref, window.location.origin);
    next.searchParams.set('conversationId', conversationId);
    router.push(`${next.pathname}${next.search}${next.hash}`);
  };

  const startNewChat = () => {
    const next = new URL(businessChatHref, window.location.origin);
    next.searchParams.set('new', 'true');
    next.searchParams.set('fresh', 'true');
    localStorage.removeItem('currentConversationId');
    router.push(`${next.pathname}${next.search}${next.hash}`);
  };

  const handleDeleteConversation = (conversationId: string, event: MouseEvent) => {
    event.stopPropagation();
    setDeleteTargetConversationId(conversationId);
    setDeleteConversationError(null);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (isDeletingConversation) return;
    setIsDeleteModalOpen(false);
    setDeleteTargetConversationId(null);
    setDeleteConversationError(null);
  };

  const confirmDeleteConversation = async () => {
    if (!deleteTargetConversationId || isDeletingConversation) return;
    setIsDeletingConversation(true);
    setDeleteConversationError(null);
    try {
      const response = await fetch('/api/chat-history', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: deleteTargetConversationId }),
      });

      if (!response.ok) {
        setDeleteConversationError('Failed to delete conversation. Please try again.');
        return;
      }

      setConversations((current) => current.filter((conversation) => conversation.id !== deleteTargetConversationId));
      setIsDeleteModalOpen(false);
      setDeleteTargetConversationId(null);
    } catch (error) {
      console.error('Delete failed:', error);
      setDeleteConversationError('Failed to delete conversation. Please try again.');
    } finally {
      setIsDeletingConversation(false);
    }
  };

  return (
    <div className={styles.businessChatWorkspace}>
      {/* Business Chat Navbar */}
      <div className={styles.businessChatNavbar}>
        <div className={styles.businessChatNavbarLeft}>
          <span className={styles.businessChatTitle}>MyMcKenzie Assistant</span>
        </div>
        <div className={styles.businessChatNavbarRight}>
          <button 
            type="button" 
            className={styles.businessChatMenuButton} 
            onClick={() => setSidebarOpen(true)}
            aria-label="Open chat sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.chatWorkspace}>
        <div className={styles.chatbotFrame}>
          <ChatInterface
            initialAuthPlan={initialChatPlan}
            composerPlacement="pane"
            paneWidth="standard"
            conversationHomeHref={businessChatHref}
          />
        </div>
      </div>

      {/* Slide-out Sidebar */}
      {sidebarOpen && (
        <div
          className={styles.chatSidebarBackdrop}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={`${styles.chatSidebar} ${sidebarOpen ? styles.chatSidebarOpen : ''}`}>
        <div className={styles.chatSidebarHeader}>
          <h3>Business Chat</h3>
          <button
            type="button"
            className={styles.chatSidebarClose}
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className={styles.chatSidebarContent}>
          <button
            type="button"
            className={styles.newChatButton}
            onClick={startNewChat}
          >
            <span>➕</span> New Chat
          </button>

          <ChatConversationHistory
            loadingHistory={loadingHistory}
            conversations={conversations}
            formatDate={formatChatHistoryDate}
            onOpenConversation={openConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        </div>
      </div>

      <DeleteConversationModal
        isOpen={isDeleteModalOpen}
        isDeleting={isDeletingConversation}
        error={deleteConversationError}
        onCancel={closeDeleteModal}
        onConfirm={confirmDeleteConversation}
      />
    </div>
  );
}

function EmbeddedToolShell({ children, variant = 'purple' }: { children: ReactNode; variant?: 'purple' | 'plain' }) {
  return (
    <div className={`${styles.embeddedToolShell} ${variant === 'purple' ? 'purple-gradient-bg' : styles.embeddedToolShellPlain}`}>
      {children}
    </div>
  );
}

function BusinessWorkspacePage({
  activeId,
  initialChatPlan,
  initialActiveId = 'home',
  inboxComposePreset,
  documentsCaseIdOverride,
  meetingPreset,
  onMeetingPresetConsumed,
}: {
  activeId: NavItem['id'];
  initialChatPlan: InitialChatPlanState;
  initialActiveId?: NavItem['id'];
  inboxComposePreset: InboxComposePreset;
  documentsCaseIdOverride: string | null;
  meetingPreset: { clientName?: string; clientEmail?: string; context?: string } | null;
  onMeetingPresetConsumed: () => void;
}) {
  const businessDashboardHref = '/business/dashboard';
  const settingsPlan = {
    plan: initialChatPlan.plan,
    planStatus: initialChatPlan.planStatus,
    paidAccess: initialChatPlan.paidAccess,
    publicMarket: 'GB' as const,
  };

  if (activeId === 'clients') {
    return <ClientMattersPage />;
  }

  if (activeId === 'video') {
    return (
      <VideoCallPanel
        userId={initialChatPlan.userId}
        meetingPreset={meetingPreset}
        onMeetingPresetConsumed={onMeetingPresetConsumed}
      />
    );
  }

  if (activeId === 'case-law') {
    return (
      <Suspense fallback={<div className={styles.placeholderShell} />}>
        <CaseLawSearchPageClient
          initialUserPlan={initialChatPlan.plan}
          initialHasPaidAccess={initialChatPlan.paidAccess}
          initialPlanChecked
          initialPublicMarket="GB"
          dashboardHrefOverride={businessDashboardHref}
          settingsHrefOverride={`${businessDashboardHref}#settings`}
          forceAccess
          embedded
        />
      </Suspense>
    );
  }

  if (activeId === 'documents') {
    return (
      <EmbeddedToolShell variant="plain">
        <DocumentsClientNew
          initialCanUpload={Boolean(initialChatPlan.platformAccess ?? initialChatPlan.paidAccess)}
          initialPlanLoaded
          dashboardHrefOverride={businessDashboardHref}
          caseIdOverride={documentsCaseIdOverride}
        />
      </EmbeddedToolShell>
    );
  }

  if (activeId === 'notes') {
    return (
      <EmbeddedToolShell variant="plain">
        <NotesPageClient
          initialAuthUid={initialChatPlan.userId}
          initialReadOnlyMode={false}
        />
      </EmbeddedToolShell>
    );
  }

  if (activeId === 'messages') {
    return <InboxPage composePreset={inboxComposePreset} />;
  }

  if (activeId === 'leads') {
    return <LeadsPage />;
  }

  if (activeId === 'notifications') {
    return <AlertsPage />;
  }

  if (activeId === 'calendar') {
    return (
      <EmbeddedToolShell>
        <EnhancedCalendarClient
          initialAuthUid={initialChatPlan.userId}
          initialHasPaidAccess={Boolean(initialChatPlan.platformAccess ?? initialChatPlan.paidAccess)}
          initialPlanChecked
          initialHasReminderAccess={initialChatPlan.paidAccess}
          initialRemindersEnabled={false}
          lessRounded
        />
      </EmbeddedToolShell>
    );
  }

  if (activeId === 'settings') {
    return (
      <EmbeddedToolShell variant="plain">
        <Suspense fallback={null}>
          <SettingsPageClient initialBillingPlan={settingsPlan} dashboardHrefOverride={businessDashboardHref} mode="embedded" />
        </Suspense>
      </EmbeddedToolShell>
    );
  }

  if (activeId === 'feedback') {
    return (
      <EmbeddedToolShell variant="plain">
        <BusinessFeedbackPage />
      </EmbeddedToolShell>
    );
  }

  if (activeId === 'profile') {
    return <BusinessProfilePage />;
  }

  if (activeId === 'directory') {
    return <DirectoryClient mode="business" />;
  }

  return <SidebarPagePlaceholder activeId={activeId} />;
}

const THEME_KEY = 'mymckenzie-dash-theme';
const DASHBOARD_ACTIVE_ID_KEY = 'mymckenzie-business-dashboard-active-id';

export default function BusinessDashboardClient({ initialChatPlan, initialActiveId = 'home' }: BusinessDashboardClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeId, setActiveId] = useState(initialActiveId);
  const [leadsCount, setLeadsCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [alertsCount, setAlertsCount] = useState(0);
  const [alertsBusinessId, setAlertsBusinessId] = useState<string | null>(null);
  const [calendarCount, setCalendarCount] = useState(0);
  const [meetingsCount, setMeetingsCount] = useState(0);
  const [inboxComposePreset, setInboxComposePreset] = useState<InboxComposePreset>(null);
  const [meetingPreset, setMeetingPreset] = useState<{ clientName?: string; clientEmail?: string; context?: string } | null>(null);
  const [documentsCaseIdOverride, setDocumentsCaseIdOverride] = useState<string | null>(null);
  // Avoid hydration mismatches: always render "light" on the server + first client paint,
  // then sync the persisted theme after mount.
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const hasLocalThemePreferenceRef = useRef(false);
  const themeManuallyUpdatedRef = useRef(false);

  useEffect(() => {
    try {
      const persisted = localStorage.getItem(THEME_KEY);
      if (persisted === 'dark' || persisted === 'light') {
        hasLocalThemePreferenceRef.current = true;
        setTheme(persisted);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const urlSection = new URLSearchParams(window.location.search).get('section');
      if (urlSection && navItems.some((item) => item.id === urlSection)) return;
      const storedActiveId = localStorage.getItem(DASHBOARD_ACTIVE_ID_KEY);
      if (!storedActiveId) return;
      if (!navItems.some((item) => item.id === storedActiveId)) return;
      setActiveId(storedActiveId as NavItem['id']);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_ACTIVE_ID_KEY, activeId);
    } catch {
      // ignore
    }
  }, [activeId]);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (activeId === 'home') {
        url.searchParams.delete('section');
      } else {
        url.searchParams.set('section', activeId);
      }
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // ignore
    }
  }, [activeId]);

  useEffect(() => {
    let cancelled = false;

    const loadThemePreference = async () => {
      try {
        const response = await fetch('/api/user/preferences', { credentials: 'include', cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({}));
        const persistedTheme = payload?.theme === 'dark' || payload?.theme === 'light' ? payload.theme : null;
        if (!persistedTheme || cancelled || hasLocalThemePreferenceRef.current || themeManuallyUpdatedRef.current) return;
        try {
          localStorage.setItem(THEME_KEY, persistedTheme);
        } catch {
          // ignore
        }
        setTheme(persistedTheme);
      } catch {
        // ignore
      }
    };

    void loadThemePreference();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onScheduleMeeting = (event: Event) => {
      const custom = event as CustomEvent<{ clientName?: string; clientEmail?: string; context?: string }>;
      const clientName = String(custom.detail?.clientName || '').trim();
      const clientEmail = String(custom.detail?.clientEmail || '').trim();
      const context = String(custom.detail?.context || '').trim();
      setMeetingPreset({ clientName, clientEmail, context });
      setActiveId('video');
    };
    window.addEventListener('mymckenzie-schedule-meeting', onScheduleMeeting as EventListener);
    return () => window.removeEventListener('mymckenzie-schedule-meeting', onScheduleMeeting as EventListener);
  }, []);

  useEffect(() => {
    const onCompose = (event: Event) => {
      const custom = event as CustomEvent<{ to?: string; subject?: string; body?: string; caseId?: string; matterLabel?: string }>;
      const to = String(custom.detail?.to || '').trim();
      const subject = String(custom.detail?.subject || '').trim();
      const body = typeof custom.detail?.body === 'string' ? custom.detail.body : '';
      const caseId = String(custom.detail?.caseId || '').trim();
      const matterLabel = String(custom.detail?.matterLabel || '').trim();
      if (!to) return;
      setInboxComposePreset({ to, subject, body, caseId, matterLabel });
      setActiveId('messages');
    };
    window.addEventListener('mymckenzie-inbox-compose', onCompose as EventListener);
    return () => window.removeEventListener('mymckenzie-inbox-compose', onCompose as EventListener);
  }, []);

  useEffect(() => {
    const onOpenDocuments = (event: Event) => {
      const custom = event as CustomEvent<{ caseId?: string }>;
      const caseId = String(custom.detail?.caseId || '').trim();
      if (!caseId) return;
      setDocumentsCaseIdOverride(caseId);
      setActiveId('documents');
    };
    const onClearDocumentsFilter = () => setDocumentsCaseIdOverride(null);
    window.addEventListener(BUSINESS_OPEN_DOCUMENTS_EVENT, onOpenDocuments as EventListener);
    window.addEventListener(BUSINESS_CLEAR_DOCUMENTS_FILTER_EVENT, onClearDocumentsFilter as EventListener);
    return () => {
      window.removeEventListener(BUSINESS_OPEN_DOCUMENTS_EVENT, onOpenDocuments as EventListener);
      window.removeEventListener(BUSINESS_CLEAR_DOCUMENTS_FILTER_EVENT, onClearDocumentsFilter as EventListener);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRootTheme = root.getAttribute('data-theme');
    const previousBodyTheme = body.getAttribute('data-theme');
    const previousRootColorScheme = root.style.colorScheme;
    const previousBodyColorScheme = body.style.colorScheme;

    root.dataset.theme = theme;
    body.dataset.theme = theme;
    root.style.colorScheme = theme;
    body.style.colorScheme = theme;

    return () => {
      if (previousRootTheme === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', previousRootTheme);
      if (previousBodyTheme === null) body.removeAttribute('data-theme');
      else body.setAttribute('data-theme', previousBodyTheme);
      root.style.colorScheme = previousRootColorScheme;
      body.style.colorScheme = previousBodyColorScheme;
    };
  }, [theme]);

  useEffect(() => {
    const syncAlertsFromStorage = () => {
      const cachedAlerts = loadStoredAlerts()
      setAlertsCount(countUnreadAlerts(cachedAlerts))
    }

    syncAlertsFromStorage()

    const fetchCounts = async () => {
      try {
        const [leadsResponse, calendarResponse, alertsResponse, meetingsResponse] = await Promise.all([
          fetch('/api/business/leads', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/calendar/alerts?windowDays=7', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/business/alerts', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/business/meetings', { credentials: 'include', cache: 'no-store' }),
        ]);

        if (leadsResponse.ok) {
          const data = await leadsResponse.json();
          const newLeads = (data.leads || []).filter((lead: any) => lead.status === 'new').length;
          setLeadsCount(newLeads);
        }

        if (calendarResponse.ok) {
          const data = await calendarResponse.json().catch(() => ({}));
          const deadlineCount = typeof data?.count === 'number' ? data.count : 0;
          setCalendarCount(deadlineCount);
        }

        if (alertsResponse.ok) {
          const data = await alertsResponse.json().catch(() => ({}));
          const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
          const nextBusinessId = typeof data?.businessId === 'string' ? data.businessId : '';
          if (nextBusinessId) {
            setAlertsBusinessId(nextBusinessId);
          }
          setAlertsCount(alerts.filter((alert: any) => !alert?.read).length);
        }

        if (meetingsResponse.ok) {
          const data = await meetingsResponse.json().catch(() => ({}));
          const meetings = Array.isArray(data?.meetings) ? data.meetings : [];
          setMeetingsCount(meetings.filter((meeting: any) => meeting.status === 'scheduled' || meeting.status === 'in_progress').length);
        }
      } catch (error) {
        console.error('Failed to fetch business notification counts:', error);
      }

      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) {
          setInboxCount(0);
          return;
        }
        const { count } = await supabase
          .from('inbox_messages')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_email', user.email)
          .eq('is_read', false)
          .is('deleted_at', null);
        setInboxCount(typeof count === 'number' ? count : 0);
      } catch {
        setInboxCount(0);
      }
    };

    void fetchCounts();
    const onAlertsUpdated = (event?: Event) => {
      const unreadCount = (event as CustomEvent<{ unreadCount?: number }> | undefined)?.detail?.unreadCount;
      if (typeof unreadCount === 'number') {
        setAlertsCount(unreadCount);
        return;
      }

      void fetch('/api/business/alerts', { credentials: 'include', cache: 'no-store' })
        .then((r) => r.json().catch(() => ({})))
        .then((data) => {
          const alerts = Array.isArray((data as any)?.alerts) ? (data as any).alerts : [];
          setAlertsCount(alerts.filter((alert: any) => !alert?.read).length);
        })
        .catch(() => {});
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== BUSINESS_ALERTS_STORAGE_KEY) return;
      syncAlertsFromStorage();
    };
    const onMeetingsUpdated = () => { void fetchCounts(); };
    window.addEventListener(BUSINESS_ALERTS_UPDATED_EVENT, onAlertsUpdated as EventListener);
    window.addEventListener('storage', onStorage);
    window.addEventListener(BUSINESS_MEETINGS_UPDATED_EVENT, onMeetingsUpdated as EventListener);
    const refreshTimer = window.setInterval(() => {
      void fetchCounts();
    }, 60000);
    return () => {
      window.removeEventListener(BUSINESS_ALERTS_UPDATED_EVENT, onAlertsUpdated as EventListener);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(BUSINESS_MEETINGS_UPDATED_EVENT, onMeetingsUpdated as EventListener);
      window.clearInterval(refreshTimer);
    };
  }, []);

  useEffect(() => {
    if (!alertsBusinessId) return;

    const supabase = getSupabaseBrowserClient();
    const channelName = `business-alerts-${alertsBusinessId}`;
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshAlerts = async () => {
      try {
        const response = await fetch('/api/business/alerts', { credentials: 'include', cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || disposed) return;
        const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
        const unreadCount = alerts.filter((alert: any) => !alert?.read).length;
        setAlertsCount(unreadCount);
        dispatchBusinessAlertsRefresh({ alerts, unreadCount });
      } catch {
        // ignore live refresh failures; the dashboard still has the last known state
      }
    };

    const scheduleRefresh = () => {
      if (disposed || refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refreshAlerts();
      }, 250);
    };

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'business_alerts',
        filter: `business_id=eq.${alertsBusinessId}`,
      }, () => {
        scheduleRefresh();
      })
      .subscribe();

    return () => {
      disposed = true;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      void channel.unsubscribe();
    };
  }, [alertsBusinessId]);

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light';
      themeManuallyUpdatedRef.current = true;
      hasLocalThemePreferenceRef.current = true;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Storage can be unavailable in private browsing; the in-memory toggle should still work.
      }
      void fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ theme: next }),
      }).catch(() => {});
      return next;
    });
  };

  return (
    <main className={`${styles.shell} ${theme === 'dark' ? styles.darkShell : ''}`} data-theme={theme}>
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarCollapsed}`}>
        
        <nav className={styles.navList} aria-label="Business workspace">
          {sidebarOpen && (
            <div className={styles.navGroupHeader}>
              <div className={styles.navGroupLabel}>MyMcKenzieCS Workspace</div>
              <button
                type="button"
                className={styles.collapseButton}
                onClick={() => setSidebarOpen(false)}
                aria-label="Collapse sidebar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeId;
            const count =
              item.id === 'leads'
                ? leadsCount
                : item.id === 'messages'
                  ? inboxCount
                : item.id === 'notifications'
                  ? alertsCount
                : item.id === 'calendar'
                  ? calendarCount
                : item.id === 'video'
                  ? meetingsCount
                  : item.count;
            const hasCount = typeof count === 'number' ? count > 0 : Boolean(count);
            const countLabel = typeof count === 'number' && count > 99 ? '99+' : count;
            return (
            <button
              key={item.id}
              type="button"
              className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
              onClick={() => {
                if (item.id === 'documents') setDocumentsCaseIdOverride(null);
                setActiveId(item.id);
              }}
              title={!sidebarOpen ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} />
              {sidebarOpen && (
                <>
                  <span className={styles.navText}>
                    <span className={styles.navLabel}>{item.label}</span>
                    <span className={styles.navDescription}>{item.description}</span>
                  </span>
                  {hasCount && <span className={styles.navCount}>{countLabel}</span>}
                </>
              )}
            </button>
          );
        })}
        </nav>

        {/* Theme toggle */}
        <div className={styles.sidebarThemeToggle}>
          <button
            type="button"
            className={styles.themeToggleBtn}
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {sidebarOpen && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          </button>
        </div>
      </aside>

      {/* Floating expand button when sidebar is collapsed */}
      {!sidebarOpen && (
        <button
          type="button"
          className={styles.floatingExpandButton}
          onClick={() => setSidebarOpen(true)}
          aria-label="Expand sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <section className={styles.workspace}>
        {activeId === 'home' ? (
          <BusinessChatWorkspace initialChatPlan={initialChatPlan} />
        ) : (
          <div className={styles.pageWorkspace}>
              <BusinessWorkspacePage
                activeId={activeId}
                initialChatPlan={initialChatPlan}
                inboxComposePreset={inboxComposePreset}
                documentsCaseIdOverride={documentsCaseIdOverride}
                meetingPreset={meetingPreset}
                onMeetingPresetConsumed={() => setMeetingPreset(null)}
              />
          </div>
        )}
      </section>
    </main>
  );
}
