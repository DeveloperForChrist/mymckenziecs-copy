export type BusinessAlertType = 'deadline' | 'message' | 'lead' | 'system' | 'document' | 'meeting'
export type BusinessAlertPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface BusinessAlert {
  id: string
  type: BusinessAlertType
  priority: BusinessAlertPriority
  title: string
  body: string
  time: string
  read: boolean
  clientName?: string
  actionLabel?: string
}

export const BUSINESS_ALERTS_STORAGE_KEY = 'mymckenzie-business-alerts'
export const BUSINESS_ALERTS_SCOPE_STORAGE_KEY = 'mymckenzie-business-alerts-scope'
export const BUSINESS_ALERTS_UPDATED_EVENT = 'mymckenzie-business-alerts-updated'
export const BUSINESS_ALERTS_REFRESH_EVENT = 'mymckenzie-business-alerts-refresh'

export type BusinessAlertsUpdatedDetail = {
  unreadCount?: number
}

export type BusinessAlertsRefreshDetail = {
  alerts?: BusinessAlert[]
  unreadCount?: number
}

function getScopedAlertsStorageKey() {
  if (typeof window === 'undefined') return BUSINESS_ALERTS_STORAGE_KEY
  const scope = window.localStorage.getItem(BUSINESS_ALERTS_SCOPE_STORAGE_KEY) || ''
  return scope ? `${BUSINESS_ALERTS_STORAGE_KEY}:${scope}` : BUSINESS_ALERTS_STORAGE_KEY
}

export function setBusinessAlertsStorageScope(scope: string) {
  if (typeof window === 'undefined') return
  try {
    const normalizedScope = String(scope || '').trim()
    if (!normalizedScope) {
      window.localStorage.removeItem(BUSINESS_ALERTS_SCOPE_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(BUSINESS_ALERTS_SCOPE_STORAGE_KEY, normalizedScope)
    window.localStorage.removeItem(BUSINESS_ALERTS_STORAGE_KEY)
  } catch {
    // ignore localStorage failures
  }
}

export function loadStoredAlerts(): BusinessAlert[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(getScopedAlertsStorageKey())
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is BusinessAlert => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry) && typeof (entry as BusinessAlert).id === 'string')
      .map((alert) => ({
        ...alert,
        type: alert.type,
        priority: alert.priority,
        title: String(alert.title || ''),
        body: String(alert.body || ''),
        time: String(alert.time || ''),
        read: Boolean(alert.read),
        clientName: typeof alert.clientName === 'string' ? alert.clientName : undefined,
        actionLabel: typeof alert.actionLabel === 'string' ? alert.actionLabel : undefined,
      }))
  } catch {
    return []
  }
}

export function saveStoredAlerts(alerts: BusinessAlert[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getScopedAlertsStorageKey(), JSON.stringify(alerts))
  } catch {
    // ignore localStorage failures
  }
}

export function countUnreadAlerts(alerts: BusinessAlert[]) {
  return alerts.filter((alert) => !alert.read).length
}

export function dispatchBusinessAlertsUpdated(detail: BusinessAlertsUpdatedDetail = {}) {
  window.dispatchEvent(new CustomEvent(BUSINESS_ALERTS_UPDATED_EVENT, { detail }))
}

export function dispatchBusinessAlertsRefresh(detail: BusinessAlertsRefreshDetail = {}) {
  window.dispatchEvent(new CustomEvent(BUSINESS_ALERTS_REFRESH_EVENT, { detail }))
}
