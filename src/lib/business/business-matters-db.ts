import 'server-only'

import { supabaseAdmin } from '@/lib/database/supabase-server'
import {
  matterFromLead,
  type BusinessLead,
  type ClientMatter,
  type LeadSource,
  type LeadStatus,
  type MatterStage,
  type MatterStatus,
  type Urgency,
} from './client-matters'

const LEAD_STATUSES: LeadStatus[] = ['new', 'accepted', 'declined', 'pending']
const URGENCIES: Urgency[] = ['high', 'medium', 'low']
const LEAD_SOURCES: LeadSource[] = ['portal', 'referral', 'direct']
const MATTER_STAGES: MatterStage[] = ['intake', 'documents', 'advice', 'hearing', 'closed']
const MATTER_STATUSES: MatterStatus[] = ['active', 'archived']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
let caseIdColumnSupported: boolean | null = null

function toText(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim()
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function toTextArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => toText(item)).filter(Boolean)
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function dateOnly(value: unknown) {
  const text = toText(value)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function isoDateTime(value: unknown, fallback = new Date().toISOString()) {
  const text = toText(value)
  if (!text) return fallback
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toISOString()
}

function maybeUuid(value: unknown) {
  const text = toText(value)
  return UUID_PATTERN.test(text) ? text : null
}

export function rowToBusinessLead(row: any): BusinessLead {
  return {
    id: toText(row?.id),
    name: toText(row?.name, 'Unnamed lead'),
    email: toText(row?.email),
    phone: toText(row?.phone),
    location: toText(row?.location),
    issueType: toText(row?.issue_type),
    urgency: oneOf(row?.urgency, URGENCIES, 'medium'),
    summary: toText(row?.summary),
    fullDetails: toText(row?.full_details),
    courtDate: toText(row?.court_date) || undefined,
    opposing: toText(row?.opposing) || undefined,
    documents: toTextArray(row?.documents),
    tags: toTextArray(row?.tags),
    submittedAt: toText(row?.submitted_at || row?.created_at),
    status: oneOf(row?.status, LEAD_STATUSES, 'new'),
    source: oneOf(row?.source, LEAD_SOURCES, 'portal'),
  }
}

export function rowToClientMatter(row: any): ClientMatter {
  return {
    id: toText(row?.id),
    leadId: toText(row?.lead_id) || undefined,
    caseId: maybeUuid(row?.case_id),
    clientName: toText(row?.client_name, 'Unnamed client'),
    email: toText(row?.email),
    phone: toText(row?.phone),
    location: toText(row?.location),
    issueType: toText(row?.issue_type),
    urgency: oneOf(row?.urgency, URGENCIES, 'medium'),
    summary: toText(row?.summary),
    fullDetails: toText(row?.full_details),
    courtDate: toText(row?.court_date) || undefined,
    opposing: toText(row?.opposing) || undefined,
    documents: toTextArray(row?.documents),
    tags: toTextArray(row?.tags),
    matterNumber: toText(row?.matter_number),
    stage: oneOf(row?.stage, MATTER_STAGES, 'intake'),
    status: oneOf(row?.status, MATTER_STATUSES, 'active'),
    owner: toText(row?.owner, 'Unassigned'),
    nextAction: toText(row?.next_action),
    nextDeadline: toText(row?.next_deadline) || undefined,
    lastActivity: toText(row?.last_activity_at || row?.updated_at || row?.created_at),
    acceptedAt: toText(row?.accepted_at || row?.created_at),
    currentBalance: toNumber(row?.current_balance),
  }
}

export function businessLeadToRow(lead: Partial<BusinessLead>, businessId: string, userId: string) {
  const submittedAt = isoDateTime(lead.submittedAt)

  return {
    business_id: businessId,
    created_by_user_id: userId,
    name: toText(lead.name, 'Unnamed lead').slice(0, 180),
    email: toText(lead.email).slice(0, 240),
    phone: toText(lead.phone).slice(0, 80),
    location: toText(lead.location).slice(0, 180),
    issue_type: toText(lead.issueType).slice(0, 180),
    urgency: oneOf(lead.urgency, URGENCIES, 'medium'),
    summary: toText(lead.summary).slice(0, 1200),
    full_details: toText(lead.fullDetails).slice(0, 8000),
    court_date: dateOnly(lead.courtDate),
    opposing: toText(lead.opposing).slice(0, 240) || null,
    documents: toTextArray(lead.documents).slice(0, 50),
    tags: toTextArray(lead.tags).slice(0, 30),
    status: oneOf(lead.status, LEAD_STATUSES, 'new'),
    source: oneOf(lead.source, LEAD_SOURCES, 'portal'),
    submitted_at: submittedAt,
    accepted_at: lead.status === 'accepted' ? submittedAt : null,
    declined_at: lead.status === 'declined' ? submittedAt : null,
  }
}

export function clientMatterToRow(matter: Partial<ClientMatter>, businessId: string) {
  const row: Record<string, any> = {
    business_id: businessId,
    lead_id: maybeUuid(matter.leadId),
    case_id: maybeUuid(matter.caseId),
    client_name: toText(matter.clientName, 'New client').slice(0, 180),
    email: toText(matter.email).slice(0, 240),
    phone: toText(matter.phone).slice(0, 80),
    location: toText(matter.location).slice(0, 180),
    issue_type: toText(matter.issueType, 'New legal matter').slice(0, 180),
    urgency: oneOf(matter.urgency, URGENCIES, 'medium'),
    summary: toText(matter.summary).slice(0, 1200),
    full_details: toText(matter.fullDetails).slice(0, 8000),
    court_date: dateOnly(matter.courtDate),
    opposing: toText(matter.opposing).slice(0, 240) || null,
    documents: toTextArray(matter.documents).slice(0, 50),
    tags: toTextArray(matter.tags).slice(0, 30),
    matter_number: toText(matter.matterNumber, `MC-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`).slice(0, 80),
    stage: oneOf(matter.stage, MATTER_STAGES, 'intake'),
    status: oneOf(matter.status, MATTER_STATUSES, 'active'),
    owner: toText(matter.owner, 'Unassigned').slice(0, 120),
    next_action: toText(matter.nextAction).slice(0, 500),
    next_deadline: dateOnly(matter.nextDeadline),
    last_activity_at: isoDateTime(matter.lastActivity),
    accepted_at: isoDateTime(matter.acceptedAt),
    current_balance: toNumber(matter.currentBalance),
  }

  const id = maybeUuid(matter.id)
  if (id) row.id = id

  return row
}

export function leadUpdateToRow(body: Record<string, unknown>) {
  const update: Record<string, any> = {}
  if ('status' in body) {
    const status = oneOf(body.status, LEAD_STATUSES, 'new')
    update.status = status
    if (status === 'accepted') update.accepted_at = new Date().toISOString()
    if (status === 'declined') update.declined_at = new Date().toISOString()
  }
  if ('name' in body) update.name = toText(body.name, 'Unnamed lead').slice(0, 180)
  if ('email' in body) update.email = toText(body.email).slice(0, 240)
  if ('phone' in body) update.phone = toText(body.phone).slice(0, 80)
  if ('location' in body) update.location = toText(body.location).slice(0, 180)
  if ('issueType' in body) update.issue_type = toText(body.issueType).slice(0, 180)
  if ('urgency' in body) update.urgency = oneOf(body.urgency, URGENCIES, 'medium')
  if ('summary' in body) update.summary = toText(body.summary).slice(0, 1200)
  if ('fullDetails' in body) update.full_details = toText(body.fullDetails).slice(0, 8000)
  if ('courtDate' in body) update.court_date = dateOnly(body.courtDate)
  if ('opposing' in body) update.opposing = toText(body.opposing).slice(0, 240) || null
  if ('documents' in body) update.documents = toTextArray(body.documents).slice(0, 50)
  if ('tags' in body) update.tags = toTextArray(body.tags).slice(0, 30)
  if ('source' in body) update.source = oneOf(body.source, LEAD_SOURCES, 'portal')
  return update
}

export function matterUpdateToRow(body: Record<string, unknown>) {
  const update: Record<string, any> = {}
  if ('clientName' in body) update.client_name = toText(body.clientName, 'New client').slice(0, 180)
  if ('email' in body) update.email = toText(body.email).slice(0, 240)
  if ('phone' in body) update.phone = toText(body.phone).slice(0, 80)
  if ('location' in body) update.location = toText(body.location).slice(0, 180)
  if ('issueType' in body) update.issue_type = toText(body.issueType, 'New legal matter').slice(0, 180)
  if ('urgency' in body) update.urgency = oneOf(body.urgency, URGENCIES, 'medium')
  if ('summary' in body) update.summary = toText(body.summary).slice(0, 1200)
  if ('fullDetails' in body) update.full_details = toText(body.fullDetails).slice(0, 8000)
  if ('courtDate' in body) update.court_date = dateOnly(body.courtDate)
  if ('opposing' in body) update.opposing = toText(body.opposing).slice(0, 240) || null
  if ('documents' in body) update.documents = toTextArray(body.documents).slice(0, 50)
  if ('tags' in body) update.tags = toTextArray(body.tags).slice(0, 30)
  if ('matterNumber' in body) update.matter_number = toText(body.matterNumber).slice(0, 80)
  if ('caseId' in body) update.case_id = maybeUuid(body.caseId)
  if ('stage' in body) update.stage = oneOf(body.stage, MATTER_STAGES, 'intake')
  if ('status' in body) update.status = oneOf(body.status, MATTER_STATUSES, 'active')
  if ('owner' in body) update.owner = toText(body.owner, 'Unassigned').slice(0, 120)
  if ('nextAction' in body) update.next_action = toText(body.nextAction).slice(0, 500)
  if ('nextDeadline' in body) update.next_deadline = dateOnly(body.nextDeadline)
  if ('currentBalance' in body) update.current_balance = toNumber(body.currentBalance)
  update.last_activity_at = new Date().toISOString()
  return update
}

async function supportsClientMattersCaseIdColumn() {
  if (caseIdColumnSupported !== null) return caseIdColumnSupported
  const { error } = await supabaseAdmin
    .from('client_matters')
    .select('case_id')
    .limit(1)

  if (!error) {
    caseIdColumnSupported = true
    return true
  }

  if (error.code === 'PGRST204' || error.code === '42703') {
    caseIdColumnSupported = false
    return false
  }

  throw error
}

async function normalizeClientMatterPayloadForSchema(payload: Record<string, any>) {
  if (Object.prototype.hasOwnProperty.call(payload, 'case_id')) {
    const supportsCaseId = await supportsClientMattersCaseIdColumn()
    if (!supportsCaseId) {
      const { case_id: _removed, ...rest } = payload
      return rest
    }
  }
  return payload
}

export async function loadBusinessLeadRows(businessId: string) {
  const { data, error } = await supabaseAdmin
    .from('business_leads')
    .select('*')
    .eq('business_id', businessId)
    .order('submitted_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function loadClientMatterRows(businessId: string) {
  const { data, error } = await supabaseAdmin
    .from('client_matters')
    .select('*')
    .eq('business_id', businessId)
    .order('last_activity_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function syncAcceptedLeadMatterRow(businessId: string, leadRow: any) {
  if (leadRow?.status !== 'accepted') return null

  const lead = rowToBusinessLead(leadRow)
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('client_matters')
    .select('*')
    .eq('business_id', businessId)
    .eq('lead_id', leadRow.id)
    .maybeSingle()

  if (existingError) throw existingError

  const matter = matterFromLead(lead, existing ? rowToClientMatter(existing) : undefined)
  const payload = await normalizeClientMatterPayloadForSchema(clientMatterToRow(matter, businessId))
  const { data, error } = await supabaseAdmin
    .from('client_matters')
    .upsert(payload, { onConflict: 'business_id,lead_id' })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function syncAcceptedLeadMatterRows(businessId: string, leadRows: any[]) {
  const synced = []
  for (const leadRow of leadRows) {
    const matter = await syncAcceptedLeadMatterRow(businessId, leadRow)
    if (matter) synced.push(matter)
  }
  return synced
}
