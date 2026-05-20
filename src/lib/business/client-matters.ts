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

export const DEFAULT_BUSINESS_LEADS: BusinessLead[] = [
  {
    id: '1',
    name: 'James Okafor',
    email: 'james.okafor@email.com',
    phone: '07700 900142',
    location: 'London, SE1',
    issueType: 'Housing Disrepair',
    urgency: 'high',
    summary: 'Landlord has failed to repair severe damp and mould for 8 months. Section 21 notice also received.',
    fullDetails:
      'I have been living in my rented property for 3 years. For the past 8 months, the landlord has failed to address severe damp and mould in the bedroom and kitchen despite multiple written requests.\n\nThe property is causing health issues for my two young children (ages 4 and 7). I have documentation from our GP linking the mould to respiratory problems.\n\nAdditionally, I received a Section 21 notice 2 weeks ago which I believe may be retaliatory given I recently complained to the council.\n\nI need help understanding my rights and potentially challenging the S21 notice while pursuing disrepair remedies.',
    courtDate: '2026-06-15',
    opposing: 'Private Landlord (individual)',
    documents: ['GP letter', 'S21 notice', 'Repair request emails'],
    tags: ['Housing', 'Section 21', 'Disrepair', 'Retaliatory eviction'],
    submittedAt: '10 min ago',
    status: 'new',
    source: 'portal',
  },
  {
    id: '2',
    name: 'Priya Sharma',
    email: 'priya.sharma@gmail.com',
    phone: '07800 123456',
    location: 'Birmingham, B3',
    issueType: 'Employment - Unfair Dismissal',
    urgency: 'high',
    summary: 'Dismissed after raising a whistleblowing complaint. 4 years 9 months service. ET claim deadline approaching.',
    fullDetails:
      'I was dismissed from my role as a warehouse supervisor on 12 April 2026, approximately 6 weeks after raising a formal whistleblowing complaint about safety violations.\n\nI have 4 years and 9 months of continuous service. My employer cited "restructuring" as the reason but my role was immediately filled by a colleague who had not raised any complaints.\n\nMy Employment Tribunal claim deadline is fast approaching (3 months from dismissal = 12 July 2026). I need urgent assistance with the ET1 form and understanding my prospects of success for both unfair dismissal and whistleblowing detriment claims.',
    documents: ['Dismissal letter', 'Whistleblowing email', 'Employment contract'],
    tags: ['Employment', 'Whistleblowing', 'Unfair Dismissal', 'ET1 Urgent'],
    submittedAt: '45 min ago',
    status: 'new',
    source: 'portal',
  },
  {
    id: '3',
    name: 'David Clarke',
    email: 'd.clarke@outlook.com',
    phone: '07911 654321',
    location: 'Manchester, M1',
    issueType: 'Small Claims - Breach of Contract',
    urgency: 'medium',
    summary: 'Contractor abandoned kitchen renovation 60% complete and is refusing to refund GBP 4,200 deposit.',
    fullDetails:
      'I hired a contractor in January 2026 to renovate my kitchen for a total cost of GBP 7,000. I paid a GBP 4,200 deposit upfront.\n\nThe contractor completed approximately 60% of the work then stopped attending. He has not responded to calls or messages for 5 weeks. The kitchen is currently unusable.\n\nI have a signed written contract, all payment receipts, and WhatsApp messages. I also have quotes from two other contractors to complete/rectify the work ranging from GBP 3,800 to GBP 4,500.\n\nI want to issue a small claims court claim for the full deposit plus additional remediation costs.',
    documents: ['Signed contract', 'Bank receipts', 'Completion quotes'],
    tags: ['Small Claims', 'Contractor', 'Breach of Contract', 'Consumer'],
    submittedAt: '2 hours ago',
    status: 'pending',
    source: 'portal',
  },
  {
    id: '4',
    name: 'Angela Mensah',
    email: 'angela.m@yahoo.co.uk',
    phone: '07500 789012',
    location: 'Bristol, BS1',
    issueType: 'Family - Child Arrangements',
    urgency: 'medium',
    summary: 'Ex-partner is withholding contact with children contrary to informal agreement. Seeking CAO.',
    fullDetails:
      'Following separation from my partner in November 2025, we informally agreed that I would have the children every other weekend and one weekday evening per week.\n\nSince February 2026, my ex has been consistently cancelling arrangements with little notice. In March the children were withheld entirely for 3 weeks.\n\nI have tried mediation but my ex refused to attend a second session. I need help applying for a Child Arrangements Order and understanding the MIAM exemption process.',
    documents: ['Mediation certificate', 'Message logs'],
    tags: ['Family', 'Child Arrangements', 'CAO', 'Contact'],
    submittedAt: '1 day ago',
    status: 'accepted',
    source: 'referral',
  },
]

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
  const response = await fetch('/api/business/client-matters', {
    credentials: 'include',
    cache: 'no-store',
  })
  const data = await parseApiResponse<{ matters?: ClientMatter[] }>(response, 'Unable to load client matters.')
  return Array.isArray(data.matters) ? data.matters : []
}

export async function createClientMatter(matter: Partial<ClientMatter>) {
  const response = await fetch('/api/business/client-matters', {
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
  const response = await fetch('/api/business/client-matters', {
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
