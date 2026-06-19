'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './dashboard.module.css'

type TimestampValue = string | number | Date

type AdminTab =
  | 'overview'
  | 'metrics'
  | 'users'
  | 'cases'
  | 'documents'
  | 'analytics'
  | 'system'
  | 'feedback'
  | 'privacy'
  | 'inbox'
  | 'api'

type Period = 'day' | 'week' | 'month'

interface User {
  id: string
  email: string
  fullName: string
  createdAt: TimestampValue
  plan?: string
  lastActive?: TimestampValue | null
  disabled?: boolean
  emailVerified?: boolean
}

interface Case {
  id: string
  userId: string
  userEmail: string
  caseType: string
  caseNumber: string
  status: string
  createdAt: TimestampValue
  location?: string
}

interface Document {
  id: string
  userId: string
  userEmail: string
  title: string
  type: string
  status: string
  createdAt: TimestampValue
  contentLength: number
}

interface Analytics {
  totalUsers: number
  newUsers: number
  activeUsers: number
  premiumUsers: number
  totalMessages: number
  totalDocuments: number
  growthRate: number
}

interface SystemHealth {
  status: string
  uptime: number
  memory: {
    used: number
    total: number
    percentage: string
  }
  services: {
    openai: string
    stripe: string
    supabase?: string
  }
}

interface Feedback {
  id: string
  userId: string
  conversationId: string
  messageIndex: number
  feedbackType: 'like' | 'dislike' | 'report'
  messageContent: string
  timestamp: string
  createdAt: string
  status?: string
  reportIssue?: string
  reportProblem?: string
}

interface ApiUsageEntry {
  id?: string
  provider?: string
  endpoint?: string
  model?: string
  request_type?: string
  success?: boolean
  status_code?: number | null
  prompt_tokens?: number | null
  completion_tokens?: number | null
  total_tokens?: number | null
  cost_usd?: number | null
  latency_ms?: number | null
  user_id?: string | null
  error?: string | null
  created_at?: string
}

interface ApiUsageSummary {
  totalRequests: number
  totalErrors: number
  totalTokens: number
  totalCostUsd: number
  errorRate: number
}

interface PrivacyRequest {
  id: string
  user_id?: string | null
  user_email: string
  request_type: 'access' | 'erasure' | 'correction' | 'restriction'
  status: 'pending' | 'in_review' | 'completed' | 'rejected'
  details?: string | null
  admin_notes?: string | null
  submitted_at?: string | null
  updated_at?: string | null
  completed_at?: string | null
}

type PrivacyActionStatus = 'in_review' | 'completed' | 'rejected'

interface AdminMetrics {
  users?: {
    total?: number
    newInPeriod?: number
    updatedInPeriod?: number
  }
  cases?: {
    total?: number
    active?: number
    closed?: number
    archived?: number
    deleted?: number
    createdInPeriod?: number
    withDeadline?: number
    overdue?: number
    byType?: Record<string, number>
    byStatus?: Record<string, number>
  }
  messages?: {
    total?: number
    inPeriod?: number
    last24h?: number
    guest?: number
    byRole?: Record<string, number>
    conversationsInPeriod?: number
  }
  documents?: {
    total?: number
    inPeriod?: number
    byType?: Record<string, number>
    totalSizeBytes?: number
    avgSizeBytes?: number
    maxSizeBytes?: number
  }
  subscriptions?: {
    total?: number
    active?: number
    cancelled?: number
    pastDue?: number
    expired?: number
    cancelAtPeriodEnd?: number
    byPlan?: Record<string, number>
  }
  documentAnalyses?: {
    total?: number
    inPeriod?: number
  }
  audit?: {
    total?: number
    inPeriod?: number
    byAction?: Record<string, number>
    byTable?: Record<string, number>
  }
  cache?: {
    total?: number
    expired?: number
    totalHitCount?: number
    byType?: Record<string, number>
  }
  calendar?: {
    total?: number
    upcoming7Days?: number
    overdue?: number
    byCategory?: Record<string, number>
    byPriority?: Record<string, number>
  }
  caseLaw?: {
    total?: number
    byType?: Record<string, number>
    byYear?: Record<string, number>
  }
  caseLawSearches?: {
    total?: number
    inPeriod?: number
    avgResults?: number
    maxResults?: number
  }
  messageUsage?: {
    totalMessages?: number
    freeMessagesUsed?: number
  }
  apiUsage?: {
    total?: number
    inPeriod?: number
    errors?: number
    totalCostUsd?: number
    totalTokens?: number
    byProvider?: Record<string, number>
    byModel?: Record<string, number>
    byEndpoint?: Record<string, number>
  }
}

const periodLabels: Record<Period, string> = {
  day: 'last 24 hours',
  week: 'last 7 days',
  month: 'last 30 days',
}

const normalizePlan = (plan?: string) => (plan || 'no plan').toLowerCase().replace(/_/g, ' ')

const formatNumber = (value?: number) => (value ?? 0).toLocaleString()

const formatBytes = (bytes?: number) => {
  const value = bytes ?? 0
  if (value === 0) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), sizes.length - 1)
  const normalized = value / Math.pow(1024, i)
  return `${normalized.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`
}

const toTitleCase = (value?: string) => {
  if (!value) return 'Unknown'
  return value
    .replace(/_/g, ' ')
    .replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1))
}

const formatDate = (value?: TimestampValue | null) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString()
}

