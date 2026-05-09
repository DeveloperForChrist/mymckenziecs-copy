'use client';

import { useState } from 'react';
import {
  Bell,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  FolderOpen,
  Home,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  UserRound,
  UsersRound,
  Video,
} from 'lucide-react';
import ChatInterface from '@/components/chatbot/ChatInterface';
import type { InitialChatPlanState } from '@/components/chatbot/hooks/useChatAuthPlan';
import styles from './businessDashboard.module.css';

type NavItem = {
  id: string;
  label: string;
  description: string;
  icon: typeof Home;
  count?: string;
};

type CardItem = {
  id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  tags?: string[];
  assignee?: string;
  date?: string;
  dueDate?: string;
  progress?: number;
  count?: string;
  subItems?: string[];
};

type PageDefinition = {
  title: string;
  subtitle: string;
  statTiles: Array<{ label: string; value: string }>;
  sections: Array<{
    heading: string;
    items: CardItem[];
  }>;
};

const navItems: NavItem[] = [
  {
    id: 'home',
    label: 'Assistant',
    description: 'Business chat assistant',
    icon: Bot,
  },
  {
    id: 'clients',
    label: 'Client Matters',
    description: 'Client cases and profiles',
    icon: BriefcaseBusiness,
    count: '12',
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'Bundles, evidence, and templates',
    icon: FolderOpen,
  },
  {
    id: 'leads',
    label: 'Leads',
    description: 'Enquiries, intake, and follow-ups',
    icon: UserRound,
    count: '8',
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
    label: 'Client Messages',
    description: 'Client and matter conversations',
    icon: MessageSquare,
    count: '5',
  },
  {
    id: 'assignments',
    label: 'Tasks',
    description: 'Tasks, owners, and due dates',
    icon: CalendarClock,
    count: '14',
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
];

const pageDefinitions: Record<NavItem['id'], PageDefinition> = {
  home: {
    title: 'Assistant',
    subtitle: 'Your business chat assistant for casework, client support, and team coordination.',
    statTiles: [
      { label: 'Recent sessions', value: '14' },
      { label: 'Resolved prompts', value: '97%' },
      { label: 'Daily usage', value: '3.2h' },
    ],
    sections: [
      {
        heading: 'Assistant overview',
        items: [
          {
            id: '1',
            title: 'AI-driven business guidance',
            description: 'Get instant legal advice on matters, contracts, and strategy',
          },
          {
            id: '2',
            title: 'Fast document summaries',
            description: 'Summarize briefs, contracts, and evidence in seconds',
          },
          {
            id: '3',
            title: 'Client engagement insights',
            description: 'Analyze communications and suggest follow-up actions',
          },
        ],
      },
    ],
  },
  clients: {
    title: 'Client Matters',
    subtitle: 'Organize matters, assign owners, and monitor progress across your busiest clients.',
    statTiles: [
      { label: 'Open matters', value: '32' },
      { label: 'New clients', value: '6' },
      { label: 'Critical cases', value: '4' },
    ],
    sections: [
      {
        heading: 'Active matters requiring attention',
        items: [
          {
            id: 'c1',
            title: 'ACME Corp v. State Regulatory Board',
            description: 'Administrative law — discovery phase',
            status: 'In Discovery',
            priority: 'critical',
            dueDate: 'May 18, 2026',
            assignee: 'Sarah Mitchell',
            tags: ['discovery', 'regulatory', 'urgent'],
          },
          {
            id: 'c2',
            title: 'Kingston Family Trust Review & Restructuring',
            description: 'Estate planning — compliance audit',
            status: 'In Review',
            priority: 'high',
            dueDate: 'May 25, 2026',
            assignee: 'James Park',
            tags: ['estate', 'planning', 'compliance'],
          },
          {
            id: 'c3',
            title: 'Estate Planning Onboarding — New Client',
            description: 'Client intake and initial consultation',
            status: 'Intake',
            priority: 'normal',
            dueDate: 'May 22, 2026',
            assignee: 'Unassigned',
            tags: ['new-client', 'intake'],
          },
          {
            id: 'c4',
            title: 'Johnson Commercial Lease Negotiation',
            description: 'Retail space lease — 5-year term',
            status: 'Negotiating',
            priority: 'high',
            dueDate: 'May 20, 2026',
            assignee: 'Emma Rodriguez',
            tags: ['commercial', 'leasing'],
          },
        ],
      },
    ],
  },
  documents: {
    title: 'Documents',
    subtitle: 'Browse bundles, evidence, and templates with secure document controls.',
    statTiles: [
      { label: 'Active documents', value: '88' },
      { label: 'Templates', value: '12' },
      { label: 'Pending review', value: '9' },
    ],
    sections: [
      {
        heading: 'Recent uploads & bundles',
        items: [
          {
            id: 'd1',
            title: 'Client Agreement — Standard Terms',
            description: 'Engagement letter template — updated Q2 2026',
            status: 'Active',
            date: 'May 8, 2026',
            tags: ['template', 'engagement'],
          },
          {
            id: 'd2',
            title: 'Witness Statement Bundle',
            description: '3 witness depositions + analysis summary',
            status: 'Review Pending',
            priority: 'high',
            date: 'May 7, 2026',
            tags: ['evidence', 'discovery'],
          },
          {
            id: 'd3',
            title: 'Evidence Bundle #7 — ACME Case',
            description: '48 documents organized by category',
            status: 'Active',
            date: 'May 6, 2026',
            progress: 87,
            tags: ['evidence', 'litigation'],
          },
          {
            id: 'd4',
            title: 'Trust Amendment Documentation',
            description: 'Beneficiary updates and codicils',
            status: 'Draft',
            priority: 'normal',
            date: 'May 5, 2026',
            tags: ['estate', 'trust'],
          },
        ],
      },
      {
        heading: 'Available templates',
        items: [
          {
            id: 'd5',
            title: 'Standard Engagement Letter',
            description: 'General legal services engagement',
          },
          {
            id: 'd6',
            title: 'NDA Template',
            description: 'Non-disclosure agreement — mutual',
          },
          {
            id: 'd7',
            title: 'Power of Attorney',
            description: 'General financial power of attorney',
          },
        ],
      },
    ],
  },
  leads: {
    title: 'Leads',
    subtitle: 'Track enquiries, intake status, and follow-up tasks in one place.',
    statTiles: [
      { label: 'New leads', value: '8' },
      { label: 'Hot prospects', value: '3' },
      { label: 'Follow-ups needed', value: '15' },
    ],
    sections: [
      {
        heading: 'Lead pipeline',
        items: [
          {
            id: 'l1',
            title: 'TechStart Industries',
            description: 'Corporate formation and IP protection',
            status: 'Hot Lead',
            priority: 'high',
            date: 'May 8, 2026',
            tags: ['startup', 'corporate'],
          },
          {
            id: 'l2',
            title: 'Individual — Real Estate Purchase',
            description: 'Residential home purchase — needs review',
            status: 'Qualified',
            priority: 'normal',
            date: 'May 7, 2026',
            tags: ['real-estate'],
          },
          {
            id: 'l3',
            title: 'Smith Manufacturing',
            description: 'Contract review and negotiation support',
            status: 'Initial Consultation',
            priority: 'normal',
            dueDate: 'May 16, 2026',
            date: 'May 4, 2026',
            tags: ['commercial'],
          },
        ],
      },
    ],
  },
  video: {
    title: 'Client Meetings',
    subtitle: 'Prepare and review upcoming consultations, rooms, and meeting follow-ups.',
    statTiles: [
      { label: 'Upcoming calls', value: '5' },
      { label: 'Scheduled rooms', value: '2' },
      { label: 'Meeting minutes', value: '18' },
    ],
    sections: [
      {
        heading: 'Scheduled meetings',
        items: [
          {
            id: 'v1',
            title: 'ACME Corp — Status Update Call',
            description: 'Discuss discovery progress and timeline',
            date: 'May 9, 2026',
            dueDate: '11:00 AM',
            assignee: 'Sarah Mitchell',
            tags: ['litigation', 'discovery'],
          },
          {
            id: 'v2',
            title: 'Kingston Family — Trust Strategy Session',
            description: 'Review restructuring options and tax implications',
            date: 'May 9, 2026',
            dueDate: '2:30 PM',
            assignee: 'James Park',
            tags: ['estate', 'planning'],
          },
          {
            id: 'v3',
            title: 'Internal Team Prep — New Business Development',
            description: 'Q2 targets and pipeline review',
            date: 'May 9, 2026',
            dueDate: '4:00 PM',
            assignee: 'Team',
            tags: ['internal'],
          },
        ],
      },
    ],
  },
  team: {
    title: 'Team',
    subtitle: 'Manage roles, visibility, and handovers for your practice team.',
    statTiles: [
      { label: 'Team members', value: '18' },
      { label: 'Active owners', value: '11' },
      { label: 'New invites', value: '2' },
    ],
    sections: [
      {
        heading: 'Team directory & roles',
        items: [
          {
            id: 't1',
            title: 'Sarah Mitchell',
            description: 'Senior Litigator — Litigation Practice Lead',
            status: 'Active',
            tags: ['litigation', 'partner'],
          },
          {
            id: 't2',
            title: 'James Park',
            description: 'Estate & Tax Counsel — Trust Management Specialist',
            status: 'Active',
            tags: ['estates', 'tax'],
          },
          {
            id: 't3',
            title: 'Emma Rodriguez',
            description: 'Associate — Commercial & Real Estate',
            status: 'Active',
            tags: ['commercial', 'real-estate'],
          },
          {
            id: 't4',
            title: 'Maria Chen',
            description: 'Paralegal — Litigation Support',
            status: 'Active',
            tags: ['paralegal', 'litigation'],
          },
        ],
      },
      {
        heading: 'Pending team actions',
        items: [
          {
            id: 't5',
            title: 'Onboarding Review — New Associate',
            description: 'Complete systems access and orientation',
            priority: 'high',
            dueDate: 'May 16, 2026',
          },
          {
            id: 't6',
            title: 'Role Updates Pending Approval',
            description: 'Scope changes for 2 team members',
            priority: 'normal',
            dueDate: 'May 20, 2026',
          },
        ],
      },
    ],
  },
  messages: {
    title: 'Client Messages',
    subtitle: 'View client conversations and respond to urgent threads quickly.',
    statTiles: [
      { label: 'Unread messages', value: '5' },
      { label: 'Open threads', value: '14' },
      { label: 'Avg response time', value: '24m' },
    ],
    sections: [
      {
        heading: 'Recent threads',
        items: [
          {
            id: 'm1',
            title: 'ACME Corp — Case Update',
            description: 'Client seeking status on discovery deadline',
            status: 'Unread',
            priority: 'high',
            date: 'May 9, 2026',
            tags: ['litigation', 'urgent'],
          },
          {
            id: 'm2',
            title: 'Kingston Family — Document Request',
            description: 'Requesting prior year tax returns for review',
            status: 'Awaiting Response',
            priority: 'normal',
            date: 'May 8, 2026',
            tags: ['estate'],
          },
          {
            id: 'm3',
            title: 'Johnson Lease — Meeting Follow-up',
            description: 'Client ready to discuss final terms',
            status: 'Open',
            priority: 'high',
            date: 'May 8, 2026',
            tags: ['commercial'],
          },
        ],
      },
    ],
  },
  assignments: {
    title: 'Tasks',
    subtitle: 'Keep track of deadlines, owners, and due dates across the practice.',
    statTiles: [
      { label: 'Open tasks', value: '14' },
      { label: 'Due today', value: '5' },
      { label: 'Overdue', value: '2' },
    ],
    sections: [
      {
        heading: 'Priority tasks',
        items: [
          {
            id: 'a1',
            title: 'Finalize discovery filing — ACME case',
            description: 'Complete responsive document analysis',
            status: 'In Progress',
            priority: 'critical',
            dueDate: 'May 9, 2026',
            assignee: 'Sarah Mitchell',
            progress: 72,
            tags: ['litigation', 'discovery'],
          },
          {
            id: 'a2',
            title: 'Review deposition notes — transcript analysis',
            description: 'Summarize key testimony for trial prep',
            status: 'Pending',
            priority: 'high',
            dueDate: 'May 11, 2026',
            assignee: 'Maria Chen',
            tags: ['litigation'],
          },
          {
            id: 'a3',
            title: 'Send client update — Kingston Family',
            description: 'Monthly status report and tax planning summary',
            status: 'Pending',
            priority: 'normal',
            dueDate: 'May 10, 2026',
            assignee: 'James Park',
            tags: ['estate', 'client-communication'],
          },
          {
            id: 'a4',
            title: 'Lease amendment — Johnson Commercial',
            description: 'Final review and signature preparation',
            status: 'In Review',
            priority: 'high',
            dueDate: 'May 12, 2026',
            assignee: 'Emma Rodriguez',
            tags: ['commercial'],
          },
        ],
      },
    ],
  },
  notifications: {
    title: 'Alerts',
    subtitle: 'Stay on top of business and client notifications in real time.',
    statTiles: [
      { label: 'New alerts', value: '7' },
      { label: 'Critical', value: '2' },
      { label: 'Resolved', value: '19' },
    ],
    sections: [
      {
        heading: 'Active alerts',
        items: [
          {
            id: 'n1',
            title: 'URGENT: Filing deadline approaching',
            description: 'ACME v. State — discovery response due May 9',
            priority: 'critical',
            status: 'Alert',
            date: 'May 9, 2026',
            tags: ['deadline', 'litigation'],
          },
          {
            id: 'n2',
            title: 'Client portal access — New invite pending',
            description: '1 client waiting for portal access grant',
            priority: 'high',
            status: 'Alert',
            date: 'May 8, 2026',
            tags: ['client-access'],
          },
          {
            id: 'n3',
            title: 'Billing update — Monthly reconciliation ready',
            description: 'April 2026 billing completed — ready for approval',
            priority: 'normal',
            status: 'Alert',
            date: 'May 8, 2026',
            tags: ['billing'],
          },
          {
            id: 'n4',
            title: 'Security notice — New device login detected',
            description: 'Verify login from new location',
            priority: 'normal',
            status: 'Alert',
            date: 'May 7, 2026',
            tags: ['security'],
          },
        ],
      },
    ],
  },
  portals: {
    title: 'Client Portals',
    subtitle: 'Manage secure client-facing workspaces and shared case files.',
    statTiles: [
      { label: 'Active portals', value: '12' },
      { label: 'Invites pending', value: '5' },
      { label: 'Access waiting', value: '1' },
    ],
    sections: [
      {
        heading: 'Client portal status',
        items: [
          {
            id: 'p1',
            title: 'ACME Corporation Portal',
            description: 'Discovery documents, correspondence, and calendar',
            status: 'Active',
            date: 'Created Feb 2026',
            count: '47 docs',
            tags: ['litigation', 'active'],
          },
          {
            id: 'p2',
            title: 'Kingston Family Portal',
            description: 'Trust documents, tax planning materials, and notices',
            status: 'Active',
            date: 'Created Jan 2026',
            count: '23 docs',
            tags: ['estate', 'active'],
          },
          {
            id: 'p3',
            title: 'Johnson Commercial Portal',
            description: 'Lease drafts, negotiations, and amendments',
            status: 'Invite Pending',
            date: 'Created May 2026',
            count: '12 docs',
            tags: ['commercial', 'pending'],
          },
        ],
      },
    ],
  },
  'case-law': {
    title: 'Case Law DB',
    subtitle: 'Search authorities, save citations, and review precedent materials.',
    statTiles: [
      { label: 'Saved cases', value: '24' },
      { label: 'New citations', value: '7' },
      { label: 'Recent searches', value: '18' },
    ],
    sections: [
      {
        heading: 'Saved cases & authorities',
        items: [
          {
            id: 'k1',
            title: 'Smith v. State Board — Admin Law Precedent',
            description: 'Fifth Circuit — regulatory authority standards',
            date: 'Saved May 4, 2026',
            tags: ['regulatory', 'administrative-law'],
          },
          {
            id: 'k2',
            title: 'Baker v. Baker Trust Cases',
            description: 'Trust interpretation and beneficiary rights',
            date: 'Saved Apr 30, 2026',
            tags: ['trusts', 'estate'],
          },
          {
            id: 'k3',
            title: 'Williams Constitutional Filing — First Amendment',
            description: 'Commercial speech and regulatory compliance',
            date: 'Saved Apr 28, 2026',
            tags: ['constitutional', 'commercial'],
          },
        ],
      },
      {
        heading: 'Recent searches',
        items: [
          {
            id: 'k4',
            title: 'Discovery privilege waiver implications',
            description: '3 results found',
          },
          {
            id: 'k5',
            title: 'Trust situs transfer and tax liability',
            description: '8 results found',
          },
          {
            id: 'k6',
            title: 'Commercial lease termination rights',
            description: '12 results found',
          },
        ],
      },
    ],
  },
};

type BusinessDashboardClientProps = {
  initialChatPlan: InitialChatPlanState;
};

function renderPageContent(activeId: NavItem['id']) {
  const page = pageDefinitions[activeId];

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'critical':
        return 'rgba(236, 72, 153, 0.7)';
      case 'high':
        return 'rgba(147, 51, 234, 0.6)';
      case 'normal':
        return 'rgba(147, 51, 234, 0.4)';
      case 'low':
        return 'rgba(255, 255, 255, 0.2)';
      default:
        return 'transparent';
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'Critical':
      case 'Unread':
      case 'Alert':
        return 'rgba(236, 72, 153, 0.15)';
      case 'In Progress':
      case 'Active':
      case 'Hot Lead':
        return 'rgba(147, 51, 234, 0.15)';
      case 'In Discovery':
      case 'In Review':
        return 'rgba(167, 139, 250, 0.12)';
      default:
        return 'rgba(255, 255, 255, 0.05)';
    }
  };

  return (
    <div className={styles.pageContent}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.pageOverline}>Business workspace</div>
          <h1 className={styles.pageTitle}>{page.title}</h1>
          <p className={styles.pageSubtitle}>{page.subtitle}</p>
        </div>
        <button type="button" className={styles.pageAction}>
          New {page.title}
        </button>
      </header>

      <div className={styles.statGrid}>
        {page.statTiles.map((tile) => (
          <div key={tile.label} className={styles.statCard}>
            <span className={styles.statLabel}>{tile.label}</span>
            <strong className={styles.statValue}>{tile.value}</strong>
          </div>
        ))}
      </div>

      <div className={styles.pageSections}>
        {page.sections.map((section) => (
          <section key={section.heading} className={styles.pageSection}>
            <h2 className={styles.sectionHeading}>{section.heading}</h2>
            <div className={styles.cardGrid}>
              {section.items.map((item) => (
                <div
                  key={item.id}
                  className={styles.card}
                  style={{ borderLeftColor: getPriorityColor(item.priority) }}
                >
                  <div className={styles.cardHeader}>
                    <div className={styles.cardTitle}>{item.title}</div>
                    {item.status && (
                      <div
                        className={styles.cardStatus}
                        style={{ backgroundColor: getStatusColor(item.status) }}
                      >
                        {item.status}
                      </div>
                    )}
                  </div>

                  {item.description && (
                    <p className={styles.cardDescription}>{item.description}</p>
                  )}

                  {item.progress !== undefined && (
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${item.progress}%` }}
                      />
                      <span className={styles.progressLabel}>{item.progress}%</span>
                    </div>
                  )}

                  <div className={styles.cardMeta}>
                    {item.assignee && (
                      <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Owner:</span>
                        <span className={styles.metaValue}>{item.assignee}</span>
                      </div>
                    )}
                    {(item.dueDate || item.date) && (
                      <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>
                          {item.dueDate ? 'Due:' : 'Date:'}
                        </span>
                        <span className={styles.metaValue}>
                          {item.dueDate || item.date}
                        </span>
                      </div>
                    )}
                    {item.count && (
                      <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Items:</span>
                        <span className={styles.metaValue}>{item.count}</span>
                      </div>
                    )}
                  </div>

                  {item.tags && item.tags.length > 0 && (
                    <div className={styles.tagGroup}>
                      {item.tags.map((tag) => (
                        <span key={tag} className={styles.tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.subItems && item.subItems.length > 0 && (
                    <ul className={styles.subItemList}>
                      {item.subItems.map((subItem) => (
                        <li key={subItem} className={styles.subItem}>
                          {subItem}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function BusinessDashboardClient({ initialChatPlan }: BusinessDashboardClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeId, setActiveId] = useState('home');

  return (
    <main className={styles.shell}>
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarCollapsed}`}>
        <div className={styles.sidebarTop}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setSidebarOpen((current) => !current)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          </button>
          <div className={styles.brandMark}>
            <Bot size={21} />
          </div>
          {sidebarOpen && (
            <div>
              <div className={styles.brandName}>MyMcKenzieCS</div>
              <div className={styles.brandMeta}>Business</div>
            </div>
          )}
        </div>

        <nav className={styles.navList} aria-label="Business workspace">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                onClick={() => setActiveId(item.id)}
                title={!sidebarOpen ? item.label : undefined}
              >
                <Icon size={20} />
                {sidebarOpen && (
                  <>
                    <span className={styles.navText}>
                      <span className={styles.navLabel}>{item.label}</span>
                      <span className={styles.navDescription}>{item.description}</span>
                    </span>
                    {item.count && <span className={styles.navCount}>{item.count}</span>}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.footerAction}>
            <Bot size={16} />
            {sidebarOpen && <span>Premium + chatbot</span>}
          </div>
        </div>
      </aside>

      <section className={styles.workspace}>
        {activeId === 'home' ? (
          <div className={styles.chatWorkspace}>
            <div className={styles.chatbotFrame}>
              <ChatInterface initialAuthPlan={initialChatPlan} />
            </div>
          </div>
        ) : (
          <div className={styles.pageWorkspace}>
            {renderPageContent(activeId)}
          </div>
        )}
      </section>
    </main>
  );
}
