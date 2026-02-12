import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


const PERIODS = {
  day: 1,
  week: 7,
  month: 30,
} as const

type PeriodKey = keyof typeof PERIODS
type MetricsRow = Record<string, unknown>
type MetricsQuery = unknown

const chain = (query: MetricsQuery, method: string, ...args: unknown[]): MetricsQuery => {
  if (!query || typeof query !== 'object') return query
  const candidate = (query as Record<string, unknown>)[method]
  if (typeof candidate !== 'function') return query
  return (candidate as (...params: unknown[]) => unknown).apply(query, args)
}

export async function GET(request: Request) {
  try {
    const adminLoggedIn = request.headers.get('x-admin-auth')
    if (adminLoggedIn !== 'true') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodParam = (searchParams.get('period') || 'week') as PeriodKey
    const period: PeriodKey = PERIODS[periodParam] ? periodParam : 'week'

    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - PERIODS[period])
    const startIso = startDate.toISOString()

    const warnings: string[] = []

    const warn = (label: string, error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`${label}: ${message}`)
    }

    const count = async (
      table: string,
      label: string,
      apply?: (query: MetricsQuery) => MetricsQuery
    ) => {
      try {
        let query: MetricsQuery = supabaseAdmin.from(table).select('*', { count: 'exact', head: true })
        if (apply) query = apply(query)
        const { count, error } = await (query as { then: PromiseLike<{ count: number | null; error: unknown }>['then'] })
        if (error) throw error
        return count ?? 0
      } catch (error) {
        warn(label, error)
        return 0
      }
    }

    const select = async <T extends Record<string, unknown>>(
      table: string,
      columns: string,
      label: string,
      apply?: (query: MetricsQuery) => MetricsQuery
    ) => {
      try {
        let query: MetricsQuery = supabaseAdmin.from(table).select(columns)
        if (apply) query = apply(query)
        const { data, error } = await (query as { then: PromiseLike<{ data: unknown[] | null; error: unknown }>['then'] })
        if (error) throw error
        return (data || []) as unknown as T[]
      } catch (error) {
        warn(label, error)
        return [] as T[]
      }
    }

    const groupCount = async (
      table: string,
      column: string,
      label: string,
      apply?: (query: MetricsQuery) => MetricsQuery
    ) => {
      const rows = await select<MetricsRow>(table, column, label, apply)
      const counts: Record<string, number> = {}
      for (const row of rows) {
        const key = (row?.[column] ?? 'Unknown') as string
        counts[key] = (counts[key] || 0) + 1
      }
      return counts
    }

    const sumColumn = async (
      table: string,
      column: string,
      label: string,
      apply?: (query: MetricsQuery) => MetricsQuery
    ) => {
      const rows = await select<MetricsRow>(table, column, label, apply)
      let total = 0
      let max = 0
      for (const row of rows) {
        const raw = row?.[column]
        const value = typeof raw === 'number' ? raw : Number(raw) || 0
        total += value
        if (value > max) max = value
      }
      return { total, max, count: rows.length }
    }

    const [
      totalUsers,
      newUsers,
      updatedUsers,
      totalCases,
      activeCases,
      closedCases,
      archivedCases,
      deletedCases,
      casesInPeriod,
      casesWithDeadline,
      overdueCases,
      totalMessages,
      messagesInPeriod,
      messagesLast24h,
      guestMessages,
      totalDocuments,
      docsInPeriod,
      totalSubscriptions,
      activeSubscriptions,
      cancelledSubscriptions,
      pastDueSubscriptions,
      expiredSubscriptions,
      cancelAtPeriodEnd,
      totalAnalyses,
      analysesInPeriod,
      totalAudit,
      auditInPeriod,
      totalCache,
      expiredCache,
      totalCalendar,
      upcomingCalendar,
      overdueCalendar,
      totalCaseLaw,
      totalCaseLawSearches,
      caseLawSearchesInPeriod,
      totalApiUsage,
      apiUsageInPeriod,
      apiUsageErrors,
    ] = await Promise.all([
      count('users', 'users.total'),
      count('users', 'users.newInPeriod', (q) => chain(q, 'gte', 'created_at', startIso)),
      count('users', 'users.updatedInPeriod', (q) => chain(q, 'gte', 'updated_at', startIso)),
      count('cases', 'cases.total'),
      count('cases', 'cases.active', (q) => chain(chain(q, 'eq', 'status', 'active'), 'is', 'deleted_at', null)),
      count('cases', 'cases.closed', (q) => chain(chain(q, 'eq', 'status', 'closed'), 'is', 'deleted_at', null)),
      count('cases', 'cases.archived', (q) => chain(chain(q, 'eq', 'status', 'archived'), 'is', 'deleted_at', null)),
      count('cases', 'cases.deleted', (q) => chain(q, 'not', 'deleted_at', 'is', null)),
      count('cases', 'cases.createdInPeriod', (q) => chain(q, 'gte', 'created_at', startIso)),
      count('cases', 'cases.withDeadline', (q) => chain(q, 'not', 'court_deadline', 'is', null)),
      count('cases', 'cases.overdue', (q) => chain(chain(q, 'lt', 'court_deadline', now.toISOString()), 'eq', 'status', 'active')),
      count('messages', 'messages.total'),
      count('messages', 'messages.inPeriod', (q) => chain(q, 'gte', 'timestamp', startIso)),
      count('messages', 'messages.last24h', (q) => chain(q, 'gte', 'timestamp', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())),
      count('messages', 'messages.guest', (q) => chain(q, 'is', 'case_id', null)),
      count('documents', 'documents.total'),
      count('documents', 'documents.inPeriod', (q) => chain(q, 'gte', 'created_at', startIso)),
      count('subscriptions', 'subscriptions.total'),
      count('subscriptions', 'subscriptions.active', (q) => chain(q, 'eq', 'status', 'active')),
      count('subscriptions', 'subscriptions.cancelled', (q) => chain(q, 'eq', 'status', 'cancelled')),
      count('subscriptions', 'subscriptions.past_due', (q) => chain(q, 'eq', 'status', 'past_due')),
      count('subscriptions', 'subscriptions.expired', (q) => chain(q, 'eq', 'status', 'expired')),
      count('subscriptions', 'subscriptions.cancel_at_period_end', (q) => chain(q, 'eq', 'cancel_at_period_end', true)),
      count('document_analyses', 'document_analyses.total'),
      count('document_analyses', 'document_analyses.inPeriod', (q) => chain(q, 'gte', 'created_at', startIso)),
      count('audit_log', 'audit.total'),
      count('audit_log', 'audit.inPeriod', (q) => chain(q, 'gte', 'created_at', startIso)),
      count('cache', 'cache.total'),
      count('cache', 'cache.expired', (q) => chain(q, 'lt', 'expires_at', now.toISOString())),
      count('calendar_events', 'calendar.total'),
      count('calendar_events', 'calendar.upcoming', (q) => chain(chain(q, 'gte', 'date', now.toISOString()), 'lte', 'date', new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString())),
      count('calendar_events', 'calendar.overdue', (q) => chain(q, 'lt', 'date', now.toISOString())),
      count('case_law', 'case_law.total'),
      count('case_law_searches', 'case_law_searches.total'),
      count('case_law_searches', 'case_law_searches.inPeriod', (q) => chain(q, 'gte', 'created_at', startIso)),
      count('api_usage', 'api_usage.total'),
      count('api_usage', 'api_usage.inPeriod', (q) => chain(q, 'gte', 'created_at', startIso)),
      count('api_usage', 'api_usage.errors', (q) => chain(q, 'eq', 'success', false)),
    ])

    const [
      caseTypes,
      caseStatuses,
      messageRoles,
      documentTypes,
      subscriptionPlans,
      calendarCategories,
      calendarPriorities,
      auditActions,
      auditTables,
      cacheTypes,
      caseLawTypes,
      caseLawYears,
      apiUsageProviders,
      apiUsageModels,
      apiUsageEndpoints,
    ] = await Promise.all([
      groupCount('cases', 'case_type', 'cases.byType'),
      groupCount('cases', 'status', 'cases.byStatus'),
      groupCount('messages', 'role', 'messages.byRole'),
      groupCount('documents', 'type', 'documents.byType'),
      groupCount('subscriptions', 'plan_type', 'subscriptions.byPlan'),
      groupCount('calendar_events', 'category', 'calendar.byCategory'),
      groupCount('calendar_events', 'priority', 'calendar.byPriority'),
      groupCount('audit_log', 'action', 'audit.byAction'),
      groupCount('audit_log', 'table_name', 'audit.byTable'),
      groupCount('cache', 'cache_type', 'cache.byType'),
      groupCount('case_law', 'case_type', 'case_law.byType'),
      groupCount('case_law', 'year', 'case_law.byYear'),
      groupCount('api_usage', 'provider', 'api_usage.byProvider'),
      groupCount('api_usage', 'model', 'api_usage.byModel'),
      groupCount('api_usage', 'endpoint', 'api_usage.byEndpoint'),
    ])

    const [
      documentsSize,
      cacheHits,
      messageUsageRows,
      conversations,
      caseLawSearchResults,
      apiUsageCost,
      apiUsageTokens,
    ] = await Promise.all([
      sumColumn('documents', 'file_size', 'documents.size'),
      sumColumn('cache', 'hit_count', 'cache.hit_count'),
      select<{ free_messages_used?: number; total_messages?: number }>('message_usage', 'free_messages_used,total_messages', 'message_usage'),
      select<{ conversation_id: string | null }>('messages', 'conversation_id', 'messages.conversations', (q) => chain(q, 'gte', 'timestamp', startIso)),
      select<{ results_count?: number }>('case_law_searches', 'results_count', 'case_law_searches.results'),
      sumColumn('api_usage', 'cost_usd', 'api_usage.cost'),
      sumColumn('api_usage', 'total_tokens', 'api_usage.tokens'),
    ])

    const uniqueConversations = new Set(
      conversations.map((row) => row.conversation_id).filter((id): id is string => Boolean(id))
    )

    const totalMessageUsage = messageUsageRows.reduce(
      (acc, row) => {
        acc.free += row.free_messages_used || 0
        acc.total += row.total_messages || 0
        return acc
      },
      { free: 0, total: 0 }
    )

    const caseLawSearchStats = caseLawSearchResults.reduce(
      (acc, row) => {
        const value = row.results_count || 0
        acc.total += value
        acc.max = Math.max(acc.max, value)
        return acc
      },
      { total: 0, max: 0, count: caseLawSearchResults.length }
    )

    const avgDocSize = documentsSize.count > 0 ? documentsSize.total / documentsSize.count : 0
    const avgResults = caseLawSearchStats.count > 0 ? caseLawSearchStats.total / caseLawSearchStats.count : 0

    return NextResponse.json({
      generatedAt: now.toISOString(),
      period: {
        key: period,
        start: startIso,
        end: now.toISOString(),
      },
      metrics: {
        users: {
          total: totalUsers,
          newInPeriod: newUsers,
          updatedInPeriod: updatedUsers,
        },
        cases: {
          total: totalCases,
          active: activeCases,
          closed: closedCases,
          archived: archivedCases,
          deleted: deletedCases,
          createdInPeriod: casesInPeriod,
          withDeadline: casesWithDeadline,
          overdue: overdueCases,
          byType: caseTypes,
          byStatus: caseStatuses,
        },
        messages: {
          total: totalMessages,
          inPeriod: messagesInPeriod,
          last24h: messagesLast24h,
          guest: guestMessages,
          byRole: messageRoles,
          conversationsInPeriod: uniqueConversations.size,
        },
        documents: {
          total: totalDocuments,
          inPeriod: docsInPeriod,
          byType: documentTypes,
          totalSizeBytes: documentsSize.total,
          avgSizeBytes: avgDocSize,
          maxSizeBytes: documentsSize.max,
        },
        subscriptions: {
          total: totalSubscriptions,
          active: activeSubscriptions,
          cancelled: cancelledSubscriptions,
          pastDue: pastDueSubscriptions,
          expired: expiredSubscriptions,
          cancelAtPeriodEnd: cancelAtPeriodEnd,
          byPlan: subscriptionPlans,
        },
        documentAnalyses: {
          total: totalAnalyses,
          inPeriod: analysesInPeriod,
        },
        audit: {
          total: totalAudit,
          inPeriod: auditInPeriod,
          byAction: auditActions,
          byTable: auditTables,
        },
        cache: {
          total: totalCache,
          expired: expiredCache,
          totalHitCount: cacheHits.total,
          byType: cacheTypes,
        },
        calendar: {
          total: totalCalendar,
          upcoming7Days: upcomingCalendar,
          overdue: overdueCalendar,
          byCategory: calendarCategories,
          byPriority: calendarPriorities,
        },
        caseLaw: {
          total: totalCaseLaw,
          byType: caseLawTypes,
          byYear: caseLawYears,
        },
        caseLawSearches: {
          total: totalCaseLawSearches,
          inPeriod: caseLawSearchesInPeriod,
          avgResults: avgResults,
          maxResults: caseLawSearchStats.max,
        },
        messageUsage: {
          totalMessages: totalMessageUsage.total,
          freeMessagesUsed: totalMessageUsage.free,
        },
        apiUsage: {
          total: totalApiUsage,
          inPeriod: apiUsageInPeriod,
          errors: apiUsageErrors,
          totalCostUsd: apiUsageCost.total,
          totalTokens: apiUsageTokens.total,
          byProvider: apiUsageProviders,
          byModel: apiUsageModels,
          byEndpoint: apiUsageEndpoints,
        },
      },
      warnings,
    })
  } catch (error: unknown) {
    console.error('Error fetching metrics:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch metrics'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
