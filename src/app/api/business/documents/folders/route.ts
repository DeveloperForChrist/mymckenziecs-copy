import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'

type FolderRow = {
  id: string | null
  name: string | null
}

type AssignmentRow = {
  document_id: string | null
  folder_id: string | null
}

const isMissingDocumentFoldersTableError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string; message?: string }
  if (candidate.code === 'PGRST205' || candidate.code === '42P01') return true
  return typeof candidate.message === 'string' && (
    candidate.message.includes('public.document_folders') ||
    candidate.message.includes('public.document_folder_assignments') ||
    candidate.message.includes("Could not find the table 'public.document_folders'") ||
    candidate.message.includes("Could not find the table 'public.document_folder_assignments'")
  )
}

const missingDocumentFoldersResponse = () => NextResponse.json(
  { error: 'Document folders are not ready yet. Apply the latest Supabase migrations first.' },
  { status: 503 },
)

async function getBusinessUser() {
  const supabase = await createSupabaseRouteClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  try {
    await ensureBusinessContext(data.user)
  } catch (error) {
    if (error instanceof BusinessWorkspaceError) {
      return { error: NextResponse.json({ error: error.message }, { status: error.status }) }
    }
    throw error
  }

  return { user: data.user }
}

export async function GET() {
  try {
    const auth = await getBusinessUser()
    if (auth.error) return auth.error

    const userId = auth.user.id
    const [{ data: folders, error: foldersError }, { data: assignments, error: assignmentsError }] = await Promise.all([
      supabaseAdmin
        .from('document_folders')
        .select('id, name')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('document_folder_assignments')
        .select('document_id, folder_id')
        .eq('user_id', userId),
    ])

    if (foldersError) {
      if (isMissingDocumentFoldersTableError(foldersError)) {
        return NextResponse.json({ folders: [], folderMap: {}, setupRequired: true })
      }
      return NextResponse.json({ error: foldersError.message || 'Unable to load folders.' }, { status: 500 })
    }
    if (assignmentsError) {
      if (isMissingDocumentFoldersTableError(assignmentsError)) {
        return NextResponse.json({ folders: [], folderMap: {}, setupRequired: true })
      }
      return NextResponse.json({ error: assignmentsError.message || 'Unable to load folder assignments.' }, { status: 500 })
    }

    const folderMap = Object.fromEntries(
      (assignments || []).flatMap((row) => {
        const typed = row as AssignmentRow
        return typed.document_id && typed.folder_id ? [[typed.document_id, typed.folder_id]] : []
      })
    )

    return NextResponse.json({
      folders: (folders || []).map((row) => {
        const typed = row as FolderRow
        return {
          id: String(typed.id || ''),
          name: String(typed.name || 'Folder'),
        }
      }),
      folderMap,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load folders.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getBusinessUser()
    if (auth.error) return auth.error

    const body = await request.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Folder name is required.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('document_folders')
      .insert({ user_id: auth.user.id, name })
      .select('id, name')
      .maybeSingle()

    if (error) {
      if (isMissingDocumentFoldersTableError(error)) return missingDocumentFoldersResponse()
      return NextResponse.json({ error: error.message || 'Unable to create folder.' }, { status: 500 })
    }

    return NextResponse.json({
      folder: {
        id: String(data?.id || ''),
        name: String(data?.name || name),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create folder.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getBusinessUser()
    if (auth.error) return auth.error

    const body = await request.json().catch(() => ({}))
    const documentId = String(body?.documentId || '').trim()
    const folderId = String(body?.folderId || '').trim()
    if (!documentId) {
      return NextResponse.json({ error: 'Document id is required.' }, { status: 400 })
    }

    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .eq('uploaded_by', auth.user.id)
      .is('deleted_at', null)
      .maybeSingle()

    if (docError) {
      return NextResponse.json({ error: docError.message || 'Unable to verify document.' }, { status: 500 })
    }
    if (!doc?.id) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    }

    if (!folderId) {
      const { error } = await supabaseAdmin
        .from('document_folder_assignments')
        .delete()
        .eq('user_id', auth.user.id)
        .eq('document_id', documentId)

      if (error) {
        if (isMissingDocumentFoldersTableError(error)) return missingDocumentFoldersResponse()
        return NextResponse.json({ error: error.message || 'Unable to clear folder assignment.' }, { status: 500 })
      }

      return NextResponse.json({ success: true, folderId: '' })
    }

    const { data: folder, error: folderError } = await supabaseAdmin
      .from('document_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (folderError) {
      if (isMissingDocumentFoldersTableError(folderError)) return missingDocumentFoldersResponse()
      return NextResponse.json({ error: folderError.message || 'Unable to verify folder.' }, { status: 500 })
    }
    if (!folder?.id) {
      return NextResponse.json({ error: 'Folder not found.' }, { status: 404 })
    }

    const { error } = await supabaseAdmin
      .from('document_folder_assignments')
      .upsert({
        document_id: documentId,
        folder_id: folderId,
        user_id: auth.user.id,
      }, { onConflict: 'document_id' })

    if (error) {
      if (isMissingDocumentFoldersTableError(error)) return missingDocumentFoldersResponse()
      return NextResponse.json({ error: error.message || 'Unable to save folder assignment.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, folderId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update folder assignment.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getBusinessUser()
    if (auth.error) return auth.error

    const body = await request.json().catch(() => ({}))
    const folderId = String(body?.folderId || '').trim()
    if (!folderId) {
      return NextResponse.json({ error: 'Folder id is required.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('document_folders')
      .delete()
      .eq('id', folderId)
      .eq('user_id', auth.user.id)

    if (error) {
      if (isMissingDocumentFoldersTableError(error)) return missingDocumentFoldersResponse()
      return NextResponse.json({ error: error.message || 'Unable to delete folder.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete folder.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
