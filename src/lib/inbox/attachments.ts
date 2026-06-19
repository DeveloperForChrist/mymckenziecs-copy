export type InboxMessageAttachment = {
  documentId: string
  name: string
  mimeType: string | null
  size: number | null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseInboxAttachments(metadata: unknown): InboxMessageAttachment[] {
  const rawAttachments = (metadata as Record<string, unknown> | null | undefined)?.attachments
  if (!Array.isArray(rawAttachments)) return []

  return rawAttachments
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const attachment = entry as Record<string, unknown>
      const documentId = asString(attachment.documentId || attachment.id || attachment.document_id)
      if (!documentId) return null
      return {
        documentId,
        name: asString(attachment.name) || 'Document',
        mimeType: typeof attachment.mimeType === 'string' ? attachment.mimeType : typeof attachment.mime_type === 'string' ? attachment.mime_type : null,
        size: typeof attachment.size === 'number' ? attachment.size : typeof attachment.fileSize === 'number' ? attachment.fileSize : typeof attachment.file_size === 'number' ? attachment.file_size : null,
      }
    })
    .filter((entry): entry is InboxMessageAttachment => entry !== null)
}
