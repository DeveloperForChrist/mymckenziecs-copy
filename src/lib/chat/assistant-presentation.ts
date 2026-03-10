import type {
  AssistantMetadata,
  AssistantPresentation,
  ParsedLine,
  ParsedSection,
  PendingCalendarEntriesMetadata,
  SourceReference,
  TimelineEntry,
} from '@/components/chatbot/chat-types'

export type AssistantResponsePayload = {
  response: string
  metadata?: AssistantMetadata
  [key: string]: unknown
}

const BULLET_PREFIX = '• '

const hasNumberPrefix = (line: string) => /^\d+(?:\.|\))\s+/.test(line)
const hasUnorderedBulletPrefix = (line: string) => /^(?:[\-*•])\s+/.test(line)
const hasHeadingMarker = (line: string) => /^##\s+\S/.test(line.trim())
const hasSubheadingMarker = (line: string) => /^###\s+\S/.test(line.trim())

const stripLinePrefix = (line: string) =>
  line.replace(/^(?:[\*\-•]\s+|\d+\.\s+|\d+\)\s+)/, '').trim()

const stripNumberPrefix = (line: string) => line.replace(/^\d+(?:\.|\))\s+/, '').trim()
const extractNumberPrefix = (line: string): number | undefined => {
  const match = line.trim().match(/^(\d+)(?:\.|\))\s+/)
  if (!match) return undefined
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const isSummaryLine = (line: string) => /^(in short|summary|takeaway)\s*:/i.test(line.trim())

const isDividerLine = (line: string) => /^(?:-{3,}|_{3,}|\*{3,}|─{6,})$/.test(line.trim())

const sentenceCaseHeadingStarterPattern =
  /^(?:what|how|when|where|why|who|starting|filing|serving|track|practical|key|next|time|court|claim|response|defence|defense|payment|documents|evidence|costs|remedies)\b/i
const sentenceCaseHeadingTrailingStopwordPattern =
  /\b(?:and|or|but|because|with|without|to|for|of|the|a|an|if|when|where|which|that)\b$/i

