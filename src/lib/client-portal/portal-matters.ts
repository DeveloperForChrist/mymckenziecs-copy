import { supabaseAdmin } from '@/lib/database/supabase-server'

type ClientPortalLinkRow = {
  id?: string | number | null
  business_id?: string | number | null
  client_name?: string | null
  client_email?: string | null
  status?: string | null
  updated_at?: string | null
  created_at?: string | null
  businesses?: {
    name?: string | null
  } | null
}

type ClientPortalMatterRow = {
  id?: string | number | null
  business_id?: string | number | null
  client_name?: string | null
  email?: string | null
  phone?: string | null
  location?: string | null
  case_id?: string | null
  matter_number?: string | null
  issue_type?: string | null
  urgency?: string | null
  summary?: string | null
  full_details?: string | null
  court_date?: string | null
  opposing?: string | null
  documents?: unknown
  tags?: unknown
  status?: string | null
  stage?: string | null
  owner?: string | null
  next_action?: string | null
  next_deadline?: string | null
  accepted_at?: string | null
  last_activity_at?: string | null
  current_balance?: number | string | null
}

export type ClientPortalMatter = {
  id: string
  businessId: string
  businessName: string
  clientName: string
  email: string
  phone: string
  location: string
  caseId: string | null
  matterNumber: string
  issueType: string
  urgency: string
  summary: string
  fullDetails: string
  courtDate: string | null
  opposing: string
  documents: string[]
  tags: string[]
  status: string
  stage: string
  owner: string
  nextAction: string
  nextDeadline: string | null
  acceptedAt: string | null
  lastActivityAt: string | null
  currentBalance: number
}

export type ClientPortalLink = {
  id: string
  businessId: string
  businessName: string
  clientName: string
  clientEmail: string
  status: string
  updatedAt: string | null
  createdAt: string | null
}

export function normalizePortalEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

export async function loadClientPortalLinks(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('client_business_links')
    .select('id, business_id, client_name, client_email, status, updated_at, created_at, businesses(name)')
    .eq('client_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error || !Array.isArray(data)) return []

  return data
    .map((row) => {
      const typedRow = row as ClientPortalLinkRow
      return {
        id: String(typedRow.id || ''),
        businessId: String(typedRow.business_id || ''),
        businessName: String(typedRow.businesses?.name || 'Legal Professional'),
        clientName: String(typedRow.client_name || '').trim() || 'Client',
        clientEmail: normalizePortalEmail(typedRow.client_email),
        status: String(typedRow.status || 'active'),
        updatedAt: typeof typedRow.updated_at === 'string' ? typedRow.updated_at : null,
        createdAt: typeof typedRow.created_at === 'string' ? typedRow.created_at : null,
      }
    })
    .filter((row) => row.id && row.businessId)
}

export async function loadClientPortalMatters(userId: string, userEmail: string) {
  const links = await loadClientPortalLinks(userId)
  const businessIds = Array.from(new Set(links.map((link) => link.businessId).filter(Boolean)))
  const email = normalizePortalEmail(userEmail)

  if (!email || businessIds.length === 0) {
    return { links, matters: [] as ClientPortalMatter[] }
  }

  const { data: matters, error } = await supabaseAdmin
    .from('client_matters')
    .select('id, business_id, client_name, email, phone, location, case_id, matter_number, issue_type, urgency, summary, full_details, court_date, opposing, documents, tags, status, stage, owner, next_action, next_deadline, accepted_at, last_activity_at, current_balance')
    .in('business_id', businessIds)
    .eq('email', email)
    .eq('status', 'active')
    .neq('stage', 'closed')
    .order('last_activity_at', { ascending: false, nullsFirst: false })
    .order('accepted_at', { ascending: false, nullsFirst: false })

  if (error || !Array.isArray(matters)) {
    return { links, matters: [] as ClientPortalMatter[] }
  }

  const businessNames = new Map(links.map((link) => [link.businessId, link.businessName]))

  return {
    links,
    matters: matters.map((row) => {
      const typedRow = row as ClientPortalMatterRow
      return {
        id: String(typedRow.id || ''),
        businessId: String(typedRow.business_id || ''),
        businessName: businessNames.get(String(typedRow.business_id || '')) || 'Legal Professional',
        clientName: String(typedRow.client_name || '').trim() || 'Client',
        email: normalizePortalEmail(typedRow.email),
        phone: String(typedRow.phone || '').trim(),
        location: String(typedRow.location || '').trim(),
        caseId: typeof typedRow.case_id === 'string' ? typedRow.case_id : null,
        matterNumber: String(typedRow.matter_number || '').trim(),
        issueType: String(typedRow.issue_type || 'Client matter').trim() || 'Client matter',
        urgency: String(typedRow.urgency || 'medium').trim().toLowerCase() || 'medium',
        summary: String(typedRow.summary || '').trim(),
        fullDetails: String(typedRow.full_details || '').trim(),
        courtDate: typeof typedRow.court_date === 'string' ? typedRow.court_date : null,
        opposing: String(typedRow.opposing || '').trim(),
        documents: Array.isArray(typedRow.documents) ? typedRow.documents.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : [],
        tags: Array.isArray(typedRow.tags) ? typedRow.tags.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : [],
        status: String(typedRow.status || 'active').trim().toLowerCase() || 'active',
        stage: String(typedRow.stage || 'intake').trim().toLowerCase() || 'intake',
        owner: String(typedRow.owner || 'Unassigned').trim() || 'Unassigned',
        nextAction: String(typedRow.next_action || '').trim(),
        nextDeadline: typeof typedRow.next_deadline === 'string' ? typedRow.next_deadline : null,
        acceptedAt: typeof typedRow.accepted_at === 'string' ? typedRow.accepted_at : null,
        lastActivityAt: typeof typedRow.last_activity_at === 'string' ? typedRow.last_activity_at : null,
        currentBalance: typeof typedRow.current_balance === 'number' ? typedRow.current_balance : Number(typedRow.current_balance || 0),
      }
    }).filter((row) => row.id && row.businessId),
  }
}
