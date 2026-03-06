export const CHAT_ATTACHMENT_ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt', 'md', 'rtf'] as const

export const CHAT_ATTACHMENT_ACCEPT = CHAT_ATTACHMENT_ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')

const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
])

const RTF_MIME_TYPES = new Set([
  'application/rtf',
  'text/rtf',
])

const EXTENSION_SET = new Set<string>(CHAT_ATTACHMENT_ALLOWED_EXTENSIONS)

export const getFileExtension = (filename: string): string => {
  const trimmed = (filename || '').trim()
  if (!trimmed) return ''
  const dotIndex = trimmed.lastIndexOf('.')
  if (dotIndex < 0) return ''
  return trimmed.slice(dotIndex + 1).toLowerCase()
}

export const isSupportedChatAttachment = (file: { name: string; type?: string | null }): boolean => {
  const extension = getFileExtension(file.name)
  const mimeType = (file.type || '').toLowerCase()

  if (EXTENSION_SET.has(extension)) return true
  if (mimeType.startsWith('text/')) return true
  if (DOCX_MIME_TYPES.has(mimeType)) return true
  if (RTF_MIME_TYPES.has(mimeType)) return true
  if (mimeType === 'application/pdf') return true

  return false
}

export const formatSupportedAttachmentTypes = (): string =>
  CHAT_ATTACHMENT_ALLOWED_EXTENSIONS.map((ext) => ext.toUpperCase()).join(', ')
