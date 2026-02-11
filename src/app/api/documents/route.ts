import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'

const MAX_FILE_SIZE = 25 * 1024 * 1024

const sanitizeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._\- ]/g, '').trim() || 'uploaded-document'

const getExtension = (name: string) => {
  const parts = name.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'Document'
}

export async function GET() {
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('documents')
    .select('id, name, type, created_at, file_size, mime_type, storage_path, storage_url, case_id')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ documents: data || [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const files = formData.getAll('files').filter(Boolean) as File[]
  const caseIdFromForm = formData.get('caseId') as string | null

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  let caseId = caseIdFromForm || null
  if (!caseId) {
    const { data: cases, error: caseError } = await supabase
      .from('cases')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (caseError) {
      return NextResponse.json({ error: caseError.message }, { status: 500 })
    }
    caseId = cases?.[0]?.id || null
  }

  if (!caseId) {
    const { data: created, error: createError } = await supabase
      .from('cases')
      .insert({
        title: 'General uploads',
        case_type: null,
        description: 'Auto-created case for document uploads.',
        user_id: user.id
      })
      .select('id')
      .single()

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }
    caseId = created?.id || null
  }

  if (!caseId) {
    return NextResponse.json({ error: 'Unable to create a case for uploads.' }, { status: 500 })
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
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    if (inserted) results.push(inserted)
  }

  return NextResponse.json({ documents: results })
}
