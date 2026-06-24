import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'
import { createBusinessAlert } from '@/lib/business/alerts'
import { documentLimitForPlan, planDisplayName } from '@/lib/plans/access'
import { getUserPlanData } from '@/lib/payments/user-plan'
import { getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse, uploadIpRateLimiter, uploadRateLimiter } from '@/lib/utils/rate-limit'
import { EMAIL_ATTACHMENT_LABEL, isAllowedEmailAttachment } from '@/lib/inbox/attachment-policy'
import type { User } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const DEFAULT_DOCUMENT_LIMIT = 100
const MAX_DOCUMENT_LIMIT = 250
const ONBOARDING_DOCUMENT_LIMIT = documentLimitForPlan('basic')

const sanitizeFilename = (name: string) => {
  if (!name || typeof name !== 'string') return 'uploaded-document'
  const raw = name.trim()
  // Reject path traversal and path separators explicitly
  if (raw.includes('..') || raw.includes('/') || raw.includes('\\')) return 'uploaded-document'
  const cleaned = raw.replace(/[^a-zA-Z0-9._\- ]/g, '').trim()
  return cleaned || 'uploaded-document'
}

const getExtension = (name: string) => {
  const parts = name.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'Document'
}

const parseBoundedPositiveInt = (value: string | null, fallback: number, max: number): number => {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.min(parsed, max)
}

