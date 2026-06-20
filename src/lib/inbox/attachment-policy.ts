const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'txt',
  'rtf',
  'csv',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
])

const ALLOWED_ATTACHMENT_MIME_PREFIXES = [
  'image/',
  'text/',
]

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'text/rtf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

export const EMAIL_ATTACHMENT_ACCEPT =
  '.pdf,.doc,.docx,.txt,.rtf,.csv,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.gif'

export const EMAIL_ATTACHMENT_LABEL =
  'PDF, Word, Excel, PowerPoint, text, CSV, and common image files'

function extensionFromName(name: string) {
  const normalized = String(name || '').trim().toLowerCase()
  if (!normalized.includes('.')) return ''
  return normalized.split('.').pop() || ''
}

export function isAllowedEmailAttachment(params: { name?: string | null; mimeType?: string | null }) {
  const name = String(params.name || '').trim()
  const mimeType = String(params.mimeType || '').trim().toLowerCase()
  const extension = extensionFromName(name)

  if (extension && ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) return true
  if (mimeType && ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType)) return true
  if (mimeType && ALLOWED_ATTACHMENT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return extension ? ALLOWED_ATTACHMENT_EXTENSIONS.has(extension) : true
  }

  return false
}
