'use client';

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
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
  ShieldCheck,
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
import TeamPage from './TeamPage';
import ClientMattersPage from './ClientMattersPage';
import BusinessProfilePage from './BusinessProfilePage';
import DirectoryClient from '@/components/directory/DirectoryClient';
import ChatConversationHistory from '@/components/chatbot/ChatConversationHistory';
import DeleteConversationModal from '@/components/chatbot/DeleteConversationModal';
import type { InitialChatPlanState } from '@/components/chatbot/hooks/useChatAuthPlan';
import CaseLawSearchPageClient from '@/components/dashboard/CaseLawSearchPageClient';
import DocumentsClientNew from '@/components/dashboard/DocumentsClientNew';
import EnhancedCalendarClient from '@/components/dashboard/EnhancedCalendarClient';
import NotesPageClient from '@/components/dashboard/NotesPageClient';
import SettingsPageClient from '@/components/settings/SettingsPageClient';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import HostedVideoMeeting from '@/components/video/HostedVideoMeeting';
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
    label: 'MyMcKenzieCS Assistant',
    description: 'Business chat assistant',
    icon: Bot,
  },
  {
    id: 'clients',
    label: 'Client Matters',
    description: 'Client cases and profiles',
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
    id: 'team',
    label: 'Team',
    description: 'Roles, visibility, and handovers',
    icon: UsersRound,
  },
  {
    id: 'messages',
    label: 'Inbox',
    description: 'Client and matter conversations',
    icon: MessageSquare,
  },
  {
    id: 'notifications',
    label: 'Alerts',
    description: 'Alerts across clients and teams',
    icon: Bell,
  },
  {
    id: 'portals',
    label: 'Client Portals',
    description: 'Secure client-facing workspaces',
    icon: ShieldCheck,
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
];

type BusinessDashboardClientProps = {
  initialChatPlan: InitialChatPlanState;
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
    window.location.href = `${next.pathname}${next.search}${next.hash}`;
  };

  const startNewChat = () => {
    const next = new URL(businessChatHref, window.location.origin);
    next.searchParams.set('new', 'true');
    window.location.href = `${next.pathname}${next.search}${next.hash}`;
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
          <span className={styles.businessChatTitle}>MyMcKenzieCS Assistant</span>
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
}: {
  activeId: NavItem['id'];
  initialChatPlan: InitialChatPlanState;
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

  if (activeId === 'video') return <VideoCallPanel userId={initialChatPlan.userId} />;

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
          dashboardHrefOverride={businessDashboardHref}
        />
      </EmbeddedToolShell>
    );
  }

  if (activeId === 'messages') {
    return <InboxPage />;
  }

  if (activeId === 'leads') {
    return <LeadsPage />;
  }

  if (activeId === 'notifications') {
    return <AlertsPage />;
  }

  if (activeId === 'team') {
    return <TeamPage />;
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
        />
      </EmbeddedToolShell>
    );
  }

  if (activeId === 'settings') {
    return (
      <EmbeddedToolShell variant="plain">
        <Suspense fallback={null}>
          <SettingsPageClient initialBillingPlan={settingsPlan} dashboardHrefOverride={businessDashboardHref} />
        </Suspense>
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

export default function BusinessDashboardClient({ initialChatPlan }: BusinessDashboardClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeId, setActiveId] = useState('home');
  const [leadsCount, setLeadsCount] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

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
    const fetchLeadsCount = async () => {
      try {
        const response = await fetch('/api/business/leads', { credentials: 'include', cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          const newLeads = (data.leads || []).filter((lead: any) => lead.status === 'new').length;
          setLeadsCount(newLeads);
        }
      } catch (error) {
        console.error('Failed to fetch leads count:', error);
      }
    };

    fetchLeadsCount();
    const interval = setInterval(fetchLeadsCount, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Storage can be unavailable in private browsing; the in-memory toggle should still work.
      }
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
            const count = item.id === 'leads' ? leadsCount : item.count;
            return (
            <button
              key={item.id}
              type="button"
              className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
              onClick={() => setActiveId(item.id)}
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
                  {count && count > 0 && <span className={styles.navCount}>{count}</span>}
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
            <BusinessWorkspacePage activeId={activeId} initialChatPlan={initialChatPlan} />
          </div>
        )}
      </section>
    </main>
  );
}
