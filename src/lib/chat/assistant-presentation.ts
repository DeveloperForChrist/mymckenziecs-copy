import type { AssistantPresentation, ParsedLine, ParsedSection } from '@/components/chatbot/chat-types'

const BULLET_PREFIX = '• '

const hasNumberPrefix = (line: string) => /^\d+(?:\.|\))\s+/.test(line)
const hasUnorderedBulletPrefix = (line: string) => /^(?:[\-*•])\s+/.test(line)
const hasHeadingMarker = (line: string) => /^##\s+\S/.test(line.trim())
const hasSubheadingMarker = (line: string) => /^###\s+\S/.test(line.trim())

const stripLinePrefix = (line: string) =>
  line.replace(/^(?:[\*\-•]\s+|\d+\.\s+|\d+\)\s+)/, '').trim()

const stripNumberPrefix = (line: string) => line.replace(/^\d+(?:\.|\))\s+/, '').trim()

const isSummaryLine = (line: string) => /^(in short|summary|takeaway)\s*:/i.test(line.trim())

const isDividerLine = (line: string) => /^(?:-{3,}|_{3,}|\*{3,}|─{6,})$/.test(line.trim())

const extractHeadingText = (line: string) => line.trim().replace(/^##\s+/, '').trim()
const extractSubheadingText = (line: string) => line.trim().replace(/^###\s+/, '').trim()
const extractBulletText = (line: string) => line.trim().replace(/^(?:[\-*•])\s+/, '').trim()

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
          lines: [{ text: stripNumberPrefix(singleLine), kind: 'ordered' as const }],
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
        lines.push({ text: stripNumberPrefix(line), kind: 'ordered' as const })
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
            return [`${orderedIndex++}. ${line.text}`]
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
  metadata?: Record<string, any>,
  options: { reuseExistingPresentation?: boolean } = {}
): Record<string, any> | undefined => {
  const existingPresentation =
    options.reuseExistingPresentation &&
    metadata?.presentation &&
    typeof metadata.presentation === 'object' &&
    metadata.presentation.version === 1 &&
    Array.isArray(metadata.presentation.sections)
      ? metadata.presentation
      : undefined
  const presentation = existingPresentation || buildAssistantPresentation(text)
  if (!metadata && !presentation) return undefined
  return {
    ...(metadata || {}),
    ...(presentation ? { presentation } : {}),
  }
}

export const buildAssistantResponsePayload = (
  response: string,
  metadata?: Record<string, any>,
  extra: Record<string, any> = {}
) => {
  const nextMetadata = attachAssistantPresentationMetadata(response, metadata)
  return {
    ...extra,
    response,
    ...(nextMetadata ? { metadata: nextMetadata } : {}),
  }
}
