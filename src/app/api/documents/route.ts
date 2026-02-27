import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse, uploadIpRateLimiter, uploadRateLimiter } from '@/lib/utils/rate-limit'

const MAX_FILE_SIZE = 25 * 1024 * 1024

const sanitizeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._\- ]/g, '').trim() || 'uploaded-document'

const getExtension = (name: string) => {
  const parts = name.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'Document'
}

async function hasPaidAccess(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_type, status')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const label = String(data?.plan_type || '').toLowerCase()
  return Boolean(label && (label.includes('basic') || label.includes('premium')))
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = authData.user

    // Defense-in-depth: RLS already enforces access, but we also filter server-side.
    const { data: caseRows, error: casesErr } = await supabase
      .from('cases')
      .select('id')
      .eq('user_id', user.id)
      .is('deleted_at', null)

    if (casesErr) {
      return NextResponse.json({ error: casesErr.message }, { status: 500 })
    }

    const caseIds = (caseRows || []).map((r: any) => r.id).filter(Boolean)

    let query = supabase
      .from('documents')
      .select('id, name, type, created_at, file_size, mime_type, storage_path, storage_url, case_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (caseIds.length > 0) {
      query = query.or(`uploaded_by.eq.${user.id},case_id.in.(${caseIds.join(',')})`)
    } else {
      query = query.eq('uploaded_by', user.id)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ documents: data || [] })
  } catch (error: unknown) {
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
    const paid = await hasPaidAccess(user.id)
    if (!paid) {
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

    let caseId = caseIdFromForm || null
    if (caseId) {
      // Prevent orphaned storage uploads: validate ownership before uploading anything.
      const { data: ownedCase, error: ownedErr } = await supabase
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

      const { error: uploadError } = await supabase
        .storage
        .from('user-uploads')
        .upload(storagePath, file, { contentType: file.type || undefined })

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 })
      }

      const { data: inserted, error: insertError } = await supabase
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
          await supabase.storage.from('user-uploads').remove([storagePath])
        } catch {}
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      if (inserted) results.push(inserted)
    }

    return NextResponse.json({ documents: results })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