const extractHeadingText = (line: string) => line.trim().replace(/^##\s+/, '').trim()
const extractSubheadingText = (line: string) => line.trim().replace(/^###\s+/, '').trim()
const extractBulletText = (line: string) => line.trim().replace(/^(?:[\-*•])\s+/, '').trim()

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const sanitizeTimelineEntry = (value: unknown): TimelineEntry | null => {
  if (!isObjectRecord(value) || typeof value.description !== 'string') return null
  return {
    description: value.description,
    ...(typeof value.date === 'string' ? { date: value.date } : {}),
    ...(typeof value.daysUntil === 'number' || value.daysUntil === null ? { daysUntil: value.daysUntil as number | null } : {}),
    ...(typeof value.note === 'string' ? { note: value.note } : {}),
  }
}

const sanitizePendingCalendarEntries = (value: unknown): PendingCalendarEntriesMetadata | undefined => {
  if (!isObjectRecord(value) || typeof value.caseId !== 'string') return undefined
  const deadlines = Array.isArray(value.deadlines)
    ? value.deadlines.map(sanitizeTimelineEntry).filter((entry): entry is TimelineEntry => entry !== null)
    : undefined
  const hearings = Array.isArray(value.hearings)
    ? value.hearings.map(sanitizeTimelineEntry).filter((entry): entry is TimelineEntry => entry !== null)
    : undefined

  return {
    caseId: value.caseId,
    ...(typeof value.caseLabel === 'string' ? { caseLabel: value.caseLabel } : {}),
    ...(deadlines ? { deadlines } : {}),
    ...(hearings ? { hearings } : {}),
  }
}

const sanitizeSourceReference = (value: unknown): SourceReference | null => {
  if (!isObjectRecord(value)) return null
  if (typeof value.number !== 'number' || typeof value.title !== 'string' || typeof value.url !== 'string') return null
  return {
    number: value.number,
    title: value.title,
    url: value.url,
  }
}

const sanitizeParsedLine = (value: unknown): ParsedLine | null => {
  if (!isObjectRecord(value) || typeof value.text !== 'string' || typeof value.kind !== 'string') return null
  if (!['paragraph', 'bullet', 'ordered', 'subheading', 'divider', 'summary'].includes(value.kind)) return null
  return {
    text: value.text,
    kind: value.kind as ParsedLine['kind'],
    ...(typeof value.order === 'number' && Number.isFinite(value.order) && value.order > 0
      ? { order: value.order }
      : {}),
  }
}

const sanitizeParsedSection = (value: unknown): ParsedSection | null => {
  if (!isObjectRecord(value)) return null
  const heading = value.heading === null || typeof value.heading === 'string' ? value.heading : null
  const lines = Array.isArray(value.lines)
    ? value.lines.map(sanitizeParsedLine).filter((line): line is ParsedLine => line !== null)
    : null
  if (!lines) return null
  return { heading, lines }
}

const sanitizeAssistantPresentation = (value: unknown): AssistantPresentation | undefined => {
  if (!isObjectRecord(value) || value.version !== 1 || !Array.isArray(value.sections)) return undefined
  const sections = value.sections
    .map(sanitizeParsedSection)
    .filter((section): section is ParsedSection => section !== null)
  return { version: 1, sections }
}

export const sanitizeAssistantMetadata = (metadata?: unknown): AssistantMetadata | undefined => {
  if (!isObjectRecord(metadata)) return undefined

  const normalized: AssistantMetadata = { ...metadata }

  if ('pendingCalendarEntries' in normalized) {
    const next = sanitizePendingCalendarEntries(normalized.pendingCalendarEntries)
    if (next) normalized.pendingCalendarEntries = next
    else delete normalized.pendingCalendarEntries
  }

  if ('activeCaseId' in normalized) {
    if (typeof normalized.activeCaseId !== 'string' && normalized.activeCaseId !== null && normalized.activeCaseId !== undefined) {
      delete normalized.activeCaseId
    }
  }

  if ('sources' in normalized) {
    const next = Array.isArray(normalized.sources)
      ? normalized.sources.map(sanitizeSourceReference).filter((source): source is SourceReference => source !== null)
      : undefined
    if (next) normalized.sources = next
    else delete normalized.sources
  }

  if ('presentation' in normalized) {
    const next = sanitizeAssistantPresentation(normalized.presentation)
    if (next) normalized.presentation = next
    else delete normalized.presentation
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export const stripAssistantPresentationMetadata = (metadata?: unknown): AssistantMetadata | undefined => {
  const normalized = sanitizeAssistantMetadata(metadata)
  if (!normalized) return undefined
  const { presentation: _presentation, ...rest } = normalized
  return Object.keys(rest).length > 0 ? rest : undefined
}

export const normalizeAssistantResponsePayload = (payload: unknown): AssistantResponsePayload | null => {
  if (!isObjectRecord(payload) || typeof payload.response !== 'string') return null
  const rest: Record<string, unknown> = { ...payload }
  delete rest.metadata
  const metadata = sanitizeAssistantMetadata(payload.metadata)
  return {
    ...rest,
    response: payload.response,
    ...(metadata ? { metadata } : {}),
  }
}

const isHeadingLine = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (isSummaryLine(trimmed) || hasHeadingMarker(trimmed) || hasSubheadingMarker(trimmed)) return false
  if (hasNumberPrefix(trimmed) || hasUnorderedBulletPrefix(trimmed) || isDividerLine(trimmed)) return false
  if (trimmed.endsWith(':')) return false
  if (/^[A-Z\s]+$/.test(trimmed.replace(/[^A-Za-z\s]/g, '')) && trimmed.split(/\s+/).length <= 4) return false

  const titlePattern = /^[A-Z][^.!?]*$/
  if (!titlePattern.test(trimmed)) return false

  const wordCount = trimmed.split(/\s+/).length
  if (wordCount < 2 || wordCount > 8 || trimmed.length > 56) return false

  if (
    wordCount <= 6 &&
    trimmed.length <= 48 &&
    sentenceCaseHeadingStarterPattern.test(trimmed) &&
    !sentenceCaseHeadingTrailingStopwordPattern.test(trimmed)
  ) {
    return true
  }

  const words = trimmed.split(/\s+/)
  const capitalWords = words.filter((word) => /^[A-Z]/.test(word)).length
  const requiredRatio = wordCount <= 3 ? 0.5 : 0.75
  return capitalWords / words.length >= requiredRatio
}

export const parseAssistantResponse = (text: string, allowHeadings: boolean = true): ParsedSection[] => {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n(?=##\s+\S)/g, '\n\n')
    .replace(/\n(?:-{3,}|_{3,}|\*{3,}|─{6,})\n/g, '\n\n---\n\n')
    .trim()
  if (!normalized) return []

  const sections = normalized
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean)

  const parsed = sections.map((section) => {
    const rawLines = section
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (!rawLines.length) {
      return { heading: null, lines: [] }
    }

    if (rawLines.length === 1) {
      const singleLine = rawLines[0]
      if (isDividerLine(singleLine)) {
        return {
          heading: null,
          lines: [{ text: '---', kind: 'divider' as const }],
        }
      }
      if (hasHeadingMarker(singleLine)) {
        return {
          heading: allowHeadings ? extractHeadingText(singleLine) : null,
          lines: allowHeadings ? [] : [{ text: extractHeadingText(singleLine), kind: 'paragraph' as const }],
        }
      }
      if (hasSubheadingMarker(singleLine)) {
        return {
          heading: null,
          lines: [{
            text: extractSubheadingText(singleLine),
            kind: allowHeadings ? ('subheading' as const) : ('paragraph' as const),
          }],
        }
      }
      if (isSummaryLine(singleLine)) {
        return {
          heading: null,
          lines: [{ text: singleLine.trim(), kind: 'summary' as const }],
        }
      }
      if (allowHeadings && isHeadingLine(singleLine)) {
        return {
          heading: singleLine.trim(),
          lines: [],
        }
      }
      if (hasNumberPrefix(singleLine)) {
        return {
          heading: null,
          lines: [{
            text: stripNumberPrefix(singleLine),
            kind: 'ordered' as const,
            ...(extractNumberPrefix(singleLine) ? { order: extractNumberPrefix(singleLine) } : {}),
          }],
        }
      }
      if (hasUnorderedBulletPrefix(singleLine)) {
        return {
          heading: null,
          lines: [{ text: extractBulletText(singleLine), kind: 'bullet' as const }],
        }
      }
      const single = stripLinePrefix(singleLine)
      return {
        heading: null,
        lines: single ? [{ text: single, kind: 'paragraph' as const }] : [],
      }
    }

    const firstLine = rawLines[0]
    const heading = allowHeadings
      ? (hasHeadingMarker(firstLine) ? extractHeadingText(firstLine) : (isHeadingLine(firstLine) ? firstLine.trim() : null))
      : null
    const bodyLines = heading ? rawLines.slice(1) : rawLines
    const lines: ParsedLine[] = []

    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i]

      if (isDividerLine(line)) {
        lines.push({ text: '---', kind: 'divider' as const })
        continue
      }
      if (isSummaryLine(line)) {
        lines.push({ text: line.trim(), kind: 'summary' as const })
        continue
      }
      if (hasHeadingMarker(line)) {
        lines.push({
          text: extractHeadingText(line),
          kind: allowHeadings ? ('subheading' as const) : ('paragraph' as const),
        })
        continue
      }
      if (hasSubheadingMarker(line)) {
        lines.push({
          text: extractSubheadingText(line),
          kind: allowHeadings ? ('subheading' as const) : ('paragraph' as const),
        })
        continue
      }
      if (hasNumberPrefix(line)) {
        lines.push({
          text: stripNumberPrefix(line),
          kind: 'ordered' as const,
          ...(extractNumberPrefix(line) ? { order: extractNumberPrefix(line) } : {}),
        })
        continue
      }
      if (hasUnorderedBulletPrefix(line)) {
        lines.push({ text: extractBulletText(line), kind: 'bullet' as const })
        continue
      }
      lines.push({
        text: line.trim(),
        kind: 'paragraph' as const,
      })
    }

    return { heading, lines }
  }).filter((section) => section.heading || section.lines.length > 0)

  const merged: ParsedSection[] = []
  for (const section of parsed) {
    const last = merged[merged.length - 1]
    if (last && last.heading && last.lines.length === 0 && !section.heading && section.lines.length > 0) {
      last.lines = [...last.lines, ...section.lines]
      continue
    }
    merged.push({ heading: section.heading, lines: [...section.lines] })
  }

  return merged as ParsedSection[]
}

export const formatAssistantResponse = (text: string) => {
  const sections = parseAssistantResponse(text)
  if (!sections.length) return text

  return sections
    .map((section) => {
      const lines: string[] = []
      if (section.heading) lines.push(section.heading)
      let orderedIndex = 1
      lines.push(
        ...section.lines.flatMap((line) => {
          if (line.kind === 'divider') return ['---']
          if (line.kind === 'bullet') {
            orderedIndex = 1
            return [`${BULLET_PREFIX}${line.text}`]
          }
          if (line.kind === 'ordered') {
            const displayOrder = typeof line.order === 'number' ? line.order : orderedIndex
            orderedIndex = displayOrder + 1
            return [`${displayOrder}. ${line.text}`]
          }
          orderedIndex = 1
          return [line.text]
        })
      )
      return lines.join('\n')
    })
    .join('\n\n')
}

export const buildAssistantPresentation = (text: string): AssistantPresentation | undefined => {
  const sections = parseAssistantResponse(text)
  if (!sections.length) return undefined
  return { version: 1, sections }
}

export const attachAssistantPresentationMetadata = (
  text: string,
  metadata?: unknown,
  options: { reuseExistingPresentation?: boolean } = {}
): AssistantMetadata | undefined => {
  const normalizedMetadata = sanitizeAssistantMetadata(metadata)
  const existingPresentation =
    options.reuseExistingPresentation &&
    normalizedMetadata?.presentation &&
    normalizedMetadata.presentation.version === 1 &&
    Array.isArray(normalizedMetadata.presentation.sections)
      ? normalizedMetadata.presentation
      : undefined
  const presentation = existingPresentation || buildAssistantPresentation(text)
  if (!normalizedMetadata && !presentation) return undefined
  const nextMetadata: AssistantMetadata = {
    ...(normalizedMetadata || {}),
    ...(presentation ? { presentation } : {}),
  }
  return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined
}

export const buildAssistantResponsePayload = (
  response: string,
  metadata?: unknown,
  extra: Record<string, unknown> = {}
): AssistantResponsePayload => {
  const nextMetadata = attachAssistantPresentationMetadata(response, metadata)
  return normalizeAssistantResponsePayload({
    ...extra,
    response,
    ...(nextMetadata ? { metadata: nextMetadata } : {}),
  }) as AssistantResponsePayload
}
