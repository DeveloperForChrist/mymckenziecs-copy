import { supabaseAdmin } from '@/lib/database/supabase-server'

export type ClientPortalMatter = {
  id: string
  businessId: string
  businessName: string
  clientName: string
  email: string
  caseId: string | null
  matterNumber: string
  issueType: string
  status: string
  stage: string
  nextAction: string
  nextDeadline: string | null
  acceptedAt: string | null
  lastActivityAt: string | null
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
    .map((row: any) => ({
      id: String(row.id || ''),
      businessId: String(row.business_id || ''),
      businessName: String(row.businesses?.name || 'Legal Professional'),
      clientName: String(row.client_name || '').trim() || 'Client',
      clientEmail: normalizePortalEmail(row.client_email),
      status: String(row.status || 'active'),
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
      createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    }))
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
    .select('id, business_id, client_name, email, case_id, matter_number, issue_type, status, stage, next_action, next_deadline, accepted_at, last_activity_at')
    .in('business_id', businessIds)
    .eq('email', email)
    .order('last_activity_at', { ascending: false, nullsFirst: false })
    .order('accepted_at', { ascending: false, nullsFirst: false })

  if (error || !Array.isArray(matters)) {
    return { links, matters: [] as ClientPortalMatter[] }
  }

  const businessNames = new Map(links.map((link) => [link.businessId, link.businessName]))

  return {
    links,
    matters: matters.map((row: any) => ({
      id: String(row.id || ''),
      businessId: String(row.business_id || ''),
      businessName: businessNames.get(String(row.business_id || '')) || 'Legal Professional',
      clientName: String(row.client_name || '').trim() || 'Client',
      email: normalizePortalEmail(row.email),
      caseId: typeof row.case_id === 'string' ? row.case_id : null,
      matterNumber: String(row.matter_number || '').trim(),
      issueType: String(row.issue_type || 'Client matter').trim() || 'Client matter',
      status: String(row.status || 'active').trim().toLowerCase() || 'active',
      stage: String(row.stage || 'intake').trim().toLowerCase() || 'intake',
      nextAction: String(row.next_action || '').trim(),
      nextDeadline: typeof row.next_deadline === 'string' ? row.next_deadline : null,
      acceptedAt: typeof row.accepted_at === 'string' ? row.accepted_at : null,
      lastActivityAt: typeof row.last_activity_at === 'string' ? row.last_activity_at : null,
    })).filter((row) => row.id && row.businessId),
  }
}