async function resolveCaseAccess(options: {
  supabase: Awaited<ReturnType<typeof createSupabaseRouteClient>>
  user: User
  caseId: string
}): Promise<'personal' | 'business' | null> {
  const { supabase, user, caseId } = options

  const { data: ownedCase, error: ownedErr } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (ownedErr) {
    throw new Error(ownedErr.message)
  }
  if (ownedCase) {
    return 'personal'
  }

  try {
    const workspace = await ensureBusinessContext(user)
    const { data: matterRow, error: matterError } = await supabaseAdmin
      .from('client_matters')
      .select('id')
      .eq('business_id', workspace.businessId)
      .eq('case_id', caseId)
      .maybeSingle()

    if (matterError) {
      throw new Error(matterError.message)
    }
    return matterRow ? 'business' : null
  } catch (error) {
    if (error instanceof BusinessWorkspaceError && error.status === 403) {
      return null
    }
    throw error
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = authData.user
    
    // Rate limit document list requests
    const ip = getClientIp(request.headers)
    const userRateLimit = await rateLimit(uploadRateLimiter, `documents:list:user:${getIdentifier(user.id, ip)}`, 30, 10 * 60 * 1000)
    if (!userRateLimit.success) {
      return rateLimitExceededResponse(userRateLimit, 'Too many document list requests. Please try again later.')
    }
    
    const { searchParams } = new URL(request.url)
    const limit = parseBoundedPositiveInt(searchParams.get('limit'), DEFAULT_DOCUMENT_LIMIT, MAX_DOCUMENT_LIMIT)
    const offset = parseBoundedPositiveInt(searchParams.get('offset'), 0, Number.MAX_SAFE_INTEGER)
    const caseIdFilter = (searchParams.get('caseId') || '').trim() || null
    const rangeEnd = offset + limit
    let caseAccess: 'personal' | 'business' | null = null

    if (caseIdFilter) {
      try {
        caseAccess = await resolveCaseAccess({ supabase, user, caseId: caseIdFilter })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to verify case access.'
        return NextResponse.json({ error: message }, { status: 500 })
      }
      if (!caseAccess) {
        return NextResponse.json({ error: 'Forbidden caseId' }, { status: 403 })
      }
    }

    const preferredSelect = 'id, name, type, created_at, file_size, mime_type, storage_path, storage_url, case_id, starred'
    const fallbackSelect = 'id, name, type, created_at, file_size, mime_type, storage_path, storage_url, case_id'

    let preferredQuery = (caseAccess === 'business' ? supabaseAdmin : supabase)
      .from('documents')
      .select(preferredSelect)
      .is('deleted_at', null)
    if (!caseIdFilter) {
      preferredQuery = preferredQuery.eq('uploaded_by', user.id)
    }
    if (caseIdFilter) {
      preferredQuery = preferredQuery.eq('case_id', caseIdFilter)
      if (caseAccess === 'business') {
        preferredQuery = preferredQuery.eq('uploaded_by', user.id)
      }
    }
    const preferredResult = await preferredQuery
      .order('created_at', { ascending: false })
      .range(offset, rangeEnd)
    let error = preferredResult.error
    let rowsRaw: any[] | null = (preferredResult.data as any[] | null) ?? null

    // Backward-compatible fallback while starred migration rolls out.
    if (error && /starred/i.test(error.message || '')) {
      let fallbackQuery = (caseAccess === 'business' ? supabaseAdmin : supabase)
        .from('documents')
        .select(fallbackSelect)
        .is('deleted_at', null)
      if (!caseIdFilter) {
        fallbackQuery = fallbackQuery.eq('uploaded_by', user.id)
      }
      if (caseIdFilter) {
        fallbackQuery = fallbackQuery.eq('case_id', caseIdFilter)
        if (caseAccess === 'business') {
          fallbackQuery = fallbackQuery.eq('uploaded_by', user.id)
        }
      }
      const fallbackResult = await fallbackQuery
        .order('created_at', { ascending: false })
        .range(offset, rangeEnd)
      rowsRaw = (fallbackResult.data as any[] | null) ?? null
      error = fallbackResult.error
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (rowsRaw || []).map((row: any) => ({
      ...row,
      starred: Boolean(row?.starred),
    }))
    const hasMore = rows.length > limit
    const documents = rows.slice(0, limit)

    return NextResponse.json({
      documents,
      pagination: {
        limit,
        offset,
        hasMore,
        nextOffset: offset + Math.min(rows.length, limit),
      },
    })
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Failed to fetch documents'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const planData = await getUserPlanData(user.id, user.email || null, { bypassCache: true })
    const activePlanLabel = planData?.plan || 'No plan'
    const platformAccess = Boolean(planData?.platformAccess ?? planData?.paidAccess)
    const planDocLimit = documentLimitForPlan(activePlanLabel)
    const effectiveDocumentLimit = planDocLimit > 0 ? planDocLimit : (platformAccess ? ONBOARDING_DOCUMENT_LIMIT : 0)

    if (!platformAccess || effectiveDocumentLimit <= 0) {
      return NextResponse.json(
        { error: 'Read-only mode: resume plan to upload documents. Existing documents remain safe.' },
        { status: 402 }
      )
    }
    const ip = getClientIp(request.headers)
    const userLimit = await rateLimit(uploadRateLimiter, `upload:documents:user:${getIdentifier(user.id, ip)}`, 20, 10 * 60 * 1000)
    if (!userLimit.success) {
      return rateLimitExceededResponse(userLimit, 'Too many document upload requests. Please try again later.')
    }
    if (ip) {
      const ipLimit = await rateLimit(uploadIpRateLimiter, `upload:documents:ip:${ip}`, 60, 10 * 60 * 1000)
      if (!ipLimit.success) {
        return rateLimitExceededResponse(ipLimit, 'Too many upload requests from this network. Please try again later.')
      }
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }
    const files = formData.getAll('files').filter(Boolean) as File[]
    const caseIdFromForm = formData.get('caseId') as string | null
    const source = String(formData.get('source') || '').trim().toLowerCase()
    const caseId = caseIdFromForm || null

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const countClient = source === 'business-inbox-attachment' ? supabaseAdmin : supabase
    const { count: existingDocumentsCount, error: countError } = await countClient
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('uploaded_by', user.id)
      .is('deleted_at', null)

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    const usedDocuments = Number(existingDocumentsCount || 0)
    const requestedUploads = files.length
    if (usedDocuments + requestedUploads > effectiveDocumentLimit) {
      const remaining = Math.max(effectiveDocumentLimit - usedDocuments, 0)
      const limitLabel = planDocLimit > 0 ? planDisplayName(activePlanLabel) : 'your current access'
      return NextResponse.json(
        {
          error: `Upload limit reached for ${limitLabel}. You can store up to ${effectiveDocumentLimit} documents.`,
          limit: effectiveDocumentLimit,
          used: usedDocuments,
          remaining,
          requested: requestedUploads,
        },
        { status: 403 }
      )
    }

    if (caseId) {
      // Prevent orphaned storage uploads: validate access before uploading anything.
      try {
        const caseAccess = await resolveCaseAccess({ supabase, user, caseId })
        if (!caseAccess) {
          return NextResponse.json({ error: 'Forbidden caseId' }, { status: 403 })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to verify case access.'
        return NextResponse.json({ error: message }, { status: 500 })
      }
    }
    const results: any[] = []

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File too large. Max size is 25MB.` }, { status: 400 })
      }

      if (source === 'business-inbox-attachment' && !isAllowedEmailAttachment({ name: file.name, mimeType: file.type || null })) {
        return NextResponse.json(
          { error: `That file type is not allowed for inbox attachments. Use ${EMAIL_ATTACHMENT_LABEL}.` },
          { status: 400 },
        )
      }

      const cleanName = sanitizeFilename(file.name)
      const storagePath = `${user.id}/${Date.now()}-${cleanName}`
      const mimeType = file.type || null
      const docType = getExtension(cleanName)

      const { error: uploadError } = await supabaseAdmin
        .storage
        .from('user-uploads')
        .upload(storagePath, file, { contentType: file.type || undefined })

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 })
      }

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('documents')
        .insert({
          case_id: caseId,
          name: cleanName,
          storage_url: storagePath,
          storage_path: storagePath,
          type: docType,
          file_size: file.size,
          mime_type: mimeType,
          uploaded_by: user.id
        })
        .select('id, name, type, created_at, file_size, mime_type, storage_path, storage_url, case_id')
        .single()

      if (insertError) {
        // Avoid leaking storage objects if DB insert fails post-upload.
        try {
          await supabaseAdmin.storage.from('user-uploads').remove([storagePath])
        } catch {}
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      if (inserted) results.push(inserted)
    }

    if (source === 'client-portal' && results.length > 0) {
      const clientName =
        String(user.user_metadata?.full_name || user.user_metadata?.display_name || '').trim() ||
        String(user.email || '').split('@')[0] ||
        'Client'
      const uploadedNames = results
        .map((doc) => String(doc.name || 'Document'))
        .filter(Boolean)
      const previewNames = uploadedNames.slice(0, 3)
      const previewSuffix = uploadedNames.length > previewNames.length ? ', ...' : ''
      const documentLabel = results.length === 1 ? 'document' : 'documents'

      const { data: links, error: linksError } = await supabaseAdmin
        .from('client_business_links')
        .select('business_id')
        .eq('client_id', user.id)
        .eq('status', 'active')

      if (!linksError && Array.isArray(links) && links.length > 0) {
        await Promise.all(
          links.map((link) =>
            createBusinessAlert({
              businessId: String(link.business_id),
              type: 'document',
              priority: 'medium',
              title: `${clientName} uploaded ${results.length} ${documentLabel}`,
              body: `${clientName} uploaded ${results.length} ${documentLabel}${uploadedNames.length > 0 ? `: ${previewNames.join(', ')}${previewSuffix}` : ''}.`,
              clientName,
              actionLabel: 'View Documents',
              metadata: {
                clientId: user.id,
                clientEmail: user.email || null,
                documentCount: results.length,
                documentIds: results.map((doc) => doc.id),
                source: 'client-portal',
              },
            }),
          ),
        )
      }
    }

    return NextResponse.json({ documents: results })
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
