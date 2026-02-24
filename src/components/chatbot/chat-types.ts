export interface SourceReference {
  number: number
  title: string
  url: string
}

export interface PendingCalendarEntriesMetadata {
  caseId: string
  caseLabel?: string
  deadlines?: TimelineEntry[]
  hearings?: TimelineEntry[]
}

export interface AssistantMetadata {
  pendingCalendarEntries?: PendingCalendarEntriesMetadata
  activeCaseId?: string
  sources?: SourceReference[]
  [key: string]: unknown
}

export type AttachmentDisplay = {
  name: string
  downloadURL?: string | null
  storagePath?: string | null
  size?: number
  mimeType?: string | null
  status?: 'uploading' | 'ready' | 'failed'
}

export interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isTyping?: boolean
  metadata?: AssistantMetadata
  attachments?: AttachmentDisplay[]
}

export type TimelineEntry = {
  description: string
  date?: string
  daysUntil?: number | null
  note?: string
}

export type ParsedLineKind = 'paragraph' | 'bullet' | 'subheading' | 'divider' | 'summary'

export type ParsedLine = {
  text: string
  kind: ParsedLineKind
}

export type ParsedSection = {
  heading: string | null
  lines: ParsedLine[]
}