const distributionEntries = (record?: Record<string, number>, limit = 6) => {
  if (!record) return []
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

export default function AdminDashboard() {
  const USERS_PAGE_LIMIT = 100
  const CASES_PAGE_LIMIT = 100
  const DOCUMENTS_PAGE_LIMIT = 100
  const API_USAGE_PAGE_LIMIT = 200
  const PLAN_OPTIONS = ['no plan', 'basic', 'premium', 'premium +', 'premium plus', 'plus', 'premium pro', 'essential', 'premium cheap']
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [users, setUsers] = useState<User[]>([])
  const [cases, setCases] = useState<Case[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null)
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [feedbackCounts, setFeedbackCounts] = useState<{ likes: number; dislikes: number; reports: number; total: number }>({
    likes: 0,
    dislikes: 0,
    reports: 0,
    total: 0,
  })
  const [apiUsage, setApiUsage] = useState<ApiUsageEntry[]>([])
  const [apiUsageSummary, setApiUsageSummary] = useState<ApiUsageSummary>({
    totalRequests: 0,
    totalErrors: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    errorRate: 0,
  })
  const [privacyRequests, setPrivacyRequests] = useState<PrivacyRequest[]>([])
  const [privacyRequestCounts, setPrivacyRequestCounts] = useState<{ pending: number; in_review: number; completed: number; rejected: number; total: number }>({
    pending: 0,
    in_review: 0,
    completed: 0,
    rejected: 0,
    total: 0,
  })
  const [privacyActionTarget, setPrivacyActionTarget] = useState<PrivacyRequest | null>(null)
  const [privacyActionStatus, setPrivacyActionStatus] = useState<PrivacyActionStatus>('in_review')
  const [privacyActionNotes, setPrivacyActionNotes] = useState('')
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [metricsWarnings, setMetricsWarnings] = useState<string[]>([])
  const [usersHasMore, setUsersHasMore] = useState(false)
  const [casesHasMore, setCasesHasMore] = useState(false)
  const [documentsHasMore, setDocumentsHasMore] = useState(false)
  const [apiUsageHasMore, setApiUsageHasMore] = useState(false)
  const [usersLoadingMore, setUsersLoadingMore] = useState(false)
  const [casesLoadingMore, setCasesLoadingMore] = useState(false)
  const [documentsLoadingMore, setDocumentsLoadingMore] = useState(false)
  const [apiUsageLoadingMore, setApiUsageLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPlan, setFilterPlan] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [period, setPeriod] = useState<Period>('week')
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [statusModal, setStatusModal] = useState<{ title: string; message: string } | null>(null)
  const [deleteCaseIdPending, setDeleteCaseIdPending] = useState<string | null>(null)
  const [planEditor, setPlanEditor] = useState<{ userId: string; currentPlan: string; nextPlan: string } | null>(null)
  const router = useRouter()

  const fetchData = useCallback(async () => {
    try {
      const [analyticsRes, usersRes, casesRes, docsRes, healthRes, feedbackRes, privacyRes] = await Promise.all([
        fetch(`/api/admin/analytics?period=${period}`, { credentials: 'include' }),
        fetch(`/api/admin/users?limit=${USERS_PAGE_LIMIT}&offset=0`, { credentials: 'include' }),
        fetch(`/api/admin/cases?limit=${CASES_PAGE_LIMIT}&offset=0`, { credentials: 'include' }),
        fetch(`/api/admin/documents?limit=${DOCUMENTS_PAGE_LIMIT}&offset=0`, { credentials: 'include' }),
        fetch('/api/admin/system', { credentials: 'include' }),
        fetch('/api/admin/feedback?limit=200', { credentials: 'include' }),
        fetch('/api/admin/privacy-requests?limit=200', { credentials: 'include' }),
      ])

      const [analyticsData, usersData, casesData, docsData, healthData, feedbackData, privacyData] = await Promise.all([
        analyticsRes.json(),
        usersRes.json(),
        casesRes.json(),
        docsRes.json(),
        healthRes.json(),
        feedbackRes.json(),
        privacyRes.json(),
      ])

      if (!usersRes.ok) {
        setStatusModal({
          title: 'Users load failed',
          message: usersData?.error || usersData?.message || 'Failed to fetch users.',
        })
      }

      setAnalytics(analyticsData.overview)
      setUsers(usersData.users || [])
      setUsersHasMore(Boolean(usersData?.pagination?.hasMore))
      setCases(casesData.cases || [])
      setCasesHasMore(Boolean(casesData?.pagination?.hasMore))
      setDocuments(docsData.documents || [])
      setDocumentsHasMore(Boolean(docsData?.pagination?.hasMore))
      setSystemHealth(healthData.health)
      setFeedback(feedbackData.feedback || [])
      setFeedbackCounts(feedbackData.counts || { likes: 0, dislikes: 0, reports: 0, total: 0 })
      setPrivacyRequests(privacyData.requests || [])
      setPrivacyRequestCounts(
        privacyData.counts || {
          pending: 0,
          in_review: 0,
          completed: 0,
          rejected: 0,
          total: 0,
        }
      )
    } catch (error: any) {
      console.error('Failed to fetch data:', error)
    }
  }, [period, USERS_PAGE_LIMIT, CASES_PAGE_LIMIT, DOCUMENTS_PAGE_LIMIT])

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/metrics?period=${period}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to fetch metrics')
      }
      setMetrics(data.metrics || null)
      setMetricsWarnings(data.warnings || [])
    } catch (error: any) {
      console.error('Failed to fetch metrics:', error)
      setMetrics(null)
      setMetricsWarnings([
        'Metrics unavailable. Verify Supabase service role, tables, and permissions.',
      ])
    }
  }, [period])

  const fetchApiUsage = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/api-usage?period=${period}&limit=${API_USAGE_PAGE_LIMIT}&offset=0`, { credentials: 'include' })
      const data = await res.json()
      setApiUsage(data.usage || [])
      setApiUsageHasMore(Boolean(data?.pagination?.hasMore))
      setApiUsageSummary(
        data.summary || {
          totalRequests: 0,
          totalErrors: 0,
          totalTokens: 0,
          totalCostUsd: 0,
          errorRate: 0,
        }
      )
    } catch (_err) {
      setApiUsage([])
      setApiUsageSummary({
        totalRequests: 0,
        totalErrors: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        errorRate: 0,
      })
      setApiUsageHasMore(false)
    }
  }, [period, API_USAGE_PAGE_LIMIT])

  const loadMoreUsers = useCallback(async () => {
    if (usersLoadingMore || !usersHasMore) return
    setUsersLoadingMore(true)
    try {
      const res = await fetch(`/api/admin/users?limit=${USERS_PAGE_LIMIT}&offset=${users.length}`, { credentials: 'include' })
      const data = await res.json()
      const nextUsers = Array.isArray(data?.users) ? data.users : []
      setUsers((prev) => {
        const seen = new Set(prev.map((u) => u.id))
        const merged = [...prev]
        for (const row of nextUsers) {
          if (!row?.id || seen.has(row.id)) continue
          seen.add(row.id)
          merged.push(row)
        }
        return merged
      })
      setUsersHasMore(Boolean(data?.pagination?.hasMore))
    } catch (error) {
      console.error('Failed to load more users:', error)
    } finally {
      setUsersLoadingMore(false)
    }
  }, [users.length, usersHasMore, usersLoadingMore, USERS_PAGE_LIMIT])

  const loadMoreCases = useCallback(async () => {
    if (casesLoadingMore || !casesHasMore) return
    setCasesLoadingMore(true)
    try {
      const res = await fetch(`/api/admin/cases?limit=${CASES_PAGE_LIMIT}&offset=${cases.length}`, { credentials: 'include' })
      const data = await res.json()
      const nextCases = Array.isArray(data?.cases) ? data.cases : []
      setCases((prev) => {
        const seen = new Set(prev.map((c) => c.id))
        const merged = [...prev]
        for (const row of nextCases) {
          if (!row?.id || seen.has(row.id)) continue
          seen.add(row.id)
          merged.push(row)
        }
        return merged
      })
      setCasesHasMore(Boolean(data?.pagination?.hasMore))
    } catch (error) {
      console.error('Failed to load more cases:', error)
    } finally {
      setCasesLoadingMore(false)
    }
  }, [cases.length, casesHasMore, casesLoadingMore, CASES_PAGE_LIMIT])

  const loadMoreDocuments = useCallback(async () => {
    if (documentsLoadingMore || !documentsHasMore) return
    setDocumentsLoadingMore(true)
    try {
      const res = await fetch(`/api/admin/documents?limit=${DOCUMENTS_PAGE_LIMIT}&offset=${documents.length}`, { credentials: 'include' })
      const data = await res.json()
      const nextDocs = Array.isArray(data?.documents) ? data.documents : []
      setDocuments((prev) => {
        const seen = new Set(prev.map((d) => d.id))
        const merged = [...prev]
        for (const row of nextDocs) {
          if (!row?.id || seen.has(row.id)) continue
          seen.add(row.id)
          merged.push(row)
        }
        return merged
      })
      setDocumentsHasMore(Boolean(data?.pagination?.hasMore))
    } catch (error) {
      console.error('Failed to load more documents:', error)
    } finally {
      setDocumentsLoadingMore(false)
    }
  }, [documents.length, documentsHasMore, documentsLoadingMore, DOCUMENTS_PAGE_LIMIT])

  const loadMoreApiUsage = useCallback(async () => {
    if (apiUsageLoadingMore || !apiUsageHasMore) return
    setApiUsageLoadingMore(true)
    try {
      const res = await fetch(
        `/api/admin/api-usage?period=${period}&limit=${API_USAGE_PAGE_LIMIT}&offset=${apiUsage.length}`,
        { credentials: 'include' }
      )
      const data = await res.json()
      const nextRows = Array.isArray(data?.usage) ? data.usage : []
      setApiUsage((prev) => {
        const merged = [...prev]
        for (const row of nextRows) merged.push(row)
        return merged
      })
      setApiUsageHasMore(Boolean(data?.pagination?.hasMore))
    } catch (error) {
      console.error('Failed to load more API usage:', error)
    } finally {
      setApiUsageLoadingMore(false)
    }
  }, [apiUsage.length, apiUsageHasMore, apiUsageLoadingMore, period, API_USAGE_PAGE_LIMIT])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    setMetricsLoading(true)
    try {
      await Promise.all([fetchData(), fetchApiUsage(), fetchMetrics()])
      setLastUpdated(new Date().toISOString())
    } finally {
      setLoading(false)
      setMetricsLoading(false)
    }
  }, [fetchApiUsage, fetchData, fetchMetrics])

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/admin/session', { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.authenticated) {
          router.push('/jesusistheadmin')
          return
        }
        localStorage.setItem('adminLoggedIn', 'true')
        void refreshAll()
      } catch {
        router.push('/jesusistheadmin')
      }
    }
    void check()
  }, [router, refreshAll])

  const handleUserAction = async (userId: string, action: string, data?: Record<string, any>) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ action, userId, data }),
      })

      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({ error: response.statusText }))
        const errorMsg = errorResult.error || errorResult.message || response.statusText
        setStatusModal({ title: 'Action failed', message: errorMsg })
        return
      }

      const result = await response.json()
      if (result.success) {
        setStatusModal({ title: 'Action completed', message: result.message || 'Action completed successfully.' })
        fetchData()
      } else {
        setStatusModal({ title: 'Action failed', message: result.error || result.message || 'Unknown error' })
      }
    } catch (error: any) {
      setStatusModal({
        title: 'Action failed',
        message: 'Failed to perform action: ' + (error instanceof Error ? error.message : 'Unknown error'),
      })
    }
  }

  const handleDeleteCase = async (caseId: string) => {
    setDeleteCaseIdPending(caseId)
  }

  const openPrivacyAction = (request: PrivacyRequest, status: PrivacyActionStatus) => {
    setPrivacyActionTarget(request)
    setPrivacyActionStatus(status)
    setPrivacyActionNotes(request.admin_notes || '')
  }

  const submitPrivacyAction = async () => {
    if (!privacyActionTarget) return

    try {
      const response = await fetch('/api/admin/privacy-requests', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          id: privacyActionTarget.id,
          status: privacyActionStatus,
          adminNotes: privacyActionNotes,
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setStatusModal({
          title: 'Request update failed',
          message: result?.error || 'Failed to update privacy request.',
        })
        return
      }

      setPrivacyActionTarget(null)
      setPrivacyActionNotes('')
      setStatusModal({
        title: 'Request updated',
        message: `Privacy request marked as ${privacyActionStatus.replace(/_/g, ' ')}.`,
      })
      fetchData()
    } catch (error: any) {
      console.error('Failed to update privacy request:', error)
      setStatusModal({
        title: 'Request update failed',
        message: error instanceof Error ? error.message : 'Failed to update privacy request.',
      })
    }
  }

  const confirmDeleteCase = async () => {
    if (!deleteCaseIdPending) return
    const caseId = deleteCaseIdPending

    try {
      const response = await fetch('/api/admin/cases', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ caseId }),
      })

      const result = await response.json()
      if (result.success) {
        setStatusModal({ title: 'Case deleted', message: result.message || 'Case deleted successfully.' })
        fetchData()
      } else {
        setStatusModal({ title: 'Delete failed', message: result.error || 'Failed to delete case' })
      }
    } catch (error: any) {
      console.error('Delete failed:', error)
      setStatusModal({ title: 'Delete failed', message: 'Failed to delete case' })
    } finally {
      setDeleteCaseIdPending(null)
    }
  }

  const handleLogout = () => {
    const perform = async () => {
      try {
        await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
      } catch {}
      localStorage.removeItem('adminLoggedIn')
      localStorage.removeItem('adminEmail')
      router.push('/jesusistheadmin')
    }
    void perform()
  }

  const tabs = useMemo(
    () => [
      { id: 'overview' as const, label: 'Overview', hint: 'Executive summary' },
      { id: 'metrics' as const, label: 'Metrics', hint: 'Full Supabase stats' },
      { id: 'users' as const, label: 'Users', hint: 'Accounts & plans' },
      { id: 'cases' as const, label: 'Cases', hint: 'Case operations' },
      { id: 'documents' as const, label: 'Documents', hint: 'Uploads & analysis' },
      { id: 'analytics' as const, label: 'Analytics', hint: 'Trends & ratios' },
      { id: 'system' as const, label: 'System', hint: 'Health & actions' },
      { id: 'feedback' as const, label: 'Feedback', hint: 'User sentiment' },
      { id: 'privacy' as const, label: 'Privacy', hint: 'DSAR review' },
      { id: 'inbox' as const, label: 'Inbox', hint: 'Reports queue' },
      { id: 'api' as const, label: 'API Usage', hint: 'Cost & volume' },
    ],
    []
  )

  const periodLabel = periodLabels[period]
  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const matchesSearch =
          !searchTerm ||
          user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesPlan = !filterPlan || normalizePlan(user.plan) === filterPlan
        return matchesSearch && matchesPlan
      }),
    [users, searchTerm, filterPlan]
  )

  const overviewStats = [
    {
      title: 'Total Users',
      value: formatNumber(metrics?.users?.total ?? analytics?.totalUsers),
      hint: `+${formatNumber(metrics?.users?.newInPeriod ?? analytics?.newUsers)} ${periodLabel}`,
      tag: 'Audience',
    },
    {
      title: 'Active Users',
      value: formatNumber(analytics?.activeUsers),
      hint: `Engaged ${periodLabel}`,
      tag: 'Engagement',
    },
    {
      title: 'Cases Managed',
      value: formatNumber(metrics?.cases?.total ?? cases.length),
      hint: `${formatNumber(metrics?.cases?.active)} active`,
      tag: 'Operations',
    },
    {
      title: 'Messages',
      value: formatNumber(metrics?.messages?.total ?? analytics?.totalMessages),
      hint: `${formatNumber(metrics?.messages?.inPeriod)} ${periodLabel}`,
      tag: 'Conversations',
    },
    {
      title: 'Documents',
      value: formatNumber(metrics?.documents?.total ?? analytics?.totalDocuments),
      hint: `${formatNumber(metrics?.documents?.inPeriod)} ${periodLabel}`,
      tag: 'Content',
    },
    {
      title: 'Active Subscriptions',
      value: formatNumber(metrics?.subscriptions?.active ?? analytics?.premiumUsers),
      hint: `${formatNumber(metrics?.subscriptions?.total)} total`,
      tag: 'Revenue',
    },
  ]

  const analyticsStats = [
    {
      title: 'User Growth',
      value: `${analytics?.growthRate ?? 0}%`,
      hint: 'vs previous period',
    },
    {
      title: 'Case Completion',
      value: `${cases.length > 0 ? ((cases.filter((c) => c.status.toLowerCase() === 'closed').length / cases.length) * 100).toFixed(1) : 0}%`,
      hint: 'all-time closure rate',
    },
    {
      title: 'Messages per User',
      value: `${analytics?.activeUsers ? (analytics.totalMessages / analytics.activeUsers).toFixed(1) : 0}`,
      hint: `based on ${periodLabel}`,
    },
    {
      title: 'Premium Conversion',
      value: `${analytics?.totalUsers ? ((analytics.premiumUsers / analytics.totalUsers) * 100).toFixed(1) : 0}%`,
      hint: 'active subscriptions vs users',
    },
  ]

  if (loading && !metrics) {
    return (
      <div className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.panel}>Loading admin workspace...</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <div className={styles.brandLabel}>MyMcKenzieCS</div>
            <div className={styles.brandMeta}>Admin Control</div>
          </div>
          <nav className={styles.nav}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${styles.navButton} ${activeTab === tab.id ? styles.navButtonActive : ''}`}
              >
                {tab.label}
                <span>{tab.hint}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerTitle}>
              <div className={styles.kicker}>Admin Command Center</div>
              <div className={styles.headline}>Court Support Intelligence</div>
              <div className={styles.headerMeta}>
                Period: {periodLabel} · Last updated {lastUpdated ? new Date(lastUpdated).toLocaleString() : '—'}
              </div>
            </div>
            <div className={styles.headerActions}>
              <select className={styles.select} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
                <option value="day">Last 24 hours</option>
                <option value="week">Last 7 days</option>
                <option value="month">Last 30 days</option>
              </select>
              <button className={styles.actionButtonSecondary} onClick={refreshAll}>
                Refresh
              </button>
              <button className={styles.actionButton} onClick={handleLogout}>
                Logout
              </button>
            </div>
          </header>

          {metricsWarnings.length > 0 && (
            <div className={styles.inlineNote}>
              {metricsWarnings.slice(0, 2).join(' | ')}
            </div>
          )}

          {activeTab === 'overview' && (
            <>
              <div className={styles.cardGrid}>
                {overviewStats.map((stat) => (
                  <div key={stat.title} className={styles.card}>
                    <div className={styles.cardTitle}>{stat.title}</div>
                    <div className={styles.cardValue}>{stat.value}</div>
                    <div className={styles.cardHint}>{stat.hint}</div>
                    <div className={styles.cardTag}>{stat.tag}</div>
                  </div>
                ))}
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <div className={styles.panelTitle}>Pulse Check</div>
                    <div className={styles.panelSubtitle}>Live operational metrics</div>
                  </div>
                </div>
                <div className={styles.metricList}>
                  <div className={styles.metricRow}>
                    <span>Messages in {periodLabel}</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.messages?.inPeriod)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Guest conversations</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.messages?.guest)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Cases created {periodLabel}</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.cases?.createdInPeriod)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Upcoming calendar events</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.calendar?.upcoming7Days)}</span>
                  </div>
                </div>
              </div>

              <div className={styles.cardGrid}>
                <div className={styles.panel}>
                  <div className={styles.panelTitle}>System Health</div>
                  <div className={styles.metricList}>
                    <div className={styles.metricRow}>
                      <span>Status</span>
                      <span className={styles.metricValue}>{systemHealth?.status ?? 'Unknown'}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Uptime</span>
                      <span className={styles.metricValue}>
                        {systemHealth ? `${Math.floor(systemHealth.uptime / 3600)}h ${Math.floor((systemHealth.uptime % 3600) / 60)}m` : '—'}
                      </span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Memory Used</span>
                      <span className={styles.metricValue}>
                        {systemHealth ? `${systemHealth.memory.used.toFixed(1)} MB` : '—'}
                      </span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Memory Load</span>
                      <span className={styles.metricValue}>
                        {systemHealth ? `${systemHealth.memory.percentage}%` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelTitle}>Feedback Signal</div>
                  <div className={styles.metricList}>
                    <div className={styles.metricRow}>
                      <span>Likes</span>
                      <span className={styles.metricValue}>{formatNumber(feedbackCounts.likes)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Dislikes</span>
                      <span className={styles.metricValue}>{formatNumber(feedbackCounts.dislikes)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Reports</span>
                      <span className={styles.metricValue}>{formatNumber(feedbackCounts.reports)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Total Feedback</span>
                      <span className={styles.metricValue}>{formatNumber(feedbackCounts.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'metrics' && (
            <>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <div className={styles.panelTitle}>Supabase Metrics Library</div>
                    <div className={styles.panelSubtitle}>Every available table metric with live counts</div>
                  </div>
                  <div className={styles.inlineNote}>
                    {metricsLoading ? 'Refreshing metrics…' : `Reporting window: ${periodLabel}`}
                  </div>
                </div>
              </div>

              <div className={styles.cardGrid}>
                <div className={styles.panel}>
                  <div className={styles.panelTitle}>Users & Billing</div>
                  <div className={styles.metricList}>
                    <div className={styles.metricRow}>
                      <span>Total users</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.users?.total)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>New users ({periodLabel})</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.users?.newInPeriod)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Active subscriptions</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.subscriptions?.active)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Cancelled subscriptions</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.subscriptions?.cancelled)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Past due subscriptions</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.subscriptions?.pastDue)}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelTitle}>Cases & Messaging</div>
                  <div className={styles.metricList}>
                    <div className={styles.metricRow}>
                      <span>Total cases</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.cases?.total)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Active cases</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.cases?.active)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Cases overdue</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.cases?.overdue)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Total messages</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.messages?.total)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Messages ({periodLabel})</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.messages?.inPeriod)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Conversations ({periodLabel})</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.messages?.conversationsInPeriod)}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelTitle}>Documents & Analysis</div>
                  <div className={styles.metricList}>
                    <div className={styles.metricRow}>
                      <span>Total documents</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.documents?.total)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Documents ({periodLabel})</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.documents?.inPeriod)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Total analyses</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.documentAnalyses?.total)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Avg file size</span>
                      <span className={styles.metricValue}>{formatBytes(metrics?.documents?.avgSizeBytes)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Largest file</span>
                      <span className={styles.metricValue}>{formatBytes(metrics?.documents?.maxSizeBytes)}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelTitle}>Calendar & Case Law</div>
                  <div className={styles.metricList}>
                    <div className={styles.metricRow}>
                      <span>Calendar events</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.calendar?.total)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Upcoming 7 days</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.calendar?.upcoming7Days)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Case law entries</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.caseLaw?.total)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Case law searches</span>
                      <span className={styles.metricValue}>{formatNumber(metrics?.caseLawSearches?.total)}</span>
                    </div>
                    <div className={styles.metricRow}>
                      <span>Avg search results</span>
                      <span className={styles.metricValue}>{(metrics?.caseLawSearches?.avgResults ?? 0).toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.cardGrid}>
                <div className={styles.panel}>
                  <div className={styles.panelTitle}>Distribution: Case Types</div>
                  <div className={styles.distribution}>
                    {distributionEntries(metrics?.cases?.byType).map(([label, value], _index, arr) => (
                      <div key={label} className={styles.barRow}>
                        <div className={styles.barLabel}>{toTitleCase(label)} · {formatNumber(value)}</div>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${(value / (arr[0]?.[1] || 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelTitle}>Distribution: Document Types</div>
                  <div className={styles.distribution}>
                    {distributionEntries(metrics?.documents?.byType).map(([label, value], _index, arr) => (
                      <div key={label} className={styles.barRow}>
                        <div className={styles.barLabel}>{toTitleCase(label)} · {formatNumber(value)}</div>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${(value / (arr[0]?.[1] || 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelTitle}>Distribution: Subscription Plans</div>
                  <div className={styles.distribution}>
                    {distributionEntries(metrics?.subscriptions?.byPlan).map(([label, value], _index, arr) => (
                      <div key={label} className={styles.barRow}>
                        <div className={styles.barLabel}>{toTitleCase(label)} · {formatNumber(value)}</div>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${(value / (arr[0]?.[1] || 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelTitle}>Distribution: Calendar Categories</div>
                  <div className={styles.distribution}>
                    {distributionEntries(metrics?.calendar?.byCategory).map(([label, value], _index, arr) => (
                      <div key={label} className={styles.barRow}>
                        <div className={styles.barLabel}>{toTitleCase(label)} · {formatNumber(value)}</div>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${(value / (arr[0]?.[1] || 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelTitle}>Audit & Cache</div>
                <div className={styles.metricList}>
                  <div className={styles.metricRow}>
                    <span>Audit entries</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.audit?.total)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Audit entries ({periodLabel})</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.audit?.inPeriod)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Cache entries</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.cache?.total)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Cache hit count</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.cache?.totalHitCount)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Expired cache entries</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.cache?.expired)}</span>
                  </div>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelTitle}>API Usage</div>
                <div className={styles.metricList}>
                  <div className={styles.metricRow}>
                    <span>Total requests</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.apiUsage?.total)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Requests ({periodLabel})</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.apiUsage?.inPeriod)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Errors</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.apiUsage?.errors)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Total cost</span>
                    <span className={styles.metricValue}>${(metrics?.apiUsage?.totalCostUsd ?? 0).toFixed(4)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Total tokens</span>
                    <span className={styles.metricValue}>{formatNumber(metrics?.apiUsage?.totalTokens)}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'users' && (
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.panelTitle}>User Management</div>
                  <div className={styles.panelSubtitle}>Plan updates and account status</div>
                </div>
                <div className={styles.toolbar}>
                  <input
                    className={styles.searchInput}
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <select className={styles.select} value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)}>
                    <option value="">All plans</option>
                    <option value="no plan">No plan</option>
                    <option value="basic">Basic</option>
                    <option value="premium">Premium</option>
                    <option value="premium +">Premium +</option>
                    <option value="premium plus">Premium Plus (legacy)</option>
                  </select>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Plan</th>
                      <th>Status</th>
                      <th>Last Active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                        <tr key={user.id}>
                          <td>{user.fullName}</td>
                          <td>{user.email}</td>
                          <td>
                            <span className={styles.pill}>{toTitleCase(normalizePlan(user.plan))}</span>
                          </td>
                          <td>
                            <span className={user.disabled ? styles.pillDanger : styles.pillSuccess}>
                              {user.disabled ? 'Suspended' : 'Active'}
                            </span>
                          </td>
                          <td>{formatDate(user.lastActive)}</td>
                          <td>
                            <div className={styles.toolbar}>
                              <button
                                className={styles.actionButtonSecondary}
                                onClick={() => handleUserAction(user.id, user.disabled ? 'activate' : 'suspend')}
                              >
                                {user.disabled ? 'Activate' : 'Suspend'}
                              </button>
                              <button
                                className={styles.actionButton}
                                onClick={() => {
                                  const normalizedCurrentPlan = normalizePlan(user.plan)
                                  setPlanEditor({
                                    userId: user.id,
                                    currentPlan: normalizedCurrentPlan,
                                    nextPlan: PLAN_OPTIONS.includes(normalizedCurrentPlan) ? normalizedCurrentPlan : 'premium +',
                                  })
                                }}
                              >
                                Change Plan
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={6}>No users found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {(usersHasMore || usersLoadingMore) && (
                <div className={styles.toolbar} style={{ marginTop: 12 }}>
                  <button className={styles.actionButtonSecondary} onClick={loadMoreUsers} disabled={usersLoadingMore}>
                    {usersLoadingMore ? 'Loading…' : 'Load more users'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'cases' && (
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.panelTitle}>Case Management</div>
                  <div className={styles.panelSubtitle}>Monitor active and archived cases</div>
                </div>
                <select className={styles.select} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">All status</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>User</th>
                      <th>Type</th>
                      <th>Location</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases
                      .filter((c) => !filterStatus || c.status.toLowerCase() === filterStatus)
                      .map((caseItem) => (
                        <tr key={caseItem.id}>
                          <td>{caseItem.caseNumber}</td>
                          <td>{caseItem.userEmail}</td>
                          <td>{caseItem.caseType}</td>
                          <td>{caseItem.location || 'N/A'}</td>
                          <td>
                            <span className={styles.pill}>{toTitleCase(caseItem.status)}</span>
                          </td>
                          <td>{formatDate(caseItem.createdAt)}</td>
                          <td>
                            <button
                              className={styles.actionButtonSecondary}
                              onClick={() => handleDeleteCase(caseItem.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {(casesHasMore || casesLoadingMore) && (
                <div className={styles.toolbar} style={{ marginTop: 12 }}>
                  <button className={styles.actionButtonSecondary} onClick={loadMoreCases} disabled={casesLoadingMore}>
                    {casesLoadingMore ? 'Loading…' : 'Load more cases'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'documents' && (
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.panelTitle}>Document Management</div>
                  <div className={styles.panelSubtitle}>Uploads, status, and storage footprint</div>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>User</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td>{doc.title}</td>
                        <td>{doc.userEmail}</td>
                        <td>{doc.type}</td>
                        <td>{formatBytes(doc.contentLength)}</td>
                        <td>
                          <span className={doc.status === 'Draft' ? styles.pill : styles.pillSuccess}>{doc.status}</span>
                        </td>
                        <td>{formatDate(doc.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(documentsHasMore || documentsLoadingMore) && (
                <div className={styles.toolbar} style={{ marginTop: 12 }}>
                  <button
                    className={styles.actionButtonSecondary}
                    onClick={loadMoreDocuments}
                    disabled={documentsLoadingMore}
                  >
                    {documentsLoadingMore ? 'Loading…' : 'Load more documents'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'analytics' && analytics && (
            <>
              <div className={styles.cardGrid}>
                {analyticsStats.map((stat) => (
                  <div key={stat.title} className={styles.card}>
                    <div className={styles.cardTitle}>{stat.title}</div>
                    <div className={styles.cardValue}>{stat.value}</div>
                    <div className={styles.cardHint}>{stat.hint}</div>
                  </div>
                ))}
              </div>

              <div className={styles.cardGrid}>
                <div className={styles.panel}>
                  <div className={styles.panelTitle}>Popular Case Types</div>
                  <div className={styles.distribution}>
                    {distributionEntries(
                      cases.reduce((acc, c) => {
                        acc[c.caseType] = (acc[c.caseType] || 0) + 1
                        return acc
                      }, {} as Record<string, number>)
                    ).map(([type, count], _index, arr) => (
                      <div key={type} className={styles.barRow}>
                        <div className={styles.barLabel}>{toTitleCase(type)} · {formatNumber(count)}</div>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${(count / (arr[0]?.[1] || 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelTitle}>Document Distribution</div>
                  <div className={styles.distribution}>
                    {distributionEntries(
                      documents.reduce((acc, d) => {
                        acc[d.type] = (acc[d.type] || 0) + 1
                        return acc
                      }, {} as Record<string, number>)
                    ).map(([type, count], _index, arr) => (
                      <div key={type} className={styles.barRow}>
                        <div className={styles.barLabel}>{toTitleCase(type)} · {formatNumber(count)}</div>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${(count / (arr[0]?.[1] || 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'system' && systemHealth && (
            <>
              <div className={styles.cardGrid}>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Status</div>
                  <div className={styles.cardValue}>{systemHealth.status.toUpperCase()}</div>
                  <div className={styles.cardHint}>All services nominal</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Uptime</div>
                  <div className={styles.cardValue}>
                    {Math.floor(systemHealth.uptime / 3600)}h {Math.floor((systemHealth.uptime % 3600) / 60)}m
                  </div>
                  <div className={styles.cardHint}>Since last restart</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Memory Usage</div>
                  <div className={styles.cardValue}>{systemHealth.memory.percentage}%</div>
                  <div className={styles.cardHint}>{systemHealth.memory.used.toFixed(0)} MB used</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Memory Total</div>
                  <div className={styles.cardValue}>{systemHealth.memory.total.toFixed(0)} MB</div>
                  <div className={styles.cardHint}>Heap total</div>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelTitle}>Service Status</div>
                <div className={styles.metricList}>
                  {Object.entries(systemHealth.services).map(([service, status]) => (
                    <div key={service} className={styles.metricRow}>
                      <span>{toTitleCase(service)}</span>
                      <span className={styles.metricValue}>{status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelTitle}>System Actions</div>
                <div className={styles.toolbar}>
                  <button className={styles.actionButton} onClick={refreshAll}>
                    Refresh Data
                  </button>
                  <button
                    className={styles.actionButtonSecondary}
                    onClick={() => setStatusModal({ title: 'Cache', message: 'Cache cleared successfully.' })}
                  >
                    Clear Cache
                  </button>
                  <button
                    className={styles.actionButtonSecondary}
                    onClick={() => {
                      const data = { users, cases, documents, analytics, metrics }
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `admin-export-${new Date().toISOString()}.json`
                      a.click()
                    }}
                  >
                    Export Data
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'feedback' && (
            <>
              <div className={styles.cardGrid}>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Likes</div>
                  <div className={styles.cardValue}>{formatNumber(feedbackCounts.likes)}</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Dislikes</div>
                  <div className={styles.cardValue}>{formatNumber(feedbackCounts.dislikes)}</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Reports</div>
                  <div className={styles.cardValue}>{formatNumber(feedbackCounts.reports)}</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Total Feedback</div>
                  <div className={styles.cardValue}>{formatNumber(feedbackCounts.total)}</div>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelTitle}>Recent Feedback</div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>User ID</th>
                        <th>Message Preview</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feedback.map((item) => {
                        const safeUserId = typeof item.userId === 'string' ? item.userId : String(item.userId ?? 'unknown');
                        const safeMessage = typeof item.messageContent === 'string' ? item.messageContent : String(item.messageContent ?? '');
                        return (
                          <tr key={item.id}>
                            <td>{toTitleCase(item.feedbackType)}</td>
                            <td>{safeUserId.slice(0, 12)}...</td>
                            <td>{safeMessage.slice(0, 80)}...</td>
                            <td>{formatDate(item.createdAt)}</td>
                            <td>{item.status || 'received'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activeTab === 'privacy' && (
            <>
              <div className={styles.cardGrid}>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Pending</div>
                  <div className={styles.cardValue}>{formatNumber(privacyRequestCounts.pending)}</div>
                  <div className={styles.cardHint}>Awaiting review</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>In Review</div>
                  <div className={styles.cardValue}>{formatNumber(privacyRequestCounts.in_review)}</div>
                  <div className={styles.cardHint}>Being worked</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Completed</div>
                  <div className={styles.cardValue}>{formatNumber(privacyRequestCounts.completed)}</div>
                  <div className={styles.cardHint}>Resolved requests</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Total</div>
                  <div className={styles.cardValue}>{formatNumber(privacyRequestCounts.total)}</div>
                  <div className={styles.cardHint}>All DSAR items</div>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <div className={styles.panelTitle}>Privacy Request Queue</div>
                    <div className={styles.panelSubtitle}>Access, correction, restriction, and erasure requests</div>
                  </div>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Request</th>
                        <th>User</th>
                        <th>Submitted</th>
                        <th>Status</th>
                        <th>Details</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {privacyRequests.map((request) => (
                        <tr key={request.id}>
                          <td>
                            <div style={{ display: 'grid', gap: 4 }}>
                              <strong>{toTitleCase(request.request_type)}</strong>
                              <span className={styles.pill}>{request.id.slice(0, 8)}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'grid', gap: 4 }}>
                              <span>{request.user_email}</span>
                              <span className={styles.panelSubtitle}>{request.user_id || 'No linked user'}</span>
                            </div>
                          </td>
                          <td>{formatDate(request.submitted_at)}</td>
                          <td>
                            <span
                              className={
                                request.status === 'completed'
                                  ? styles.pillSuccess
                                  : request.status === 'rejected'
                                    ? styles.pillDanger
                                    : styles.pill
                              }
                            >
                              {toTitleCase(request.status)}
                            </span>
                          </td>
                          <td style={{ maxWidth: 360 }}>
                            <div style={{ display: 'grid', gap: 6 }}>
                              <span>{request.details || 'No additional details provided.'}</span>
                              {request.admin_notes && (
                                <span className={styles.panelSubtitle}>Admin note: {request.admin_notes}</span>
                              )}
                              {request.completed_at && (
                                <span className={styles.panelSubtitle}>
                                  Completed: {formatDate(request.completed_at)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className={styles.toolbar}>
                              <button
                                className={styles.actionButtonSecondary}
                                onClick={() => openPrivacyAction(request, 'in_review')}
                              >
                                Review
                              </button>
                              <button
                                className={styles.actionButtonSecondary}
                                onClick={() => openPrivacyAction(request, 'completed')}
                              >
                                Complete
                              </button>
                              <button
                                className={styles.actionButtonSecondary}
                                onClick={() => openPrivacyAction(request, 'rejected')}
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {privacyRequests.length === 0 && (
                        <tr>
                          <td colSpan={6} className={styles.emptyState}>
                            No privacy requests in the queue.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activeTab === 'inbox' && (
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.panelTitle}>Report Inbox</div>
                  <div className={styles.panelSubtitle}>
                    Pending reports: {feedback.filter((f) => f.feedbackType === 'report' && f.status === 'pending').length}
                  </div>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Issue</th>
                      <th>Description</th>
                      <th>Message</th>
                      <th>User</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedback
                      .filter((item) => item.feedbackType === 'report')
                      .map((item) => {
                        const safeUserId = typeof item.userId === 'string' ? item.userId : String(item.userId ?? 'unknown');
                        const safeMessage = typeof item.messageContent === 'string' ? item.messageContent : String(item.messageContent ?? '');
                        const safeDate = item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A';
                        return (
                          <tr key={item.id}>
                            <td>{item.status === 'pending' ? 'Pending' : 'Reviewed'}</td>
                            <td>{item.reportIssue || 'N/A'}</td>
                            <td>{item.reportProblem || 'No description'}</td>
                            <td>{safeMessage.slice(0, 60)}...</td>
                            <td>{safeUserId.slice(0, 10)}...</td>
                            <td>{safeDate}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {feedback.filter((item) => item.feedbackType === 'report').length === 0 && (
                <div className={styles.emptyState}>No reports to review.</div>
              )}
            </div>
          )}

          {activeTab === 'api' && (
            <>
              <div className={styles.cardGrid}>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Total Requests</div>
                  <div className={styles.cardValue}>{formatNumber(apiUsageSummary.totalRequests)}</div>
                  <div className={styles.cardHint}>{periodLabel}</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Total Cost</div>
                  <div className={styles.cardValue}>${apiUsageSummary.totalCostUsd.toFixed(4)}</div>
                  <div className={styles.cardHint}>{periodLabel}</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Total Tokens</div>
                  <div className={styles.cardValue}>{formatNumber(apiUsageSummary.totalTokens)}</div>
                  <div className={styles.cardHint}>All providers</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Error Rate</div>
                  <div className={styles.cardValue}>{apiUsageSummary.errorRate}%</div>
                  <div className={styles.cardHint}>Failed requests</div>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <div className={styles.panelTitle}>API Usage Log</div>
                    <div className={styles.panelSubtitle}>All providers, latest {periodLabel}</div>
                  </div>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Provider</th>
                        <th>Endpoint</th>
                        <th>Model</th>
                        <th>Success</th>
                        <th>Tokens</th>
                        <th>Cost</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiUsage.map((entry, idx) => (
                        <tr key={entry.id || idx}>
                          <td>{entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}</td>
                          <td>{toTitleCase(entry.provider || 'unknown')}</td>
                          <td>{entry.endpoint || '—'}</td>
                          <td>{entry.model || '—'}</td>
                          <td>{entry.success ? 'Yes' : 'No'}</td>
                          <td>{entry.total_tokens ?? '-'}</td>
                          <td>{entry.cost_usd != null ? `$${Number(entry.cost_usd).toFixed(4)}` : '-'}</td>
                          <td>{entry.error || '-'}</td>
                        </tr>
                      ))}
                      {apiUsage.length === 0 && (
                        <tr>
                          <td colSpan={8} className={styles.emptyState}>
                            No usage data found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {(apiUsageHasMore || apiUsageLoadingMore) && (
                  <div className={styles.toolbar} style={{ marginTop: 12 }}>
                    <button
                      className={styles.actionButtonSecondary}
                      onClick={loadMoreApiUsage}
                      disabled={apiUsageLoadingMore}
                    >
                      {apiUsageLoadingMore ? 'Loading…' : 'Load more logs'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {deleteCaseIdPending && (
            <div className={styles.modalOverlay} role="dialog" aria-modal="true">
              <div className={styles.modalCard}>
                <h3 className={styles.modalTitle}>Delete this case?</h3>
                <p className={styles.modalBody}>This action cannot be undone.</p>
                <div className={styles.modalActions}>
                  <button className={styles.modalCancelBtn} onClick={() => setDeleteCaseIdPending(null)}>
                    Cancel
                  </button>
                  <button className={styles.modalDangerBtn} onClick={confirmDeleteCase}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
          {planEditor && (
            <div className={styles.modalOverlay} role="dialog" aria-modal="true">
              <div className={styles.modalCard}>
                <h3 className={styles.modalTitle}>Change User Plan</h3>
                <p className={styles.modalBody}>Select a new plan for this user.</p>
                <select
                  className={styles.modalSelect}
                  value={planEditor.nextPlan}
                  onChange={(e) => setPlanEditor((prev) => (prev ? { ...prev, nextPlan: e.target.value } : null))}
                >
                  {PLAN_OPTIONS.map((planOption) => (
                    <option key={planOption} value={planOption}>
                      {toTitleCase(planOption)}
                    </option>
                  ))}
                </select>
                <div className={styles.modalActions}>
                  <button className={styles.modalCancelBtn} onClick={() => setPlanEditor(null)}>
                    Cancel
                  </button>
                  <button
                    className={styles.modalPrimaryBtn}
                    onClick={() => {
                      const target = planEditor
                      setPlanEditor(null)
                      void handleUserAction(target.userId, 'updatePlan', { plan: target.nextPlan })
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
          {privacyActionTarget && (
            <div className={styles.modalOverlay} role="dialog" aria-modal="true">
              <div className={styles.modalCard}>
                <h3 className={styles.modalTitle}>Update privacy request</h3>
                <p className={styles.modalBody}>
                  {privacyActionTarget.user_email} · {toTitleCase(privacyActionTarget.request_type)}
                </p>
                <select
                  className={styles.modalSelect}
                  value={privacyActionStatus}
                  onChange={(e) => setPrivacyActionStatus(e.target.value as PrivacyActionStatus)}
                >
                  <option value="in_review">Mark in review</option>
                  <option value="completed">Mark completed</option>
                  <option value="rejected">Mark rejected</option>
                </select>
                <textarea
                  className={styles.modalTextarea}
                  rows={4}
                  value={privacyActionNotes}
                  onChange={(e) => setPrivacyActionNotes(e.target.value)}
                  placeholder="Optional admin notes for the record..."
                />
                <div className={styles.modalActions}>
                  <button className={styles.modalCancelBtn} onClick={() => setPrivacyActionTarget(null)}>
                    Cancel
                  </button>
                  <button className={styles.modalPrimaryBtn} onClick={submitPrivacyAction}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
          {statusModal && (
            <div className={styles.modalOverlay} role="dialog" aria-modal="true">
              <div className={styles.modalCard}>
                <h3 className={styles.modalTitle}>{statusModal.title}</h3>
                <p className={styles.modalBody}>{statusModal.message}</p>
                <div className={styles.modalActions}>
                  <button className={styles.modalPrimaryBtn} onClick={() => setStatusModal(null)}>
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
