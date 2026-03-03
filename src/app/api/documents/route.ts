import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { documentLimitForPlan, planDisplayName } from '@/lib/plans/access'
import { getUserPlanData } from '@/lib/payments/user-plan'
import { getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse, uploadIpRateLimiter, uploadRateLimiter } from '@/lib/utils/rate-limit'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const DEFAULT_DOCUMENT_LIMIT = 100
const MAX_DOCUMENT_LIMIT = 250

const sanitizeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._\- ]/g, '').trim() || 'uploaded-document'

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = authData.user
    const { searchParams } = new URL(request.url)
    const limit = parseBoundedPositiveInt(searchParams.get('limit'), DEFAULT_DOCUMENT_LIMIT, MAX_DOCUMENT_LIMIT)
    const offset = parseBoundedPositiveInt(searchParams.get('offset'), 0, Number.MAX_SAFE_INTEGER)
    const rangeEnd = offset + limit

    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('id, name, type, created_at, file_size, mime_type, storage_path, storage_url, case_id')
      .is('deleted_at', null)
      .eq('uploaded_by', user.id)
      .order('created_at', { ascending: false })
      .range(offset, rangeEnd)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = data || []
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
    const paid = Boolean(planData?.paidAccess)
    const planDocLimit = documentLimitForPlan(activePlanLabel)

    if (!paid || planDocLimit <= 0) {
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

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const { count: existingDocumentsCount, error: countError } = await supabaseAdmin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('uploaded_by', user.id)
      .is('deleted_at', null)

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    const usedDocuments = Number(existingDocumentsCount || 0)
    const requestedUploads = files.length
    if (usedDocuments + requestedUploads > planDocLimit) {
      const remaining = Math.max(planDocLimit - usedDocuments, 0)
      return NextResponse.json(
        {
          error: `Upload limit reached for ${planDisplayName(activePlanLabel)} plan. You can store up to ${planDocLimit} documents.`,
          limit: planDocLimit,
          used: usedDocuments,
          remaining,
          requested: requestedUploads,
        },
        { status: 403 }
      )
    }

    const caseId = caseIdFromForm || null
    if (caseId) {
      // Prevent orphaned storage uploads: validate ownership before uploading anything.
      const { data: ownedCase, error: ownedErr } = await supabaseAdmin
        .from('cases')
        .select('id')
        .eq('id', caseId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle()

      if (ownedErr) {
        return NextResponse.json({ error: ownedErr.message }, { status: 500 })
      }
      if (!ownedCase) {
        return NextResponse.json({ error: 'Forbidden caseId' }, { status: 403 })
      }
    }
    const results: any[] = []

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File too large. Max size is 25MB.` }, { status: 400 })
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

    return NextResponse.json({ documents: results })
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
