export type LeadStatus = 'new' | 'accepted' | 'declined' | 'pending'
export type Urgency = 'high' | 'medium' | 'low'
export type LeadSource = 'portal' | 'referral' | 'direct'
export type MatterStage = 'intake' | 'documents' | 'advice' | 'hearing' | 'closed'
export type MatterStatus = 'active' | 'archived'

export interface BusinessLead {
  id: string
  name: string
  email: string
  phone: string
  location: string
  issueType: string
  urgency: Urgency
  summary: string
  fullDetails: string
  courtDate?: string
  opposing?: string
  documents: string[]
  tags: string[]
  submittedAt: string
  status: LeadStatus
  source: LeadSource
  marketplaceOffer?: boolean
  detailsRevealed?: boolean
}

export interface ClientMatter {
  id: string
  leadId?: string
  caseId?: string | null
  clientName: string
  email: string
  phone: string
  location: string
  issueType: string
  urgency: Urgency
  summary: string
  fullDetails: string
  courtDate?: string
  opposing?: string
  documents: string[]
  tags: string[]
  matterNumber: string
  stage: MatterStage
  status: MatterStatus
  owner: string
  nextAction: string
  nextDeadline?: string
  lastActivity: string
  acceptedAt: string
  currentBalance: number
}

export const BUSINESS_LEADS_KEY = 'mymckenzie-business-leads'
export const CLIENT_MATTERS_KEY = 'mymckenzie-business-client-matters'
export const BUSINESS_LEADS_UPDATED_EVENT = 'mymckenzie-business-leads-updated'
export const CLIENT_MATTERS_UPDATED_EVENT = 'mymckenzie-business-client-matters-updated'
const CLIENT_MATTERS_API_PATH = '/api/business/client-matters'
const BUSINESS_LEADS_CACHE_CLEANUP_VERSION_KEY = 'mymckenzie-business-leads-cache-cleanup-v1'

export const DEFAULT_BUSINESS_LEADS: BusinessLead[] = []
const LEGACY_MOCK_LEAD_IDS = new Set(['1', '2', '3', '4', 'lead-1', 'lead-2', 'lead-3', 'lead-4'])

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readJsonArray<T>(key: string, fallback: T[]): T[] {
  if (!canUseStorage()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : fallback
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeJsonArray<T>(key: string, value: T[], eventName: string) {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent(eventName))
  } catch {
    // Keep the UI usable when storage is blocked.
  }
}

function cacheJsonArray<T>(key: string, value: T[]) {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Cache writes are best effort.
  }
}

export function readBusinessLeads() {
  return readJsonArray<BusinessLead>(BUSINESS_LEADS_KEY, DEFAULT_BUSINESS_LEADS)
}

function looksLikeLegacyMockLeads(leads: BusinessLead[]) {
  if (leads.length !== 4) return false
  return leads.every((lead) => LEGACY_MOCK_LEAD_IDS.has(lead.id))
}

export function cleanupLegacyMockBusinessLeadsCache() {
  if (!canUseStorage()) return
  try {
    if (window.localStorage.getItem(BUSINESS_LEADS_CACHE_CLEANUP_VERSION_KEY) === '1') return

    const leads = readBusinessLeads()
    if (looksLikeLegacyMockLeads(leads)) {
      window.localStorage.setItem(BUSINESS_LEADS_KEY, JSON.stringify([]))

      const matters = readClientMatters()
      if (matters.length > 0) {
        const filtered = matters.filter((matter) => {
          if (!matter.leadId) return true
          return !['1', '2', '3', '4', 'lead-1', 'lead-2', 'lead-3', 'lead-4'].includes(matter.leadId)
        })
        window.localStorage.setItem(CLIENT_MATTERS_KEY, JSON.stringify(filtered))
      }
    }

    window.localStorage.setItem(BUSINESS_LEADS_CACHE_CLEANUP_VERSION_KEY, '1')
  } catch {
    // Ignore local storage failures and keep app usable.
  }
}

export function writeBusinessLeads(leads: BusinessLead[]) {
  writeJsonArray(BUSINESS_LEADS_KEY, leads, BUSINESS_LEADS_UPDATED_EVENT)
}

export function cacheBusinessLeads(leads: BusinessLead[]) {
  cacheJsonArray(BUSINESS_LEADS_KEY, leads)
}

export function readClientMatters() {
  return readJsonArray<ClientMatter>(CLIENT_MATTERS_KEY, [])
}

export function writeClientMatters(matters: ClientMatter[]) {
  writeJsonArray(CLIENT_MATTERS_KEY, matters, CLIENT_MATTERS_UPDATED_EVENT)
}

export function cacheClientMatters(matters: ClientMatter[]) {
  cacheJsonArray(CLIENT_MATTERS_KEY, matters)
}

async function parseApiResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      typeof data?.message === 'string'
        ? data.message
        : typeof data?.error === 'string'
        ? data.error
        : fallbackMessage
    throw new Error(message)
  }
  return data as T
}

export async function fetchBusinessLeads() {
  const response = await fetch('/api/business/leads', {
    credentials: 'include',
    cache: 'no-store',
  })
  const data = await parseApiResponse<{ leads?: BusinessLead[] }>(response, 'Unable to load business leads.')
  return Array.isArray(data.leads) ? data.leads : []
}

