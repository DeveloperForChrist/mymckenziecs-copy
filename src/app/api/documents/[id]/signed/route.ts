import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

async function loadClientCaseIds(userId: string, userEmail: string) {
  const { data: links } = await supabaseAdmin
    .from('client_business_links')
    .select('business_id')
    .eq('client_id', userId)
    .eq('status', 'active')

  const email = normalizeEmail(userEmail)
  if (!email || !Array.isArray(links)) return []

  const caseIds: string[] = []
  for (const link of links) {
    const businessId = String((link as Record<string, unknown>).business_id || '')
    if (!businessId) continue
    const { data: matter } = await supabaseAdmin
      .from('client_matters')
      .select('case_id')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .eq('email', email)
      .not('case_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (matter?.case_id) caseIds.push(String(matter.case_id))
  }
  return Array.from(new Set(caseIds))
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  void request
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const { data: document, error } = await supabase
    .from('documents')
    .select('id, storage_path, mime_type, name, uploaded_by, case_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (!document.storage_path) {
    return NextResponse.json({ error: 'No storage path' }, { status: 400 })
  }

  const isOwner = document.uploaded_by === user.id
  let isSharedAttachment = false
  let isSharedCaseDoc = false
  if (!isOwner && user.email) {
    const userEmail = normalizeEmail(user.email)
    const clientCaseIds = await loadClientCaseIds(user.id, user.email)
    const [receivedMessagesResult, sentMessagesResult] = await Promise.all([
      supabaseAdmin
        .from('inbox_messages')
        .select('metadata')
        .eq('recipient_email', userEmail)
        .limit(200),
      supabaseAdmin
        .from('inbox_messages')
        .select('metadata')
        .eq('sender_id', user.id)
        .limit(200),
    ])

    const candidateMessages = [
      ...(receivedMessagesResult.data || []),
      ...(sentMessagesResult.data || []),
    ]

    isSharedAttachment = candidateMessages.some((message: any) => {
      const attachments = Array.isArray(message?.metadata?.attachments) ? message.metadata.attachments : []
      return attachments.some((attachment: any) => String(attachment?.documentId || attachment?.id || '').trim() === id)
    })

    isSharedCaseDoc = Boolean(document.case_id && clientCaseIds.includes(String(document.case_id)))
  }

  if (!isOwner && !isSharedAttachment && !isSharedCaseDoc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const { data: signed, error: signedError } = await supabaseAdmin
    .storage
    .from('user-uploads')
    .createSignedUrl(document.storage_path, 60 * 15)

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: signedError?.message || 'Failed to create signed URL' }, { status: 500 })
  }

  return NextResponse.json({
    url: signed.signedUrl,
    mimeType: document.mime_type,
    name: document.name
  })
}
