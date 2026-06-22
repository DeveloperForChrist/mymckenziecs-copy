import 'server-only'

import { supabaseAdmin } from '@/lib/database/supabase-server'
import { loadClientPortalMatters, normalizePortalEmail } from '@/lib/client-portal/portal-matters'

export type AccessibleDocument = {
  id: string
  storage_path: string | null
  mime_type: string | null
  name: string | null
  uploaded_by: string | null
  case_id: string | null
}

export function extractAttachmentDocumentIds(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return []
  const attachments = Array.isArray((metadata as any).attachments) ? (metadata as any).attachments : []
  return attachments
    .map((attachment: any) => String(attachment?.documentId || attachment?.id || '').trim())
    .filter(Boolean)
}

export function isMissingDocumentSharesTable(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = String((error as any).code || '')
  const message = String((error as any).message || '').toLowerCase()
  return code === '42P01' || code === 'PGRST205' || message.includes('document_client_shares')
}

async function hasActiveShare(userId: string, documentId: string, activeMatterIds: Set<string>) {
  const { data, error } = await supabaseAdmin
    .from('document_client_shares')
    .select('matter_id')
    .eq('client_id', userId)
    .eq('document_id', documentId)
    .is('revoked_at', null)

  if (error) {
    if (isMissingDocumentSharesTable(error)) return false
    throw error
  }

  return (data || []).some((share: any) => activeMatterIds.has(String(share.matter_id || '')))
}

async function hasLegacyMessageShare(
  userEmail: string,
  documentId: string,
  documentOwnerId: string | null,
  activeMatterIds: Set<string>,
  activeBusinessIds: Set<string>,
) {
  const normalizedEmail = normalizePortalEmail(userEmail)
  if (!normalizedEmail) return false

  const { data, error } = await supabaseAdmin
    .from('inbox_messages')
    .select('sender_id, metadata')
    .eq('recipient_email', normalizedEmail)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw error

  return (data || []).some((message: any) => {
    if (!documentOwnerId || String(message?.sender_id || '') !== documentOwnerId) return false
    const metadata = message?.metadata
    const matterId = typeof metadata?.matterId === 'string' ? metadata.matterId : ''
    const businessId = typeof metadata?.businessId === 'string' ? metadata.businessId : ''
    if (matterId && !activeMatterIds.has(matterId)) return false
    if (!matterId && (!businessId || !activeBusinessIds.has(businessId))) return false
    return extractAttachmentDocumentIds(metadata).includes(documentId)
  })
}

export async function getClientAccessibleDocument(options: {
  userId: string
  userEmail: string
  documentId: string
}): Promise<AccessibleDocument | null> {
  const { data: document, error } = await supabaseAdmin
    .from('documents')
    .select('id, storage_path, mime_type, name, uploaded_by, case_id')
    .eq('id', options.documentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !document) return null
  if (document.uploaded_by === options.userId) return document as AccessibleDocument

  const { matters } = await loadClientPortalMatters(options.userId, options.userEmail)
  const activeMatterIds = new Set(matters.map((matter) => matter.id))
  const activeBusinessIds = new Set(matters.map((matter) => matter.businessId))
  if (activeMatterIds.size === 0) return null

  const explicitlyShared = await hasActiveShare(options.userId, options.documentId, activeMatterIds)
  if (explicitlyShared) return document as AccessibleDocument

  const legacyShared = await hasLegacyMessageShare(
    options.userEmail,
    options.documentId,
    document.uploaded_by ? String(document.uploaded_by) : null,
    activeMatterIds,
    activeBusinessIds,
  )
  return legacyShared ? (document as AccessibleDocument) : null
}