export async function createBusinessLead(lead: Partial<BusinessLead>) {
  const response = await fetch('/api/business/leads', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead),
  })
  const data = await parseApiResponse<{ lead?: BusinessLead; matter?: ClientMatter | null }>(
    response,
    'Unable to create lead.',
  )
  if (!data.lead) throw new Error('Unable to create lead.')
  return data
}

export async function updateBusinessLeadStatus(id: string, status: LeadStatus) {
  const response = await fetch('/api/business/leads', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  })
  const data = await parseApiResponse<{
    lead?: BusinessLead
    matter?: ClientMatter | null
    matters?: ClientMatter[]
  }>(response, 'Unable to update lead.')
  if (!data.lead) throw new Error('Unable to update lead.')
  return {
    lead: data.lead,
    matter: data.matter ?? null,
    matters: Array.isArray(data.matters) ? data.matters : [],
  }
}

export async function fetchClientMatters() {
  const response = await fetch(CLIENT_MATTERS_API_PATH, {
    credentials: 'include',
    cache: 'no-store',
  })
  const data = await parseApiResponse<{ matters?: ClientMatter[] }>(response, 'Unable to load client matters.')
  return Array.isArray(data.matters) ? data.matters : []
}

export async function createClientMatter(matter: Partial<ClientMatter>) {
  const response = await fetch(CLIENT_MATTERS_API_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(matter),
  })
  const data = await parseApiResponse<{ matter?: ClientMatter }>(response, 'Unable to create matter.')
  if (!data.matter) throw new Error('Unable to create matter.')
  return data.matter
}

export async function updateClientMatter(id: string, patch: Partial<ClientMatter>) {
  const response = await fetch(CLIENT_MATTERS_API_PATH, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  })
  const data = await parseApiResponse<{ matter?: ClientMatter }>(response, 'Unable to update matter.')
  if (!data.matter) throw new Error('Unable to update matter.')
  return data.matter
}

function formatMatterNumber(leadId: string) {
  const digits = leadId.replace(/\D/g, '').padStart(4, '0').slice(-4)
  return `MC-${new Date().getFullYear()}-${digits || '0001'}`
}

function inferNextAction(lead: BusinessLead) {
  if (lead.documents.length === 0) return 'Request initial documents'
  if (lead.courtDate) return 'Review deadline and draft hearing plan'
  if (lead.urgency === 'high') return 'Book urgent triage call'
  return 'Prepare first advice note'
}

export function matterFromLead(lead: BusinessLead, existing?: ClientMatter): ClientMatter {
  const now = new Date().toISOString()
  return {
    id: existing?.id || `lead-${lead.id}`,
    leadId: lead.id,
    caseId: existing?.caseId ?? null,
    clientName: lead.name,
    email: lead.email,
    phone: lead.phone,
    location: lead.location,
    issueType: lead.issueType,
    urgency: lead.urgency,
    summary: lead.summary,
    fullDetails: lead.fullDetails,
    courtDate: lead.courtDate,
    opposing: lead.opposing,
    documents: lead.documents,
    tags: lead.tags,
    matterNumber: existing?.matterNumber || formatMatterNumber(lead.id),
    stage: existing?.stage || 'intake',
    status: existing?.status || 'active',
    owner: existing?.owner || 'Unassigned',
    nextAction: existing?.nextAction || inferNextAction(lead),
    nextDeadline: existing?.nextDeadline || lead.courtDate,
    lastActivity: existing?.lastActivity || now,
    acceptedAt: existing?.acceptedAt || now,
    currentBalance: existing?.currentBalance ?? 0,
  }
}

export function syncAcceptedLeadMatters(leads: BusinessLead[]) {
  const acceptedLeads = leads.filter((lead) => lead.status === 'accepted')
  const current = readClientMatters()
  let changed = false
  const next = [...current]

  acceptedLeads.forEach((lead) => {
    const existingIndex = next.findIndex((matter) => matter.leadId === lead.id)
    if (existingIndex >= 0) {
      const updated = matterFromLead(lead, next[existingIndex])
      if (JSON.stringify(updated) !== JSON.stringify(next[existingIndex])) {
        next[existingIndex] = updated
        changed = true
      }
      return
    }
    next.unshift(matterFromLead(lead))
    changed = true
  })

  if (changed) writeClientMatters(next)
  return next
}

export function upsertMatterFromLead(lead: BusinessLead) {
  return syncAcceptedLeadMatters([lead])
}

export function createBlankMatter(): ClientMatter {
  const now = new Date().toISOString()
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `manual-${Date.now()}`
  return {
    id,
    caseId: null,
    clientName: 'New client',
    email: '',
    phone: '',
    location: '',
    issueType: 'New legal matter',
    urgency: 'medium',
    summary: 'Add the client issue summary here.',
    fullDetails: 'Record the key background, deadlines, evidence, and agreed scope of support.',
    documents: [],
    tags: ['Manual'],
    matterNumber: `MC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    stage: 'intake',
    status: 'active',
    owner: 'Unassigned',
    nextAction: 'Complete client intake',
    lastActivity: now,
    acceptedAt: now,
    currentBalance: 0,
  }
}
