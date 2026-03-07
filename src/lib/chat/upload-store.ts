import { supabaseAdmin } from '@/lib/database/supabase-server'
import { extractTextFromBuffer } from '@/lib/chat/text-extraction'

export const CHAT_UPLOAD_TTL_MS = 30 * 60 * 1000
export const CHAT_UPLOAD_BUCKET = 'user-uploads'
const CHAT_UPLOAD_PREFIX = 'chat-temp'

export type ChatUploadRecord = {
  id: string
  owner_id: string
  name: string
  mime_type: string | null
  size_bytes: number
  storage_path: string
  created_at: string
  expires_at: string
  consumed_at?: string | null
  extracted_text?: string | null
  extract_status?: string | null
  extracted_at?: string | null
  extract_error?: string | null
}

export const sanitizeChatUploadFilename = (value: string) => {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.replace(/[^a-zA-Z0-9._\- ]/g, '').trim() || 'uploaded-document'
}

export const buildChatUploadStoragePath = (ownerId: string, id: string, filename: string) =>
  `${CHAT_UPLOAD_PREFIX}/${ownerId}/${id}/${filename}`

export async function deleteChatUpload(record: Pick<ChatUploadRecord, 'id' | 'storage_path'>) {
  await supabaseAdmin
    .from('chat_uploads')
    .delete()
    .eq('id', record.id)

  await supabaseAdmin.storage
    .from(CHAT_UPLOAD_BUCKET)
    .remove([record.storage_path])
}

export async function deleteExpiredChatUploads(limit: number = 25) {
  const nowIso = new Date().toISOString()
  const { data: expiredRows, error } = await supabaseAdmin
    .from('chat_uploads')
    .select('id, storage_path')
    .lte('expires_at', nowIso)
    .order('expires_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('Failed to load expired chat uploads', error)
    return
  }

  for (const row of expiredRows || []) {
    await deleteChatUpload({
      id: String(row.id),
      storage_path: String(row.storage_path),
    }).catch((cleanupError) => {
      console.error('Failed to delete expired chat upload', cleanupError)
    })
  }
}

export async function processPendingChatUploadExtractions(limit: number = 10) {
  const nowIso = new Date().toISOString()
  const { data: pendingRows, error } = await supabaseAdmin
    .from('chat_uploads')
    .select('id, name, mime_type, storage_path, expires_at')
    .eq('extract_status', 'pending')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('Failed to load pending chat upload extractions', error)
    return { processed: 0, failed: 0 }
  }

  let processed = 0
  let failed = 0

  for (const row of pendingRows || []) {
    try {
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from(CHAT_UPLOAD_BUCKET)
        .download(String(row.storage_path))

      if (downloadError || !fileData) {
        failed += 1
        await supabaseAdmin
          .from('chat_uploads')
          .update({
            extract_status: 'failed',
            extract_error: downloadError?.message || 'File missing from storage',
            extracted_at: new Date().toISOString(),
          })
          .eq('id', row.id)
        continue
      }

      const buffer = Buffer.from(await fileData.arrayBuffer())
      const extractedText = await extractTextFromBuffer(buffer, String(row.name || ''), row.mime_type || null)
      await supabaseAdmin
        .from('chat_uploads')
        .update({
          extracted_text: extractedText.trim() ? extractedText : null,
          extract_status: 'complete',
          extract_error: null,
          extracted_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      processed += 1
    } catch (processingError: any) {
      failed += 1
      await supabaseAdmin
        .from('chat_uploads')
        .update({
          extract_status: 'failed',
          extract_error: processingError instanceof Error ? processingError.message : 'Extraction failed',
          extracted_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    }
  }

  return { processed, failed }
}
