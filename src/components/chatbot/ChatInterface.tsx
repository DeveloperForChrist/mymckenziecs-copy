"use client"
import { useState, useRef, useEffect, Fragment } from 'react';
import Link from 'next/link';
import type { CSSProperties, FormEvent } from 'react'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import UserName from '@/components/user/UserName'

// Generate a proper UUID v4
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const linkStyle: CSSProperties = {
  color: '#ef4444',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontWeight: 600
}

const TypingIndicator = ({ label = 'Working', compact = false }: { label?: string; compact?: boolean }) => {
  const dotSize = compact ? 6 : 8
  const padding = compact ? '6px 8px' : '8px 10px'
  return (
    <div
      aria-live="polite"
      aria-label={`${label}…`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding,
        borderRadius: 999,
        background: 'transparent',
        color: '#f8fafc',
      }}
    >
      <span className="mm-dot" />
      <span className="mm-dot mm-dot2" />
      <span className="mm-dot mm-dot3" />

      <style jsx>{`
        .mm-dot {
          width: ${dotSize}px;
          height: ${dotSize}px;
          border-radius: 999px;
          background: rgba(236, 72, 153, 0.95);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 6px 14px rgba(236,72,153,0.12);
          animation: mmDot 1.05s infinite;
          display: inline-block;
        }

        .mm-dot2 { animation-delay: 0.15s; }
        .mm-dot3 { animation-delay: 0.3s; }

        @keyframes mmDot {
          0%, 20% { transform: translateY(0); opacity: 0.55; }
          50% { transform: translateY(-4px); opacity: 1; }
          80%, 100% { transform: translateY(0); opacity: 0.55; }
        }
      `}</style>
    </div>
  )
}

const FREEMIUM_MESSAGE_LIMIT = 20;
const GUEST_MESSAGE_LIMIT = 5;

 const stripTrailingUrlPunctuation = (url: string) => {
   let cleaned = url.trim()
   while (cleaned.length > 0 && /[)\].,;:!]/.test(cleaned[cleaned.length - 1])) {
     cleaned = cleaned.slice(0, -1)
   }
   if (cleaned.startsWith('(') || cleaned.startsWith('[')) {
     cleaned = cleaned.slice(1)
   }
   return cleaned
 }

const convertUrlsToLinks = (segment: string) => {
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)\]]+)\)/g
  const urlPattern = /https?:\/\/[^\s]+/g
  const parts: (string | JSX.Element)[] = []
  let cursor = 0
  let key = 0
  let mdMatch

  while ((mdMatch = markdownLinkPattern.exec(segment)) !== null) {
    const matchIndex = mdMatch.index
    if (matchIndex > cursor) {
      const before = segment.slice(cursor, matchIndex)
      parts.push(...convertUrlsToLinks(before))
    }

    const label = mdMatch[1]
    const href = stripTrailingUrlPunctuation(mdMatch[2])
    parts.push(
      <a
        key={`md-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
      >
        {label}
      </a>
    )

    cursor = matchIndex + mdMatch[0].length
  }

  const remaining = segment.slice(cursor)
  const urlParts: (string | JSX.Element)[] = []
  let lastUrlIndex = 0
  let urlMatch
  while ((urlMatch = urlPattern.exec(remaining)) !== null) {
    if (urlMatch.index > lastUrlIndex) {
      urlParts.push(remaining.substring(lastUrlIndex, urlMatch.index))
    }

    const raw = urlMatch[0]
    const cleaned = stripTrailingUrlPunctuation(raw)
    const trailing = raw.slice(cleaned.length)

    urlParts.push(
      <a
        key={`url-${key++}`}
        href={cleaned}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
      >
        {cleaned}
      </a>
    )
    if (trailing) urlParts.push(trailing)

    lastUrlIndex = urlPattern.lastIndex
  }
  if (lastUrlIndex < remaining.length) {
    urlParts.push(remaining.substring(lastUrlIndex))
  }

  return [...parts, ...urlParts]
}

const extractUrlsFromText = (text: string): string[] => {
  if (!text) return []
  const urlPattern = /https?:\/\/[^\s]+/g
  const urls = new Set<string>()
  let match
  while ((match = urlPattern.exec(text)) !== null) {
    const cleaned = stripTrailingUrlPunctuation(match[0])
    if (cleaned) urls.add(cleaned)
  }
  return Array.from(urls)
}

const legislationLinkCache = new Map<string, string>()

const buildLegislationSearchUrl = (title: string) =>
  `https://www.legislation.gov.uk/all?title=${encodeURIComponent(title)}`

const buildJusticeSearchUrl = (query: string) =>
  `https://www.justice.gov.uk/courts/procedure-rules/civil/search?query=${encodeURIComponent(query)}&profile=_default`

const resolveCprPartUrl = (part: string) => {
  const numeric = part.match(/^\d{1,2}$/)
  if (!numeric) return null
  const padded = part.padStart(2, '0')
  return `https://www.justice.gov.uk/courts/procedure-rules/civil/rules/part${padded}`
}

const resolveCprUrl = (refText: string) => {
  const text = refText.trim()
  if (!text) return null
  const lower = text.toLowerCase()
  if (!/cpr|civil procedure rules/.test(lower)) return null

  const partMatch = text.match(/\bpart\s*([0-9]{1,2})\b/i)
  if (partMatch) {
    return resolveCprPartUrl(partMatch[1])
  }

  const ruleMatch = text.match(/\br\.?\s*([0-9]{1,2})(?:\.[0-9]+)?\b/i)
  if (ruleMatch) {
    return resolveCprPartUrl(ruleMatch[1])
  }

  return 'https://www.justice.gov.uk/courts/procedure-rules/civil'
}

const resolvePracticeDirectionUrl = (refText: string) => {
  const text = refText.trim()
  if (!text) return null
  if (!/\bpractice direction\b|\bpd\b/i.test(text)) return null
  return 'https://www.justice.gov.uk/courts/procedure-rules/civil/rules/pd'
}

const buildReferenceSearchUrl = (refText: string) => {
  const cprUrl = resolveCprUrl(refText)
  if (cprUrl) return cprUrl
  const pdUrl = resolvePracticeDirectionUrl(refText)
  if (pdUrl) return pdUrl
  return buildLegislationSearchUrl(refText)
}

const BULLET_PREFIX = '• '
type ParsedLineKind = 'paragraph' | 'bullet' | 'subheading' | 'divider' | 'summary'
type ParsedLine = {
  text: string
  kind: ParsedLineKind
}

type ParsedSection = {
  heading: string | null
  lines: ParsedLine[]
}

const hasBulletPrefix = (line: string) => /^(?:[\*\-•]\s+|\d+\.\s+)/.test(line)
const hasNumberPrefix = (line: string) => /^\d+\.\s+/.test(line)

const stripLinePrefix = (line: string) =>
  line.replace(/^(?:[\*\-•]\s+|\d+\.\s+)/, '').trim()

const stripNumberPrefix = (line: string) => line.replace(/^\d+\.\s+/, '').trim()

const isNumberedHeadingLine = (line: string) => {
  if (!hasNumberPrefix(line)) return false
  const text = stripNumberPrefix(line)
  if (!text) return false
  const wordCount = text.trim().split(/\s+/).length
  if (wordCount > 10) return false
  return /^[A-Z]/.test(text)
}

const isSummaryLine = (line: string) => /^(in short|summary|takeaway)\s*:/i.test(line.trim())

const isHeadingLine = (line: string) => {
  if (!line) return false
  if (isSummaryLine(line)) return false
  
  // Ends with colon - definitely a heading
  if (line.endsWith(':')) {
    const wordCount = line.trim().split(/\s+/).length
    if (wordCount <= 8 && line.trim().length <= 48) return true
  }

  // Short lines with an inline colon often signal a section title
  if (line.includes(':') && !/[.!?]$/.test(line)) {
    const wordCount = line.trim().split(/\s+/).length
    if (wordCount <= 8 && /^[A-Z]/.test(line.trim())) return true
  }
  
  // All caps - treat as heading only if short
  const cleaned = line.replace(/[^A-Za-z]/g, '')
  if (cleaned.length > 2 && cleaned === cleaned.toUpperCase()) {
    const wordCount = line.trim().split(/\s+/).length
    if (wordCount <= 6 && line.trim().length <= 48) return true
  }
  
  // Title-style line: starts with capital, has 2-12 words, no ending punctuation (except : which we already checked)
  const titlePattern = /^[A-Z][^.!?]*$/
  if (!titlePattern.test(line)) return false
  
  const wordCount = line.trim().split(/\s+/).length
  if (wordCount < 2 || wordCount > 12) return false
  
  // Has title case characteristics: most words start with capital
  const words = line.trim().split(/\s+/)
  const capitalWords = words.filter(w => /^[A-Z]/.test(w)).length
  const ratio = capitalWords / words.length
  
  // If 50%+ of words are capitalized, treat as title
  return ratio >= 0.5
}

const isDividerLine = (line: string) => /^(?:-{3,}|_{3,}|\*{3,})$/.test(line.trim())

const parseAssistantResponse = (text: string, allowHeadings: boolean = true): ParsedSection[] => {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n(?:-{3,}|_{3,}|\*{3,})\n/g, '\n\n---\n\n')
    .trim()
  if (!normalized) return []

  const sections = normalized
    .split(/\n{2,}/)
    .map(section => section.trim())
    .filter(Boolean)

  const parsed = sections.map((section) => {
    const rawLines = section
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)

    if (!rawLines.length) {
      return { heading: null, lines: [] }
    }

    if (rawLines.length === 1) {
      const onlyLine = rawLines[0]
      if (isDividerLine(onlyLine)) {
        return {
          heading: null,
          lines: [{ text: '---', kind: 'divider' as const }]
        }
      }
      const singleLine = rawLines[0]
      if (isNumberedHeadingLine(singleLine)) {
        return {
          heading: null,
          lines: [{ text: singleLine.trim(), kind: 'subheading' as const }]
        }
      }
      const single = stripLinePrefix(singleLine)
      if (isSummaryLine(singleLine)) {
        return {
          heading: null,
          lines: [{ text: singleLine.trim(), kind: 'summary' as const }]
        }
      }
      return {
        heading: null,
        lines: single ? [{ text: single, kind: 'paragraph' as const }] : []
      }
    }

    const firstLine = rawLines[0]
    const heading = allowHeadings && isHeadingLine(firstLine) ? stripLinePrefix(firstLine) : null
    const bodyLines = heading ? rawLines.slice(1) : rawLines
    const bulletCount = bodyLines.reduce(
      (count, line) => count + (hasBulletPrefix(line) && !isNumberedHeadingLine(line) && !isDividerLine(line) ? 1 : 0),
      0
    )
    const keepBullets = bulletCount >= 2
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
      if (allowHeadings && isNumberedHeadingLine(line)) {
        lines.push({ text: line.trim(), kind: 'subheading' as const })
        continue
      }
      if (allowHeadings && line.endsWith(':')) {
        const wordCount = line.trim().split(/\s+/).length
        if (wordCount <= 8 && line.trim().length <= 48) {
          lines.push({ text: line.trim(), kind: 'subheading' as const })
          continue
        }
      }
      const isBullet = keepBullets && hasBulletPrefix(line)
      lines.push({
        text: isBullet ? stripLinePrefix(line) : line.trim(),
        kind: isBullet ? ('bullet' as const) : ('paragraph' as const)
      })
    }

    return { heading, lines }
  }).filter(section => section.heading || section.lines.length > 0)

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

const formatAssistantResponse = (text: string) => {
  const sections = parseAssistantResponse(text)
  if (!sections.length) return text

  return sections
    .map((section) => {
      const lines: string[] = []
      if (section.heading) lines.push(section.heading)
      lines.push(
        ...section.lines.flatMap((line) => {
          if (line.kind === 'divider') return ['---']
          return [line.kind === 'bullet' ? `${BULLET_PREFIX}${line.text}` : line.text]
        })
      )
      return lines.join('\n')
    })
    .join('\n\n')
}

const stripAssistantSourcesBlock = (text: string) => {
  if (!text) return text
  const sourcesBlockRegex =
    /(\n{1,2}(?:Reviewed\s+\d+\s+sources[\s\S]*$|Sources\s+reviewed:[\s\S]*$|Verified\s+sources[\s\S]*$|Sources?:[\s\S]*$))/i
  return text.replace(sourcesBlockRegex, '').trim()
}

const LegislationLink = ({ refText, hrefOverride }: { refText: string; hrefOverride?: string }) => {
  const [href, setHref] = useState(() => {
    if (hrefOverride) return hrefOverride
    return legislationLinkCache.get(refText) || buildReferenceSearchUrl(refText)
  })

  useEffect(() => {
    let cancelled = false
    const cprUrl = resolveCprUrl(refText)
    const pdUrl = resolvePracticeDirectionUrl(refText)
    const lockedUrl = hrefOverride || cprUrl || pdUrl
    if (lockedUrl || legislationLinkCache.has(refText)) {
      if (lockedUrl && !legislationLinkCache.has(refText)) {
        legislationLinkCache.set(refText, lockedUrl)
        setHref(lockedUrl)
      }
      return
    }

    const resolveLink = async () => {
      try {
        const response = await fetch(`/api/legislation-lookup?title=${encodeURIComponent(refText)}`)
        const data = await response.json()
        const resolved = response.ok && data?.url ? data.url : buildReferenceSearchUrl(refText)
        legislationLinkCache.set(refText, resolved)
        if (!cancelled) {
          setHref(resolved)
        }
      } catch {
        const fallback = buildReferenceSearchUrl(refText)
        legislationLinkCache.set(refText, fallback)
        if (!cancelled) {
          setHref(fallback)
        }
      }
    }

    resolveLink()

    return () => {
      cancelled = true
    }
  }, [refText, hrefOverride])

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={linkStyle}
    >
      {refText}
    </a>
  )
}

const resourceLinks: Array<{ pattern: RegExp; url: string }> = [
  { pattern: /\bPractice Direction\s*7A\b|\bPD\s*7A\b/i, url: 'https://www.justice.gov.uk/courts/procedure-rules/civil/rules/part07/pd_part07a' },
  { pattern: /\bPre-Action Protocol for Small Claims\b/i, url: 'https://www.justice.gov.uk/courts/procedure-rules/civil/rules/pd_pre-action_conduct' },
  { pattern: /Civil Procedure Rules\s*\(CPR\)|Civil Procedure Rules|\bCPR\b/i, url: 'https://www.justice.gov.uk/courts/procedure-rules/civil' },
  { pattern: /Practice Directions?\s*\(PD\)|\bPD\b/i, url: 'https://www.justice.gov.uk/courts/procedure-rules/civil/rules/pd' },
  { pattern: /\bCitizens Advice\b/i, url: 'https://www.citizensadvice.org.uk/law-and-courts/' },
  { pattern: /\bGOV\.UK\b|the GOV\.UK website/i, url: 'https://www.gov.uk/' },
  { pattern: /\bCounty Court\b/i, url: 'https://www.gov.uk/courts-tribunals/county-court' }
]

const findNextResourceMatch = (text: string, startIndex: number) => {
  let bestMatch: { index: number; end: number; text: string; url: string } | null = null

  for (const entry of resourceLinks) {
    const slice = text.slice(startIndex)
    const match = slice.match(entry.pattern)
    if (!match || match.index === undefined) continue
    const index = startIndex + match.index
    const textValue = match[0]
    const end = index + textValue.length
    if (!bestMatch || index < bestMatch.index || (index === bestMatch.index && textValue.length > bestMatch.text.length)) {
      bestMatch = { index, end, text: textValue, url: entry.url }
    }
  }

  return bestMatch
}

// Helper function to render numbered citations with hover tooltips
const renderSourceCitations = (text: string | JSX.Element, sources?: Array<{ number: number; title: string; url: string }>): (string | JSX.Element)[] => {
  if (typeof text !== 'string' || !sources || sources.length === 0) {
    return [text]
  }
  
  const citationPattern = /\[(\d+)\]/g
  const parts: (string | JSX.Element)[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  
  while ((match = citationPattern.exec(text)) !== null) {
    const citationNumber = parseInt(match[1], 10)
    const source = sources.find(s => s.number === citationNumber)
    
    if (lastIndex < match.index) {
      parts.push(text.slice(lastIndex, match.index))
    }
    
    if (source) {
      parts.push(
        <a
          key={`citation-${citationNumber}-${match.index}`}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          title={source.title}
          style={{
            color: '#60a5fa',
            fontWeight: 700,
            textDecoration: 'none',
            cursor: 'pointer',
            padding: '0 2px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#3b82f6'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#60a5fa'
          }}
        >
          [{citationNumber}]
        </a>
      )
    } else {
      parts.push(match[0])
    }
    
    lastIndex = citationPattern.lastIndex
  }
  
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  
  return parts.length > 0 ? parts : [text]
}

// Comprehensive rendering function that processes citations and legal references
const renderMessageContent = (text: string, sources?: Array<{ number: number; title: string; url: string }>): (string | JSX.Element)[] => {
  // Process citations first
  const citationProcessed = renderSourceCitations(text, sources)
  
  // Then process each citation part for legal references
  const finalParts: (string | JSX.Element)[] = []
  
  for (const citPart of citationProcessed) {
    if (typeof citPart === 'string') {
      finalParts.push(...renderLegalReferences(citPart))
    } else {
      finalParts.push(citPart)
    }
  }
  
  return finalParts
}

// Helper function to convert legal references to clickable links
const renderLegalReferences = (text: string) => {
  const legislationPattern = /\b((?:[A-Z][A-Za-z&]+(?:\s+[A-Z][A-Za-z&]+)*)\s+(?:Act|Rules|Regulations|Order)\s+\d{4})(?:\s*(?:\(|,)?\s*(?:Section|s\.?|Part)\s*[0-9A-Z]+(?:\)|,)?)?/g
  const caseLawPattern = /\b([A-Z][A-Za-z&'.-]+(?:\s+[A-Z][A-Za-z&'.-]+)*\s+v\s+[A-Z][A-Za-z&'.-]+(?:\s+[A-Z][A-Za-z&'.-]+)*\s*\[[0-9]{4}\][A-Za-z0-9\s\.\-]*?)\b/g
  const formPattern = /\b((?:Form\s+)?[A-Z]{1,3}\d{1,4}[A-Z]?)(?:\s+(?:Application|Notice|Claim|Statement|Order|Certificate|Request|Response|Acknowledg(?:e)?ment|Defence|Defense|Appeal|Schedule|Witness|Bundle|Questionnaire))?/g
  const rulePattern = /\b((?:CPR|Civil Procedure Rules|FPR|Family Procedure Rules|Tribunal Procedure Rules)\s*(?:Part\s*\d+[A-Za-z]?|r\.?\s*\d+(?:\.\d+)?|\d+)(?:\s*\([^)]+\))?)\b/gi
  const practiceDirectionPattern = /\b((?:Practice Direction|PD)\s*[A-Za-z0-9]+(?:\s*[A-Za-z0-9]+)?)\b/gi
  const urlAfterPattern = /^\s*(?:\(|\[)?\s*(https?:\/\/[^\s)\]]+)/
  const parts: (string | JSX.Element)[] = []
  let cursor = 0
  let keyCounter = 0

  while (cursor < text.length) {
    legislationPattern.lastIndex = cursor
    caseLawPattern.lastIndex = cursor
    formPattern.lastIndex = cursor
    rulePattern.lastIndex = cursor
    practiceDirectionPattern.lastIndex = cursor
    const legMatch = legislationPattern.exec(text)
    const caseMatch = caseLawPattern.exec(text)
    const formMatch = formPattern.exec(text)
    const ruleMatch = rulePattern.exec(text)
    const pdMatch = practiceDirectionPattern.exec(text)
    const resourceMatch = findNextResourceMatch(text, cursor)

      type LegalMatch =
        | { index: number; end: number; type: 'legislation' | 'case' | 'form' | 'rule' | 'practice_direction'; refText: string }
        | { index: number; end: number; type: 'resource'; refText: string; url: string };
      let next: LegalMatch | null = null

    const rawMatches = [
      legMatch
        ? { index: legMatch.index, end: legislationPattern.lastIndex, type: 'legislation' as const, refText: legMatch[1].trim() }
        : null,
      caseMatch
        ? { index: caseMatch.index, end: caseLawPattern.lastIndex, type: 'case' as const, refText: caseMatch[1].trim() }
        : null,
      formMatch
        ? { index: formMatch.index, end: formPattern.lastIndex, type: 'form' as const, refText: formMatch[1].trim() }
        : null,
      ruleMatch
        ? { index: ruleMatch.index, end: rulePattern.lastIndex, type: 'rule' as const, refText: ruleMatch[1].trim() }
        : null,
      pdMatch
        ? { index: pdMatch.index, end: practiceDirectionPattern.lastIndex, type: 'practice_direction' as const, refText: pdMatch[1].trim() }
        : null,
      resourceMatch
        ? { index: resourceMatch.index, end: resourceMatch.end, type: 'resource' as const, refText: resourceMatch.text, url: resourceMatch.url }
        : null
    ];
    function isLegalMatch(x: any): x is LegalMatch {
      return x !== null;
    }
    const matches = rawMatches.filter(isLegalMatch);

    if (matches.length > 0) {
      next = matches.reduce<LegalMatch | null>((best, current) => {
        if (!best) return current;
        if (current.index < best.index) return current;
        if (current.index === best.index && current.end > best.end) return current;
        return best;
      }, null);
    }

    if (!next) {
      parts.push(...convertUrlsToLinks(text.substring(cursor)))
      break
    }

    if (next.index > cursor) {
      parts.push(...convertUrlsToLinks(text.substring(cursor, next.index)))
    }

    if (next.type === 'legislation' || next.type === 'case' || next.type === 'form' || next.type === 'rule' || next.type === 'practice_direction') {
      const trailing = text.slice(next.end)
      const urlMatch = trailing.match(urlAfterPattern)
      if (urlMatch) {
        const urlText = urlMatch[1]
        parts.push(<LegislationLink key={`leg-${keyCounter++}`} refText={next.refText} hrefOverride={urlText} />)
        cursor = next.end + urlMatch[0].length
        continue
      }
      parts.push(<LegislationLink key={`leg-${keyCounter++}`} refText={next.refText} />)
    } else {
      const trailing = text.slice(next.end);
      const urlMatch = trailing.match(urlAfterPattern);
      let href: string | undefined = undefined;
      if (urlMatch) {
        href = urlMatch[1];
      } else if (next.type === 'resource') {
        href = (next as Extract<LegalMatch, { type: 'resource' }>).url;
      }
      parts.push(
        <a
          key={`res-${keyCounter++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          {next.refText}
        </a>
      );
      if (urlMatch) {
        cursor = next.end + urlMatch[0].length;
        continue;
      }
    }

    cursor = next.end
  }

  return parts.length > 0 ? parts : convertUrlsToLinks(text)
}

interface AssistantMetadata {
  pendingCalendarEntries?: PendingCalendarEntriesMetadata;
  documentGenerated?: boolean;
  activeCaseId?: string;
  sources?: Array<{ number: number; title: string; url: string }>;
  [key: string]: unknown;
}

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isTyping?: boolean
  metadata?: AssistantMetadata
  attachments?: AttachmentDisplay[]
}

type StoredMessage = {
  role: 'user' | 'assistant';
  message: string;
  timestamp: string;
  metadata?: AssistantMetadata;
};

type UploadedAttachment = {
  name: string;
  downloadURL: string;
  storagePath: string;
  size: number;
  mimeType?: string | null;
};

type CaseProfilePayload = {
  id?: string;
  caseTitle?: string;
  caseNumber?: string;
  caseType?: string;
  caseDescription?: string;
};

type AttachmentDisplay = {
  name: string;
  downloadURL?: string | null;
  storagePath?: string | null;
  size?: number;
  mimeType?: string | null;
  status?: 'uploading' | 'ready' | 'failed';
};

type TimelineEntry = {
  description: string
  date?: string
  daysUntil?: number | null
  note?: string
}

interface PendingCalendarEntriesMetadata {
  caseId: string;
  caseLabel?: string;
  deadlines?: TimelineEntry[];
  hearings?: TimelineEntry[];
}


type CalendarPromptStatus = 'idle' | 'saving' | 'saved' | 'error' | 'dismissed'
type DraftPromptStatus = 'idle' | 'saving' | 'saved' | 'error' | 'dismissed'

const formatDateDMY = (date: Date) => {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

const parseRelativeDays = (text?: string) => {
  if (!text) return null
  const match =
    text.match(/\bin\s+(\d{1,3})\s+days?\b/i) ||
    text.match(/\b(\d{1,3})\s+days?\s+(?:away|from\s+now|remaining|left|to\s+go)\b/i)
  if (!match) return null
  const days = Number(match[1])
  if (Number.isNaN(days) || days <= 0) return null
  return days
}

const numberWordMap: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12
}

const parseNumberToken = (value: string) => {
  const normalized = value.toLowerCase()
  if (numberWordMap[normalized]) return numberWordMap[normalized]
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : null
}

const weekdayMap: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
}

const parseRelativeDateFromText = (text?: string) => {
  if (!text) return null
  const lower = text.toLowerCase()

  if (lower.includes('tomorrow')) {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return date
  }

  if (lower.includes('day after tomorrow')) {
    const date = new Date()
    date.setDate(date.getDate() + 2)
    return date
  }

  const inMatch = lower.match(/\bin\s+(\w+)\s+(day|days|week|weeks|month|months)\b/)
  if (inMatch) {
    const count = parseNumberToken(inMatch[1])
    if (count && count > 0) {
      const date = new Date()
      if (inMatch[2].startsWith('day')) {
        date.setDate(date.getDate() + count)
      } else if (inMatch[2].startsWith('week')) {
        date.setDate(date.getDate() + count * 7)
      } else {
        date.setMonth(date.getMonth() + count)
      }
      return date
    }
  }

  const awayMatch = lower.match(/\b(\w+)\s+(day|days|week|weeks|month|months)\s+(?:away|from\s+now|remaining|left|to\s+go)\b/)
  if (awayMatch) {
    const count = parseNumberToken(awayMatch[1])
    if (count && count > 0) {
      const date = new Date()
      if (awayMatch[2].startsWith('day')) {
        date.setDate(date.getDate() + count)
      } else if (awayMatch[2].startsWith('week')) {
        date.setDate(date.getDate() + count * 7)
      } else {
        date.setMonth(date.getMonth() + count)
      }
      return date
    }
  }

  const nextWeekday = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
  if (nextWeekday) {
    const targetDay = weekdayMap[nextWeekday[1]]
    if (typeof targetDay === 'number') {
      const date = new Date()
      const currentDay = date.getDay()
      let diff = (targetDay - currentDay + 7) % 7
      if (diff === 0) diff = 7
      date.setDate(date.getDate() + diff)
      return date
    }
  }

  return null
}

const normalizeTimelineDateValue = (value?: string, daysUntil?: number | null, description?: string) => {
  const trimmed = value?.trim()
  if (trimmed) {
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateDMY(parsed)
    }
  }

  const derivedDays = typeof daysUntil === 'number' && Number.isFinite(daysUntil)
    ? daysUntil
    : parseRelativeDays(description)
  if (typeof derivedDays === 'number') {
    const derivedDate = new Date()
    derivedDate.setDate(derivedDate.getDate() + derivedDays)
    return formatDateDMY(derivedDate)
  }

  const derivedDate = parseRelativeDateFromText(description)
  if (derivedDate) {
    return formatDateDMY(derivedDate)
  }

  return ''
}

const formatTimelineDate = (value?: string, daysUntil?: number | null, description?: string) => {
  const normalized = normalizeTimelineDateValue(value, daysUntil, description)
  return normalized || 'DD/MM/YYYY'
}

const parseDMY = (value: string) => {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

const parseYMD = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

const normalizeManualDateInput = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return { normalized: '', valid: true }
  const date =
    parseDMY(trimmed) ||
    parseYMD(trimmed) ||
    parseRelativeDateFromText(trimmed) ||
    new Date(trimmed)
  if (!date || Number.isNaN(date.getTime())) {
    return { normalized: trimmed, valid: false }
  }
  return { normalized: formatDateDMY(date), valid: true }
}

export default function ChatInterface() {
  const [caseId, setCaseId] = useState<string>("");
  const [caseProfileContext, setCaseProfileContext] = useState<CaseProfilePayload | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<any>(null);
  const supabase = getSupabaseBrowserClient();
  const lastUserIdRef = useRef<string | null>(null);

  const normalizeUserId = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    return trimmed.startsWith('anon_') ? trimmed : `anon_${trimmed}`;
  };

  const normalizeCaseId = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(trimmed) ? trimmed : null;
  };

  const getSessionHistoryKey = (userId: string) => `freemiumSessionHistory:${userId}`;

  const clearSessionHistory = (userId?: string | null) => {
    if (typeof window === 'undefined') return;
    if (!userId) return;
    sessionStorage.removeItem(getSessionHistoryKey(userId));
    window.dispatchEvent(new CustomEvent('sessionHistoryCleared'));
  };

  const getSessionStartKey = (userId: string) => `chatSessionStart:${userId}`;
  const getOrInitSessionStart = (userId: string) => {
    if (typeof window === 'undefined') return new Date().toISOString();
    const key = getSessionStartKey(userId);
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const now = new Date().toISOString();
    sessionStorage.setItem(key, now);
    return now;
  };

  useEffect(() => {
    const stored = localStorage.getItem("selectedCaseId");
    if (stored) setCaseId(stored);
  }, []);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ caseId?: string }>).detail;
      if (detail?.caseId) {
        setCaseId(detail.caseId);
      }
    };
    window.addEventListener('activeCaseChanged', handler as EventListener);
    return () => window.removeEventListener('activeCaseChanged', handler as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchCaseProfileContext = async () => {
      if (!supabaseUser?.id) {
        if (!cancelled) setCaseProfileContext(null);
        return;
      }

      try {
        const res = await fetch('/api/cases', { credentials: 'include' });
        if (!res.ok) {
          if (!cancelled) setCaseProfileContext(null);
          return;
        }

        const data = await res.json();
        const cases = Array.isArray(data?.cases) ? data.cases : [];
        const active = (caseId && cases.find((c: any) => c?.id === caseId)) || cases[0];

        if (!active) {
          if (!cancelled) setCaseProfileContext(null);
          return;
        }

        const mapped: CaseProfilePayload = {
          id: active.id,
          caseTitle: active.title || undefined,
          caseNumber: active.external_id || undefined,
          caseType: active.case_type || undefined,
          caseDescription: active.description || undefined,
        };

        if (!cancelled) setCaseProfileContext(mapped);
      } catch {
        if (!cancelled) setCaseProfileContext(null);
      }
    };

    fetchCaseProfileContext();
    return () => {
      cancelled = true;
    };
  }, [supabaseUser?.id, caseId]);

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [userId, setUserId] = useState<string>('anonymous')
  const [conversationId, setConversationId] = useState<string>('')
  const [showWordLimitWarning, setShowWordLimitWarning] = useState(false)
  const [feedbackState, setFeedbackState] = useState<{[key: number]: 'like' | 'dislike' | null}>({})
  const [showReportModal, setShowReportModal] = useState(false)
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [reportIssue, setReportIssue] = useState('')
  const [reportProblem, setReportProblem] = useState('')
  const [reportingMessageIndex, setReportingMessageIndex] = useState<number | null>(null)
  const [reportingMessageContent, setReportingMessageContent] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [guestUploadWarning, setGuestUploadWarning] = useState<string | null>(null)
  const [showGuestSignupModal, setShowGuestSignupModal] = useState(false)
  const [plan, setPlan] = useState<string | null>(null)
  const [planLoaded, setPlanLoaded] = useState(true) // Default to loaded for faster UX
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoaded, setAuthLoaded] = useState(false)
  const [welcomeVariant, setWelcomeVariant] = useState<'new' | 'returning' | null>(null)
  const [freemiumMessageCount, setFreemiumMessageCount] = useState(0)
  const [isGuestLimitReached, setIsGuestLimitReached] = useState(false)
  const [guestLimitNotified, setGuestLimitNotified] = useState(false)
  
  const [draftPromptStates, setDraftPromptStates] = useState<Record<string, { status: DraftPromptStatus, error?: string }>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prevLineCountRef = useRef<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const isProgrammaticScrollRef = useRef(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const normalizedPlan = (plan || '').toLowerCase();

  // Determine whether the assistant has already started producing output
  const assistantHasStartedOutput = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === 'assistant') {
        return (m.content || '').trim().length > 0
      }
    }
    return false
  })()

  

  // Cleanup guest data when component unmounts
  useEffect(() => {
    return () => {
      // Only cleanup if user is not authenticated (guest user) and has a conversation ID
      if (!isAuthenticated && conversationId && conversationId.trim()) {
        fetch('/api/chat/cleanup', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId })
        }).catch((error) => {
          console.warn('Failed to cleanup guest session:', error)
        })
      }
    }
  }, [isAuthenticated, conversationId])
  const isPremiumProPlan =
    normalizedPlan.replace(/\s+/g, '') === 'premiumpro' ||
    normalizedPlan.includes('premium pro') ||
    normalizedPlan.includes('premium cheap')
  const isPremiumPlan = !isPremiumProPlan && normalizedPlan.includes('premium')
  const isFreemiumPlan =
    planLoaded &&
    isAuthenticated &&
    normalizedPlan.length > 0 &&
    (normalizedPlan.includes('free') ||
      normalizedPlan.includes('freemium') ||
      normalizedPlan.includes('guest'));
  const uploadLimit = Infinity
  const uploadLimitReached = false
  const getFreemiumStorageKey = () => 'freemiumMessageCount:__global__';
  const remainingMessages = Math.max(FREEMIUM_MESSAGE_LIMIT - freemiumMessageCount, 0);
  const isNearLimit =
    isFreemiumPlan &&
    remainingMessages > 0 &&
    remainingMessages <= 5;

  const scrollToBottom = (behavior: 'auto' | 'smooth' = 'smooth') => {
    const container = scrollContainerRef.current
    if (container) {
      isProgrammaticScrollRef.current = true
      container.scrollTo({ top: container.scrollHeight, behavior })
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior })
    }
    isNearBottomRef.current = true
  }

  const handleScroll = () => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false
      return
    }

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    const isNearBottom = distanceFromBottom < 80
    isNearBottomRef.current = isNearBottom

    if (isNearBottom !== autoScroll) {
      setAutoScroll(isNearBottom)
    }
  }

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      // Could add a toast notification here
    } catch (err: unknown) {
      console.error('Failed to copy:', err)
    }
  }

  const handleAttachClick = () => {
    if (!supabaseUser) {
      setShowGuestSignupModal(true)
      return
    }
    fileInputRef.current?.click()
  }

  const isGuestFreePlan = planLoaded && plan === 'Free' && !supabaseUser

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (!supabaseUser) {
      setShowGuestSignupModal(true)
      e.target.value = ''
      return
    }
    setGuestUploadWarning(null)
    setAttachedFiles(prev => [...prev, ...files])
    e.target.value = ''
  }

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const sanitizeFilename = (value: string) => {
    const trimmed = value.replace(/\s+/g, ' ').trim()
    return trimmed.replace(/[^a-zA-Z0-9._\- ]/g, '').trim() || 'uploaded-document'
  }

  const uploadAttachments = async (files: File[], targetCaseId?: string | null): Promise<UploadedAttachment[]> => {
    if (!files.length) return []
    if (!supabaseUser) {
      setShowGuestSignupModal(true)
      return []
    }

    const uploaded: UploadedAttachment[] = []
    const errors: string[] = []
    const formData = new FormData()
    if (targetCaseId?.trim()) {
      formData.append('caseId', targetCaseId.trim())
    }
    for (const file of files) {
      formData.append('files', file, sanitizeFilename(file.name))
    }

    try {
      const response = await fetch('/api/chat-upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.message || 'Upload failed')
      }

      if (Array.isArray(data?.files)) {
        data.files.forEach((file: UploadedAttachment) => {
          uploaded.push(file)
        })
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      console.error('Attachment upload failed', error)
      errors.push(message)
    }

    if (!uploaded.length && errors.length > 0) {
      throw new Error(errors[0])
    }

    if (errors.length > 0) {
      setGuestUploadWarning('Some attachments failed to upload. Please retry the missing files.')
    }

    return uploaded
  }

  const composeMessageWithAttachments = (text: string, attachments: AttachmentDisplay[]) => {
    const readyAttachments = attachments.filter((file) => file.downloadURL)
    if (!readyAttachments.length) return text
    const baseMessage = text.trim().length > 0 ? text.trim() : 'Uploaded documents for review.'
    const attachmentLines = readyAttachments.map((file) => `- ${file.name}: ${file.downloadURL}`).join('\n')
    return `${baseMessage}\n\nAttachments:\n${attachmentLines}`
  }

  const handleFeedback = async (messageIndex: number, type: 'like' | 'dislike' | 'report', content: string) => {
    if (type === 'report') {
      // Open modal for report
      setReportingMessageIndex(messageIndex)
      setReportingMessageContent(content)
      setShowReportModal(true)
      return
    }

    try {
      await fetch('/api/admin/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          conversationId,
          messageIndex,
          feedbackType: type,
          messageContent: content,
          timestamp: new Date().toISOString()
        })
      })
      
      setFeedbackState(prev => ({
        ...prev,
        [messageIndex]: type
      }))
    } catch (error: unknown) {
      console.error('Failed to submit feedback:', error)
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const user = data?.user
        setSupabaseUser(user)
        setIsAuthenticated(Boolean(user))
        lastUserIdRef.current = user?.id || null

        if (!user) {
          if (lastUserIdRef.current) {
            clearSessionHistory(lastUserIdRef.current)
            lastUserIdRef.current = null
          }
          setPlan('Free')
          setWelcomeVariant(null)
          return
        }

        if (typeof window !== 'undefined') {
          const welcomeKey = `chatbotWelcomeSeen:${user.id}`
          const hasSeen = localStorage.getItem(welcomeKey) === 'true'
          setWelcomeVariant(hasSeen ? 'returning' : 'new')
          if (!hasSeen) {
            localStorage.setItem(welcomeKey, 'true')
          }
        } else {
          setWelcomeVariant('returning')
        }

        // Load plan asynchronously without blocking UI
        try {
          const response = await fetch('/api/user/plan', { credentials: 'include' })
          if (response.ok) {
            const data = await response.json()
            const fetchedPlan = (data.plan || 'Free').toString().trim()
            setPlan(fetchedPlan)
          } else {
            setPlan('Free')
          }
        } catch (error: unknown) {
          console.error('Failed to load subscription plan:', error)
          setPlan('Free')
        }
        // Note: planLoaded already set to true in state initialization
      } finally {
        setAuthLoaded(true)
      }
    };

    checkAuth()

    const authListener = supabase.auth.onAuthStateChange((...args: any[]) => {
      const session = args[1]
      const nextUserId = session?.user?.id || null
      const prevUserId = lastUserIdRef.current
      if (prevUserId && prevUserId !== nextUserId) {
        clearSessionHistory(prevUserId)
      }
      if (!nextUserId && prevUserId) {
        clearSessionHistory(prevUserId)
      }
      lastUserIdRef.current = nextUserId
      setSupabaseUser(session?.user || null)
      setIsAuthenticated(Boolean(session?.user))
      setAuthLoaded(true)
    })
    const { data: { subscription } } = authListener

    return () => subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    if (isGuestFreePlan) {
      const guestMessages = messages.filter(m => m.role === 'user').length;
      setIsGuestLimitReached(guestMessages >= GUEST_MESSAGE_LIMIT);
    } else {
      setIsGuestLimitReached(false);
    }
  }, [messages, isGuestFreePlan]);

  useEffect(() => {
    if (!isGuestLimitReached || !isGuestFreePlan) {
      setGuestLimitNotified(false);
    }
  }, [isGuestLimitReached, isGuestFreePlan]);

  useEffect(() => {
    if (!isFreemiumPlan || typeof window === 'undefined') {
      return;
    }
    const storageKey = getFreemiumStorageKey();
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = Number.parseInt(stored, 10);
      if (!Number.isNaN(parsed)) {
        setFreemiumMessageCount(Math.min(parsed, FREEMIUM_MESSAGE_LIMIT));
        return;
      }
    }
    setFreemiumMessageCount(0);
  }, [caseId, isFreemiumPlan]);


  useEffect(() => {
    if (!isFreemiumPlan) {
      setFreemiumMessageCount(0);
    }
  }, [isFreemiumPlan]);

  useEffect(() => {
    if (typeof window === 'undefined' || !planLoaded) return;
    const storageKey = getFreemiumStorageKey();

    if (!isFreemiumPlan) {
      localStorage.removeItem(storageKey);
      window.dispatchEvent(
        new CustomEvent('freemiumMessageCountChanged', {
          detail: { count: 0, limit: FREEMIUM_MESSAGE_LIMIT }
        })
      );
      return;
    }

    const boundedCount = Math.min(freemiumMessageCount, FREEMIUM_MESSAGE_LIMIT);
    localStorage.setItem(storageKey, String(boundedCount));
    window.dispatchEvent(
      new CustomEvent('freemiumMessageCountChanged', {
        detail: { count: boundedCount, limit: FREEMIUM_MESSAGE_LIMIT }
      })
    );
  }, [freemiumMessageCount, isFreemiumPlan, caseId, planLoaded]);

  useEffect(() => {
    if (!planLoaded) return;
    if (!isFreemiumPlan && !isGuestFreePlan) return;
    fetch('/api/message-count', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (typeof data?.count === 'number') {
          if (isFreemiumPlan) {
            setFreemiumMessageCount(Math.min(data.count, FREEMIUM_MESSAGE_LIMIT));
          }
        }
        if (isGuestFreePlan && typeof data?.limit === 'number' && typeof data?.count === 'number') {
          const reached = data.count >= data.limit;
          setIsGuestLimitReached(reached);
          if (reached) setShowGuestSignupModal(true);
        }
      })
      .catch(() => undefined);
  }, [planLoaded, isFreemiumPlan, isGuestFreePlan, caseId]);

  const handleSubmitReport = async () => {
    if (!reportIssue.trim() || !reportProblem.trim()) {
      alert('Please fill in all fields')
      return
    }

    try {
      await fetch('/api/admin/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          conversationId,
          messageIndex: reportingMessageIndex,
          feedbackType: 'report',
          messageContent: reportingMessageContent,
          reportIssue,
          reportProblem,
          timestamp: new Date().toISOString()
        })
      })

      // Close modal and reset
      setShowReportModal(false)
      setReportIssue('')
      setReportProblem('')
      setReportingMessageIndex(null)
      setReportingMessageContent('')
      
      alert('Report submitted successfully. Thank you for your feedback!')
    } catch (error: unknown) {
      console.error('Failed to submit report:', error)
      alert('Failed to submit report. Please try again.')
    }
  }

  const handleRegenerate = async (messageIndex: number) => {
    // Get the user message that prompted this response
    const userMsg = messages[messageIndex - 1]
    if (!userMsg || userMsg.role !== 'user') return

    // Remove the current bot response
    setMessages(prev => prev.slice(0, messageIndex))
    
    // Resend the user's message
    setLoading(true)
    setLoadingLabel('Working...')

    const sessionStart = getOrInitSessionStart(supabaseUser?.id || 'anonymous')
    const sessionUserMessageCount =
      messages.filter((msg) => msg.role === 'user').length + 1

    try {
      const regenAttachments = userMsg.attachments || []
      const regenMessage = regenAttachments.length
        ? composeMessageWithAttachments(userMsg.content, regenAttachments)
        : userMsg.content
      const attachmentsOnly = regenAttachments.length > 0 && userMsg.content.trim() === 'Uploaded documents for review.'
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: regenMessage, 
          history: messages.slice(0, messageIndex - 1),
          userId: userId,
          conversationId: conversationId,
          caseProfile: caseProfileContext || undefined,
          activeCaseId: normalizeCaseId(caseId) || undefined,
          attachments: regenAttachments,
          attachmentsOnly: attachmentsOnly,
          sessionMessageCount: sessionUserMessageCount,
          sessionStartedAt: sessionStart
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to get response')
      }

      if (data?.metadata?.activeCaseId) {
        const resolvedCaseId = String(data.metadata.activeCaseId).trim()
        if (resolvedCaseId) {
          setCaseId(resolvedCaseId)
          localStorage.setItem('selectedCaseId', resolvedCaseId)
        }
      }

      const assistantText = stripAssistantSourcesBlock(String(data.response || ''))
      const assistantMessageId = `assistant_regen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isTyping: true,
        metadata: data.metadata as AssistantMetadata | undefined
      }

      setMessages((prev) => [...prev, assistantMessage])

      typeMessageById(assistantText, assistantMessageId)
    } catch (error: unknown) {
      const errorText = 'MyMckenzie is unavailable to help right now. Please try again later.'
      const errorMessageId = `assistant_regen_error_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const errorMessage: Message = {
        id: errorMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isTyping: true
      }
      setMessages((prev) => [...prev, errorMessage])

      typeMessageById(errorText, errorMessageId)
    }
  }

  // Auto-expand textarea — derive min/max from CSS and only grow when line count changes
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    // reset to auto to get accurate scrollHeight
    ta.style.height = 'auto'
    const computed = window.getComputedStyle(ta)
    const lineHeightPx = parseFloat(computed.lineHeight) || 20
    const scrollH = ta.scrollHeight
    const currentLines = Math.max(1, Math.round(scrollH / lineHeightPx))

    const maxLines = 10
    const clampedLines = Math.min(currentLines, maxLines)

    // Read CSS min-height (e.g. '32px') and use it as JS minimum
    const cssMinHeight = parseFloat(computed.minHeight || '') || 32
    const paddingY = (parseFloat(computed.paddingTop || '0') + parseFloat(computed.paddingBottom || '0')) || 8

    // Compute the max height from maxLines so JS and maxLines are consistent
    const computedMaxHeight = Math.max(cssMinHeight, Math.round(maxLines * lineHeightPx + paddingY))

    if (clampedLines !== prevLineCountRef.current) {
      const desiredHeight = Math.round(clampedLines * lineHeightPx + paddingY)
      const newHeight = Math.max(cssMinHeight, Math.min(computedMaxHeight, desiredHeight))
      ta.style.height = `${newHeight}px`
      prevLineCountRef.current = clampedLines
    } else {
      // keep existing height — prevents tiny jumps
      if (ta.clientHeight < cssMinHeight) ta.style.height = `${cssMinHeight}px`
    }
  }, [input])

  useEffect(() => {
    if (autoScroll) {
      scrollToBottom()
    }
  }, [messages.length, autoScroll])

  const runTypingAnimation = (
    fullText: string,
    applyUpdate: (prev: Message[], text: string, isDone: boolean) => Message[]
  ) => {
    const strippedText = stripAssistantSourcesBlock(fullText)
    const fallbackText = typeof fullText === 'string' ? fullText.trim() : ''
    const sanitizedText = strippedText || fallbackText

    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current)
      typingIntervalRef.current = null
    }

    if (!sanitizedText) {
      setMessages((prev) => applyUpdate(prev, '', true))
      setLoading(false)
      setLoadingLabel(null)
      return
    }

    const totalLength = sanitizedText.length
    // Drive typing by elapsed time so it never jumps from empty to full text.
    const tickMs = 24
    const minDurationMs = 1400
    const maxDurationMs = 9000
    const targetDurationMs = Math.min(maxDurationMs, Math.max(minDurationMs, totalLength * 26))
    const startedAt = Date.now()
    let cursor = 0

    const tick = () => {
      const elapsed = Date.now() - startedAt
      const progress = Math.min(1, elapsed / targetDurationMs)
      const nextCursor = Math.max(cursor, Math.ceil(totalLength * progress))
      cursor = Math.min(totalLength, nextCursor)
      const chunk = formatAssistantResponse(sanitizedText.slice(0, cursor))
      const isDone = cursor >= totalLength

      setMessages((prev) => applyUpdate(prev, chunk, isDone))

      if (isDone) {
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current)
          typingIntervalRef.current = null
        }
        setLoading(false)
        setLoadingLabel(null)
      }
    }

    tick()
    if (cursor < totalLength) {
      typingIntervalRef.current = setInterval(tick, tickMs)
    }
  }

  const typeMessageById = (fullText: string, messageId: string) => {
    runTypingAnimation(fullText, (prev, text, isDone) => {
      const updated = [...prev]
      const targetIndex = updated.findIndex((m) => m.id === messageId)
      if (targetIndex >= 0) {
        updated[targetIndex] = {
          ...updated[targetIndex],
          content: text,
          isTyping: !isDone
        }
      }
      return updated
    })
  }

  // Load conversation history if conversationId is in URL
  useEffect(() => {
    const conversationStorageKey = 'currentConversationId'

    const loadConversation = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      const conversationId = urlParams.get('conversationId')
      const isNew = urlParams.get('new')
      
      // Get or create userId
      let storedUserId = localStorage.getItem('userId')
      if (!storedUserId) {
        storedUserId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        localStorage.setItem('userId', storedUserId)
      } else {
        const normalized = normalizeUserId(storedUserId)
        if (normalized && normalized !== storedUserId) {
          storedUserId = normalized
          localStorage.setItem('userId', storedUserId)
        }
      }
      setUserId(storedUserId)

      setMessages([])

      // Clear messages for new chat and generate new conversationId
      if (isNew) {
        setMessages([])
        const newConversationId = generateUUID()
        setConversationId(newConversationId)
        localStorage.setItem(conversationStorageKey, newConversationId)
        // Remove query params
        window.history.replaceState({}, '', '/chatbot')
        return
      }

      // Load previous conversation
      if (conversationId) {
        setConversationId(conversationId)
        localStorage.setItem(conversationStorageKey, conversationId)
        try {
          const response = await fetch('/api/chat-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: storedUserId, sessionId: conversationId })
          })
          
          const data = await response.json()
          if (response.ok && Array.isArray(data.messages)) {
            const loadedMessages: Message[] = data.messages.map((msg: StoredMessage) => ({
              id: `msg_${msg.timestamp}_${Math.random().toString(36).slice(2, 6)}`,
              role: msg.role,
              content: msg.message,
              timestamp: new Date(msg.timestamp),
              metadata: msg.metadata
            }))
            setMessages(loadedMessages)
            const userMessageCount = loadedMessages.filter(msg => msg.role === 'user').length
            if (userMessageCount > 0) {
              setFreemiumMessageCount(prev => Math.max(prev, Math.min(userMessageCount, FREEMIUM_MESSAGE_LIMIT)))
            }
          }
        } catch (error: unknown) {
          console.error('Failed to load conversation:', error)
        }
      } else {
        // No conversationId in URL, check localStorage or create new
        const storedConvId = localStorage.getItem(conversationStorageKey)
        if (storedConvId) {
          setConversationId(storedConvId)
        } else {
          const newConversationId = generateUUID()
          setConversationId(newConversationId)
          localStorage.setItem(conversationStorageKey, newConversationId)
        }
      }
    }

    loadConversation()
  }, [])

  // Broadcast conversation ID changes to siblings (like ChatbotNavbar) for per-thread message tracking
  useEffect(() => {
    if (conversationId) {
      const event = new CustomEvent('currentConversationIdChanged', { detail: conversationId });
      window.dispatchEvent(event);
    }
  }, [conversationId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isFreemiumPlan || !supabaseUser?.id) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('new')) {
      clearSessionHistory(supabaseUser.id);
      return;
    }
    if (messages.length > 0) return;
    const raw = sessionStorage.getItem(getSessionHistoryKey(supabaseUser.id));
    if (!raw) return;
    try {
      const stored = JSON.parse(raw);
      if (Array.isArray(stored)) {
        const restored: Message[] = stored.map((msg: any) => ({
          id: `msg_${msg.timestamp || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: typeof msg.content === 'string' ? msg.content : '',
          timestamp: new Date(msg.timestamp || Date.now())
        }));
        setMessages(restored);
      }
    } catch {
      // ignore invalid storage
    }
  }, [isFreemiumPlan, supabaseUser?.id, messages.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isFreemiumPlan || !supabaseUser?.id) return;
    const payload = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : '',
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp || Date.now()).toISOString()
    }));
    sessionStorage.setItem(getSessionHistoryKey(supabaseUser.id), JSON.stringify(payload));
  }, [messages, isFreemiumPlan, supabaseUser?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : '',
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp || Date.now()).toISOString()
    }));
    window.dispatchEvent(new CustomEvent('sessionHistoryUpdated', { detail: { messages: payload } }));
  }, [messages]);


  // Reset textarea height when input is cleared
  useEffect(() => {
    if (textareaRef.current && input === '') {
      textareaRef.current.style.height = 'auto'
    }
  }, [input]);

  const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault()
    const hasText = input.trim().length > 0
    const hasAttachments = attachedFiles.length > 0
    const guestMessagesCount = messages.filter((m) => m.role === 'user').length
    if ((!hasText && !hasAttachments) || loading) return
    if (isGuestFreePlan && guestMessagesCount >= GUEST_MESSAGE_LIMIT) {
      setIsGuestLimitReached(true)
      if (!guestLimitNotified) {
        setGuestLimitNotified(true)
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant_limit_${Date.now()}`,
            role: 'assistant',
            content: `Hi, you have reached your ${GUEST_MESSAGE_LIMIT}-message guest limit. Please sign up to continue.`,
            timestamp: new Date()
          }
        ])
      }
      setShowGuestSignupModal(true)
      return
    }
    if (isFreemiumPlan && freemiumMessageCount >= FREEMIUM_MESSAGE_LIMIT) {
      setShowLimitModal(true)
      return
    }
    if (hasAttachments && !supabaseUser) {
      setShowGuestSignupModal(true)
      return
    }

    const rawInput = input
    setGuestUploadWarning(null)
    setLoading(true)
    setLoadingLabel('Working...')
    const displayMessage = hasText ? rawInput.trim() : 'Uploaded documents for review.'
    const filesToUpload = [...attachedFiles]
    const optimisticAttachments: AttachmentDisplay[] = filesToUpload.map((file) => ({
      name: file.name,
      size: file.size,
      mimeType: file.type || null,
      status: 'uploading'
    }))
    const optimisticMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const userMessage: Message = {
      id: optimisticMessageId,
      role: 'user',
      content: displayMessage,
      timestamp: new Date(),
      attachments: optimisticAttachments
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setAttachedFiles([])

    let uploadedAttachments: UploadedAttachment[] = []
    if (hasAttachments) {
      try {
        uploadedAttachments = await uploadAttachments(filesToUpload, caseId)
      } catch (error: unknown) {
        console.error('Attachment upload failed', error)
        const message = error instanceof Error ? error.message : 'Attachment upload failed. Please try again.'
        alert(message)
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMessageId))
        setInput(rawInput)
        setAttachedFiles(filesToUpload)
        setLoading(false)
        setLoadingLabel(null)
        return
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === optimisticMessageId
            ? {
                ...msg,
                attachments: uploadedAttachments.map((file) => ({
                  ...file,
                  status: 'ready'
                }))
              }
            : msg
        )
      )
    } else {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === optimisticMessageId
            ? { ...msg, attachments: [] }
            : msg
        )
      )
    }

    const composedMessage = composeMessageWithAttachments(displayMessage, uploadedAttachments)
    const sessionStart = getOrInitSessionStart(supabaseUser?.id || 'anonymous')
    const sessionUserMessageCount =
      messages.filter((msg) => msg.role === 'user').length + 1

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: composedMessage, 
          history: messages,
          userId: userId,
          conversationId: conversationId,
          activeCaseId: normalizeCaseId(caseId) || undefined,
          caseProfile: caseProfileContext || undefined,
          attachments: uploadedAttachments,
          attachmentsOnly: !hasText && uploadedAttachments.length > 0,
          sessionMessageCount: sessionUserMessageCount,
          sessionStartedAt: sessionStart
        }),
      })

      const raw = await response.text()
      const data = (() => {
        try {
          return raw ? JSON.parse(raw) : null
        } catch {
          return null
        }
      })()

      if (!response.ok) {
        const serverMessage =
          data && typeof data.message === 'string'
            ? data.message
            : data && typeof data.error === 'string'
              ? data.error
              : ''
        const details = serverMessage || (raw ? raw.slice(0, 240) : '')
        throw new Error(`API ${response.status}${details ? `: ${details}` : ''}`)
      }

      if (!data || typeof data.response !== 'string' || !data.response.trim()) {
        throw new Error('API 200: Invalid response payload')
      }

      const assistantText = data.response
      const serverIndicatedLimitReached =
        Boolean((data as any)?.guestLimitReached) ||
        Boolean((data as any)?.metadata?.guestLimitReached) ||
        Boolean((data as any)?.metadata?.limitReached)
      const looksLikeGuestLimitMessage =
        typeof assistantText === 'string' &&
        /guest\s+limit/i.test(assistantText) &&
        /sign\s*up|sign\s+in|continue/i.test(assistantText)

      if (serverIndicatedLimitReached || looksLikeGuestLimitMessage) {
        setIsGuestLimitReached(true)
        setShowGuestSignupModal(true)
      }
      const assistantMessageId = `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isTyping: true,
        metadata: data.metadata as AssistantMetadata | undefined
      }

      setMessages((prev) => [...prev, assistantMessage])
      typeMessageById(assistantText, assistantMessageId)
    } catch (error: unknown) {
      const errorText = error instanceof Error && error.message
        ? error.message
        : 'MyMckenzie is unavailable to help right now. Please try again later.'
      const errorMessageId = `assistant_error_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const errorMessage: Message = {
        id: errorMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isTyping: true
      }
      setMessages((prev) => [...prev, errorMessage])
      typeMessageById(errorText, errorMessageId)
    }
  }

  const containerStyle: CSSProperties = {
    width: '100%',
    background: 'transparent',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: '0',
    minHeight: '100%'
  }

  const stageStyle: CSSProperties = {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    color: '#f1f5f9',
    minHeight: 'calc(100vh - 88px)',
    padding: '0'
  }

  const normalizedPlanForTier = (plan || '').toLowerCase()
  const isPremiumPro =
    normalizedPlanForTier.replace(/\s+/g, '') === 'premiumpro' ||
    normalizedPlanForTier.includes('premium cheap')

  const handleCalendarDismiss = (key: string) => {
    // Calendar dismissed (feature removed) — no-op
  }

  const handleCalendarSave = async (_key: string, _payload: PendingCalendarEntriesMetadata) => {
    // Calendar save removed — no-op
  }

  const buildDraftKey = (message: Message, index: number) => {
    return `${message.id || 'draft'}-${message.timestamp?.getTime?.() || index}`
  }

  const handleDraftSave = async (key: string, content: string, targetCaseId?: string) => {
    if (!content.trim()) {
      setDraftPromptStates(prev => ({
        ...prev,
        [key]: { status: 'error', error: 'Draft content is empty.' }
      }))
      return
    }

    if (!supabaseUser) {
      setDraftPromptStates(prev => ({
        ...prev,
        [key]: { status: 'error', error: 'Sign in to save drafts to MyFiles.' }
      }))
      return
    }

    setDraftPromptStates(prev => ({
      ...prev,
      [key]: { status: 'saving' }
    }))

    try {
      const resolvedCaseId = targetCaseId || caseId || localStorage.getItem('selectedCaseId') || ''
      if (!resolvedCaseId) {
        throw new Error('No active case found to save the draft.')
      }

      const titleLine = content.split('\n').find(line => line.trim()) || 'Draft document'
      // Get token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const response = await fetch('/api/drafts/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          caseId: resolvedCaseId,
          title: titleLine.trim().slice(0, 120),
          content
        })
      })

      const data = await response.json()
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to save draft')
      }

      setDraftPromptStates(prev => ({
        ...prev,
        [key]: { status: 'saved' }
      }))
    } catch (error: any) {
      setDraftPromptStates(prev => ({
        ...prev,
        [key]: { status: 'error', error: error?.message || 'Failed to save draft' }
      }))
    }
  }

  return (
    <>
      <div style={containerStyle}>
        <div style={stageStyle}>
        {/* Top spacer to match full-bleed layout */}
        <div style={{ height: '28px', display: 'flex', alignItems: 'center', padding: '0 24px' }} />


        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            minHeight: 0,
            width: '100%',
            alignItems: 'center',
            justifyContent: 'flex-end',
            position: 'relative',
            paddingBottom: '240px', // increased padding to prevent chatbar overlap
          }}
        >
                  <div style={{ width: '100%', maxWidth: '760px', margin: '32px auto 0 auto', padding: '0 12px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '120px' }}>
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingLeft: 0, paddingRight: 0 }}
            >
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: '30px', opacity: 0.85, color: '#ffffff', marginLeft: 0 }}>
                {!authLoaded ? null : !supabaseUser ? (
                  <div style={{ maxWidth: '700px', margin: '0 auto', lineHeight: 1.7, fontFamily: 'Google Sans, sans-serif', fontSize: '17px', fontWeight: 500 }}>
                    <p style={{ fontSize: '17px', fontWeight: 500, marginBottom: '20px' }}>
                      Welcome to MyMcKenzie Assistant.
                    </p>
                    <p style={{ marginBottom: '20px' }}>
                      Ask your question to get clear procedural guidance.
                    </p>
                    <p style={{ fontWeight: 600 }}>
                      MyMcKenzie Assistant can make mistakes and does not provide legal advice. Always confirm before relying on any response.
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      width: '100%',
                      maxWidth: '700px',
                      margin: '0 auto',
                      lineHeight: 1.7,
                      fontFamily: 'Google Sans, sans-serif',
                      fontSize: '17px',
                      fontWeight: 500,
                      minHeight: '120px',
                      marginTop: '8vh', // move greeting up by 8% of viewport height
                    }}
                  >
                    <p style={{
                      fontSize: '2.5rem',
                      fontWeight: 500, // medium weight
                      marginBottom: '36px',
                      color: '#fff',
                      letterSpacing: '0.02em', // disciplined letter spacing
                      lineHeight: 1.1,
                      textAlign: 'center',
                      textShadow: '0 2px 12px rgba(39,4,39,0.18)'
                    }}>
                      I am MyMcKenzie Assistant, here to help you <span role="img" aria-label="waving hand">👋</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {messages.map((message, index) => {
              const isAlert = message.content?.trim().startsWith('⚠️')
              const isUser = message.role === 'user'
              
              const draftKey = !isUser && message.metadata?.documentGenerated
                ? buildDraftKey(message, index)
                : null
              const draftState = draftKey ? draftPromptStates[draftKey]?.status || 'idle' : null
              const draftError = draftKey ? draftPromptStates[draftKey]?.error : null
              const isDraftPromptVisible = Boolean(draftKey && draftState !== 'dismissed')
              const isDraftSaving = draftState === 'saving'
              const isDraftSaved = draftState === 'saved'

              if (isAlert) {
                return (
                  <div key={index} style={{ marginBottom: '18px', textAlign: 'center' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        padding: '10px 16px',
                        borderRadius: '999px',
                        border: '1px solid rgba(251,191,36,0.4)',
                        background: 'rgba(251,191,36,0.08)',
                        color: '#fbbf24',
                        fontSize: '13px',
                      }}
                    >
                      <p className="whitespace-pre-wrap" style={{ lineHeight: 1.6 }}>{message.content}</p>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={index}
                  className="message-container"
                  style={{
                    display: 'flex',
                    width: '100%',
                    boxSizing: 'border-box',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    marginBottom: '20px',
                    paddingLeft: '0',
                    paddingRight: '0'
                  }}
                >
                  <style jsx>{`
                    .message-container .user-copy-button {
                      opacity: 0;
                      transition: opacity 0.2s;
                    }
                    .message-container:hover .user-copy-button {
                      opacity: 1;
                    }
                    .message-container .assistant-action-button {
                      transition: transform 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
                    }
                    .message-container .assistant-action-button:hover {
                      transform: translateY(-1px);
                      border-color: rgba(255,255,255,0.7);
                      color: #ffffff;
                      box-shadow: 0 6px 16px rgba(0,0,0,0.25);
                    }
                    /* Inherit dark purple styling for user message bubble content */
                    .user-message-bubble table {
                      background: rgba(40, 20, 60, 0.3);
                      border-collapse: collapse;
                      width: 100%;
                    }
                    .user-message-bubble table thead {
                      background: rgba(60, 30, 90, 0.4);
                    }
                    .user-message-bubble table th,
                    .user-message-bubble table td {
                      border: 1px solid rgba(168, 85, 247, 0.15);
                      padding: 10px 12px;
                      text-align: left;
                      color: #f8fafc;
                    }
                    .user-message-bubble table th {
                      font-weight: 700;
                      background: rgba(60, 30, 90, 0.4);
                      color: #f0f0ff;
                    }
                    .user-message-bubble table tbody tr:hover {
                      background: rgba(60, 30, 90, 0.3);
                    }
                    .message-container .assistant-message {
                      width: 100%;
                      background: transparent;
                      border: none;
                      border-radius: 0;
                      padding: 4px 0;
                      box-shadow: none;
                      backdrop-filter: none;
                    }
                    .message-container .assistant-section {
                      display: flex;
                      flex-direction: column;
                      gap: 8px;
                    }
                    .message-container .assistant-heading {
                      font-family: 'Google Sans, sans-serif';
                      font-size: 17px;
                      font-weight: 600;
                      letter-spacing: 0.01em;
                      color: #f8fafc;
                      margin: 0 0 8px 0;
                      padding-bottom: 0;
                      border-bottom: none;
                      text-transform: uppercase;
                      text-decoration: underline;
                      text-decoration-thickness: 2px;
                      text-underline-offset: 6px;
                    }
                    .message-container .assistant-subheading {
                      font-family: 'Google Sans, sans-serif';
                      font-size: 16px;
                      font-weight: 600;
                      line-height: 1.6;
                      margin: 6px 0 4px 0;
                      color: #f1f5f9;
                      text-transform: uppercase;
                      text-decoration: none;
                    }
                    .message-container .assistant-summary {
                      font-family: 'Google Sans, sans-serif';
                      font-size: 16px;
                      font-weight: 600;
                      line-height: 1.65;
                      margin: 10px 0 4px 0;
                      color: #f8fafc;
                    }
                    .message-container .assistant-paragraph {
                      font-family: 'Google Sans, sans-serif';
                      font-size: 16px;
                      font-weight: 500;
                      line-height: 1.65;
                      margin: 0 0 8px 0;
                      color: #e2e8f0;
                    }
                    .message-container .assistant-list {
                      margin: 0 0 8px 0;
                      padding-left: 18px;
                      list-style-position: outside;
                      list-style-type: disc;
                      color: #e2e8f0;
                    }
                    .message-container .assistant-list-item {
                      font-family: 'Google Sans, sans-serif';
                      font-size: 16px;
                      font-weight: 500;
                      line-height: 1.65;
                      margin: 0 0 6px 0;
                      color: #e2e8f0;
                    }
                    .message-container .assistant-divider {
                      margin: 10px 0 8px 0;
                      width: 100%;
                      border-top: 1px solid rgba(148, 163, 184, 0.4);
                    }
                    @media (max-width: 720px) {
                      .message-container .assistant-message {
                        padding: 2px 0;
                        border-radius: 0;
                      }
                      .message-container .assistant-heading {
                        font-size: 16px;
                      }
                      .message-container .assistant-subheading {
                        font-size: 15px;
                      }
                      .message-container .assistant-summary {
                        font-size: 15px;
                      }
                      .message-container .assistant-paragraph,
                      .message-container .assistant-list-item {
                        font-size: 15px;
                      }
                    }
                  `}</style>
                  <div
                    style={{
                      padding: isUser ? '6px 14px 6px 10px' : '0 0 0 26px',
                      borderRadius: isUser ? '12px' : '0',
                      maxWidth: isUser ? 'min(60%, 420px)' : '96%',
                      width: isUser ? 'fit-content' : '100%',
                      boxSizing: 'border-box',
                      lineHeight: 1.65,
                      fontFamily: 'Google Sans, sans-serif',
                      fontSize: '16px',
                      fontWeight: 500,
                      background: isUser
                        ? `rgba(168, 85, 247, 0.08)`
                        : 'transparent',
                      color: isUser ? '#ffffff' : 'inherit',
                      border: isUser ? '1px solid rgba(168, 85, 247, 0.15)' : 'none',
                      boxShadow: isUser
                        ? 'none'
                        : 'none',
                      backdropFilter: isUser ? 'blur(4px)' : 'none',
                      overflow: isUser ? 'hidden' : 'visible',
                      textShadow: isUser ? 'none' : 'none',
                      transform: isUser ? 'translateZ(0)' : 'none',
                      alignSelf: isUser ? 'flex-end' : 'flex-start',
                      marginRight: isUser ? '18px' : '0'
                    }}
                    className={isUser ? 'user-message-bubble' : ''}
                  >
                    {isUser ? (
                      <>
                        {message.attachments && message.attachments.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                            {message.attachments.map((file, idx) => (
                              file.downloadURL ? (
                                <a
                                  key={`${file.storagePath || file.name}-${idx}`}
                                  href={file.downloadURL}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 10px',
                                    borderRadius: '999px',
                                    background: 'rgba(255,255,255,0.12)',
                                    color: '#f8fafc',
                                    fontSize: '13px',
                                    textDecoration: 'none',
                                    border: '1px solid rgba(255,255,255,0.18)'
                                  }}
                                >
                                  📎 {file.name}
                                </a>
                              ) : (
                                <div
                                  key={`${file.storagePath || file.name}-${idx}`}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 10px',
                                    borderRadius: '999px',
                                    background: 'rgba(255,255,255,0.08)',
                                    color: '#e2e8f0',
                                    fontSize: '13px',
                                    border: '1px dashed rgba(255,255,255,0.2)'
                                  }}
                                >
                                  📎 {file.name} <span style={{ opacity: 0.8 }}>Uploading...</span>
                                </div>
                              )
                            ))}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap assistant-paragraph">
                          {renderMessageContent(message.content)}
                        </p>
                      </>
                    ) : (
                      <div className="assistant-message">
                        {message.attachments && message.attachments.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                            {message.attachments.map((file, idx) => (
                              file.downloadURL ? (
                                <a
                                  key={`${file.storagePath || file.name}-${idx}`}
                                  href={file.downloadURL}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 10px',
                                    borderRadius: '999px',
                                    background: 'rgba(255,255,255,0.12)',
                                    color: '#f8fafc',
                                    fontSize: '13px',
                                    textDecoration: 'none',
                                    border: '1px solid rgba(255,255,255,0.18)'
                                  }}
                                >
                                  📎 {file.name}
                                </a>
                              ) : (
                                <div
                                  key={`${file.storagePath || file.name}-${idx}`}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 10px',
                                    borderRadius: '999px',
                                    background: 'rgba(255,255,255,0.08)',
                                    color: '#e2e8f0',
                                    fontSize: '13px',
                                    border: '1px dashed rgba(255,255,255,0.2)'
                                  }}
                                >
                                  📎 {file.name} <span style={{ opacity: 0.8 }}>Uploading...</span>
                                </div>
                              )
                            ))}
                          </div>
                        )}
                        {(() => {
                          const sections = parseAssistantResponse(message.content, !message.isTyping)
                          const sources = message.metadata?.sources
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                              {sections.map((section, sectionIndex) => (
                                <Fragment key={`section-${sectionIndex}`}>
                                  <div className="assistant-section">
                                    {section.heading && (
                                      <p className="assistant-heading whitespace-pre-wrap">
                                        {renderMessageContent(section.heading, sources)}
                                      </p>
                                    )}
                                    {(() => {
                                      const elements: JSX.Element[] = []
                                      let listBuffer: Array<{ line: ParsedLine; lineIndex: number }> = []

                                      const flushList = () => {
                                        if (!listBuffer.length) return
                                        const first = listBuffer[0]
                                        elements.push(
                                          <ul key={`section-${sectionIndex}-list-${first.lineIndex}`} className="assistant-list">
                                            {listBuffer.map(({ line, lineIndex }) => (
                                              <li key={`section-${sectionIndex}-li-${lineIndex}`} className="assistant-list-item whitespace-pre-wrap">
                                                {renderMessageContent(line.text, sources)}
                                              </li>
                                            ))}
                                          </ul>
                                        )
                                        listBuffer = []
                                      }

                                      section.lines.forEach((line, lineIndex) => {
                                        if (!line.text.trim()) return
                                        if (line.kind === 'bullet') {
                                          listBuffer.push({ line, lineIndex })
                                          return
                                        }

                                        flushList()
                                        if (line.kind === 'divider') {
                                          elements.push(
                                            <div key={`section-${sectionIndex}-div-${lineIndex}`} aria-hidden="true" className="assistant-divider" />
                                          )
                                        } else if (line.kind === 'summary') {
                                          elements.push(
                                            <p key={`section-${sectionIndex}-sum-${lineIndex}`} className="assistant-summary whitespace-pre-wrap">
                                              {renderMessageContent(line.text, sources)}
                                            </p>
                                          )
                                        } else if (line.kind === 'subheading') {
                                          elements.push(
                                            <p key={`section-${sectionIndex}-sh-${lineIndex}`} className="assistant-subheading whitespace-pre-wrap">
                                              {renderMessageContent(line.text, sources)}
                                            </p>
                                          )
                                        } else {
                                          elements.push(
                                            <p key={`section-${sectionIndex}-p-${lineIndex}`} className="assistant-paragraph whitespace-pre-wrap">
                                              {renderMessageContent(line.text, sources)}
                                            </p>
                                          )
                                        }
                                      })

                                      flushList()
                                      return elements
                                    })()}
                                  </div>
                                </Fragment>
                              ))}
                              {Array.isArray(sources) && sources.length > 0 && (
                                <div
                                  style={{
                                    marginTop: '4px',
                                    padding: '10px 12px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    background: 'rgba(15,23,42,0.35)',
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                    alignItems: 'center'
                                  }}
                                >
                                  <span style={{ fontSize: '12px', color: 'rgba(226,232,240,0.8)', fontWeight: 600 }}>
                                    Sources
                                  </span>
                                  {sources.map((source) => (
                                    <a
                                      key={`source-${source.number}-${source.url}`}
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 8px',
                                        borderRadius: '999px',
                                        background: 'rgba(59,130,246,0.18)',
                                        color: '#bfdbfe',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        textDecoration: 'none',
                                        border: '1px solid rgba(59,130,246,0.35)'
                                      }}
                                      title={source.title}
                                    >
                                      [{source.number}]
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}

                  </div>
                  {/* Show feedback/copy/regenerate buttons only under assistant (bot) messages */}
                  {!isUser && message.content && (
                    <div className="user-copy-button" style={{ display: 'flex', gap: '10px', marginTop: '8px', alignItems: 'center', justifyContent: 'flex-start', marginLeft: '12px' }}>
                      {/* Copy button */}
                      <button
                        onClick={() => handleCopy(formatAssistantResponse(message.content))}
                        className="assistant-action-button"
                        style={{
                          background: 'transparent',
                          border: '1.2px solid rgba(255,255,255,0.3)',
                          color: 'rgba(255,255,255,0.8)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Copy"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      </button>

                      {/* Regenerate button */}
                      <button
                        onClick={() => handleRegenerate(index)}
                        className="assistant-action-button"
                        style={{
                          background: 'transparent',
                          border: '1.2px solid rgba(255,255,255,0.3)',
                          color: 'rgba(255,255,255,0.8)',
                          cursor: 'pointer',
                          fontSize: '16px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Regenerate"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10"></polyline>
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                        </svg>
                      </button>

                      {/* Like button */}
                      <button
                        onClick={() => handleFeedback(index, 'like', message.content)}
                        className="assistant-action-button"
                        style={{
                          background: 'transparent',
                          border: feedbackState[index] === 'like' ? '1.2px solid #22c55e' : '1.2px solid rgba(255,255,255,0.3)',
                          color: feedbackState[index] === 'like' ? '#22c55e' : 'rgba(255,255,255,0.8)',
                          cursor: 'pointer',
                          fontSize: '16px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Like"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                        </svg>
                      </button>

                      {/* Dislike button */}
                      <button
                        onClick={() => handleFeedback(index, 'dislike', message.content)}
                        className="assistant-action-button"
                        style={{
                          background: 'transparent',
                          border: feedbackState[index] === 'dislike' ? '1.2px solid #ef4444' : '1.2px solid rgba(255,255,255,0.3)',
                          color: feedbackState[index] === 'dislike' ? '#ef4444' : 'rgba(255,255,255,0.8)',
                          cursor: 'pointer',
                          fontSize: '16px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Dislike"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                        </svg>
                      </button>

                      {/* Report button */}
                      <button
                        onClick={() => handleFeedback(index, 'report', message.content)}
                        className="assistant-action-button"
                        style={{
                          background: 'transparent',
                          border: '1.2px solid rgba(255,255,255,0.3)',
                          color: 'rgba(255,255,255,0.8)',
                          cursor: 'pointer',
                          fontSize: '16px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Report"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                          <line x1="4" y1="22" x2="4" y2="15"></line>
                        </svg>
                      </button>
                    </div>
                  )}
                  
                  {!isUser && isDraftPromptVisible && draftKey && (
                    <div
                      style={{
                        marginTop: '14px',
                        width: '100%',
                        maxWidth: '700px',
                        background: 'rgba(15,23,42,0.65)',
                        border: '1px solid rgba(148,163,184,0.3)',
                        borderRadius: '18px',
                        padding: '18px',
                        color: '#e2e8f0',
                        boxShadow: '0 8px 24px rgba(15,15,35,0.25)'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: 'rgba(139,92,246,0.18)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px'
                          }}
                        >
                          📝
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontFamily: 'Google Sans, sans-serif', fontSize: '16px', fontWeight: 500, margin: 0 }}>
                            Save this draft to MyFiles
                          </p>
                          <p style={{ fontSize: '16px', color: '#cbd5f5', marginTop: '4px', marginBottom: '8px' }}>
                            Keep this document in your case files so you can edit, export, or print it later.
                          </p>
                        </div>
                      </div>
                      {draftError && (
                        <p style={{ color: '#f87171', fontSize: '13px', marginTop: '12px' }}>{draftError}</p>
                      )}
                      {!supabaseUser && draftState !== 'saved' && (
                        <p style={{ color: '#fbbf24', fontSize: '13px', marginTop: '12px' }}>
                          Sign in to keep drafts synced across your devices.
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '14px' }}>
                        <button
                          type="button"
                          onClick={() => handleDraftSave(draftKey, message.content, message.metadata?.activeCaseId as string | undefined)}
                          disabled={isDraftSaving || isDraftSaved}
                          style={{
                            padding: '10px 18px',
                            borderRadius: '999px',
                            border: 'none',
                            background: isDraftSaved ? '#22c55e' : '#8b5cf6',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: isDraftSaving || isDraftSaved ? 'default' : 'pointer',
                            opacity: isDraftSaving ? 0.8 : 1,
                            transition: 'all 0.2s'
                          }}
                        >
                          {isDraftSaved ? 'Saved to MyFiles' : isDraftSaving ? 'Saving…' : 'Save draft to MyFiles'}
                        </button>
                        {!isDraftSaved && (
                          <button
                            type="button"
                            onClick={() => setDraftPromptStates(prev => ({ ...prev, [draftKey]: { status: 'dismissed' } }))}
                            style={{
                              padding: '10px 16px',
                              borderRadius: '999px',
                              border: '1px solid rgba(148,163,184,0.5)',
                              background: 'transparent',
                              color: '#e2e8f0',
                              fontWeight: 500,
                              cursor: 'pointer'
                            }}
                          >
                            Not now
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {loading && (
              <div style={{ margin: '10px 0 6px', display: 'flex', justifyContent: 'flex-start', marginLeft: '8px' }}>
                <TypingIndicator label={(loadingLabel || 'Working').replace(/\.+$/, '')} compact />
              </div>
            )}

            {!autoScroll && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                <button
                  type="button"
                  onClick={() => {
                    scrollToBottom('smooth')
                    setAutoScroll(true)
                    isNearBottomRef.current = true
                  }}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '999px',
                    border: '1px solid rgba(255,255,255,0.4)',
                    background: 'rgba(255,255,255,0.12)',
                    color: '#ffffff',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Jump to latest messages
                </button>
              </div>
            )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0px', position: 'relative', alignItems: 'center' }}>
          {showGuestSignupModal && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 70,
                background: 'linear-gradient(120deg, rgba(15,3,20,0.86), rgba(46,7,55,0.88))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px'
              }}
              onClick={() => setShowGuestSignupModal(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  maxWidth: '520px',
                  background: 'rgba(20, 6, 26, 0.98)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '16px',
                  padding: '28px',
                  color: '#fff',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                }}
              >
                <div style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '10px' }}>
                  Sign up to attach documents
                </div>
                <div style={{ opacity: 0.85, lineHeight: 1.6, marginBottom: '20px' }}>
                  File uploads are available to registered users. Create a free account to upload documents and keep them with your case.
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setShowGuestSignupModal(false)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.18)',
                      background: 'transparent',
                      color: '#fff',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Maybe later
                  </button>
                  <Link
                    href="/auth/signin"
                    style={{
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.18)',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      fontWeight: 700,
                      textDecoration: 'none'
                    }}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/auth/signup"
                    style={{
                      padding: '10px 16px',
                      borderRadius: '10px',
                      background: '#8b5cf6',
                      color: '#fff',
                      fontWeight: 700,
                      textDecoration: 'none'
                    }}
                  >
                    Create free account
                  </Link>
                </div>
              </div>
            </div>
          )}
          {showLimitModal && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 60,
                background: 'linear-gradient(120deg, rgba(15,3,20,0.86), rgba(46,7,55,0.88))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px'
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: '700px',
                  borderRadius: '28px',
                  padding: '36px',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(255,255,255,0.9))',
                  boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
                  border: '1px solid rgba(255,255,255,0.6)',
                  color: '#1a1a1a'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <div
                    style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '16px',
                      background: '#4a4a4a',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px'
                    }}
                  >
                    ⚡
                  </div>
                  <div>
                    <p style={{ fontSize: '21px', fontWeight: 700, margin: 0 }}>Message limit reached</p>
                    <p style={{ fontSize: '17px', margin: 0, color: '#6b7280' }}>
                      Free plan 24-hour limit reached
                    </p>
                  </div>
                </div>
                <p style={{ fontFamily: 'Google Sans, sans-serif', fontSize: '17px', fontWeight: 500, lineHeight: 1.7, margin: '10px 0 20px' }}>
                  You&apos;ve used {FREEMIUM_MESSAGE_LIMIT} messages in the last 24 hours. The limit resets on a rolling basis. Upgrade to continue,
                  or start a new case to keep working.
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowLimitModal(false)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '999px',
                      border: '1px solid rgba(0,0,0,0.1)',
                      background: '#f3f4f6',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Close
                  </button>
                  <a
                    href="/pricing"
                    style={{
                      padding: '10px 18px',
                      borderRadius: '999px',
                      background: '#4a4a4a',
                      color: '#fff',
                      fontWeight: 700,
                      textDecoration: 'none'
                    }}
                  >
                    Upgrade
                  </a>
                </div>
              </div>
            </div>
          )}
          <div
            style={{
              position: 'fixed',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  width: '100%',
                  padding: '0 24px 12px 24px',
                  pointerEvents: 'auto',
                  zIndex: 50,
                  background: 'transparent',
            }}
          >
            <div style={{ width: '100%', maxWidth: '760px', margin: '0 auto', position: 'relative', pointerEvents: 'auto', display: 'flex', justifyContent: 'center' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0', width: '100%', alignItems: 'center' }}>
              {isNearLimit && (
                <div
                  style={{
                    marginBottom: '10px',
                    padding: '10px 16px',
                    borderRadius: '999px',
                    background: 'rgba(250, 204, 21, 0.15)',
                    border: '1px solid rgba(250, 204, 21, 0.45)',
                    color: '#fbbf24',
                    fontSize: '13px',
                    fontWeight: 600,
                    textAlign: 'center'
                  }}
                >
                  {remainingMessages} messages left in your 24-hour window.
                </div>
              )}
              {/* Chatbar container with rounded corners and padding */}
              <div
                style={{
                  width: '100%',
                  maxWidth: '700px',
                  margin: '0 auto',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #2a0726 0%, #4b1b4f 60%, rgba(43,11,42,0.95) 100%)',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  border: '1px solid rgba(236,72,153,0.18)',
                  boxShadow: '0 10px 30px rgba(25,6,30,0.6), inset 0 1px 0 rgba(255,255,255,0.02)',
                  padding: '12px 16px',
                  transition: 'background 0.25s, box-shadow 0.25s, transform 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  overflow: 'hidden'
                }}
              >
                {/* Attached files preview */}
                {attachedFiles.length > 0 && (
                  <div style={{ marginBottom: '12px', width: '100%' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-start' }}>
                      {attachedFiles.map((file, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 12px',
                            background: '#ffffff',
                            border: '1px solid rgba(255,255,255,0.85)',
                            boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#1a1a1a'
                          }}
                        >
                          <span>📎 {file.name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(index)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '16px',
                              color: '#ef4444',
                              padding: '0',
                              lineHeight: 1
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {guestUploadWarning && (
                  <p style={{ color: '#dc2626', fontSize: '13px', margin: '0 0 12px' }}>
                    {guestUploadWarning}
                  </p>
                )}
                {/* Textarea with auto-expand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px', paddingTop: '0px', width: '100%', justifyContent: 'flex-start' }}>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      const text = e.target.value
                      const words = text.trim().split(/\s+/).filter(word => word.length > 0)
                      const count = words.length
                      if (count > 600) {
                        const truncated = words.slice(0, 600).join(' ')
                        setInput(truncated)
                        setShowWordLimitWarning(true)
                        return
                      }
                      setShowWordLimitWarning(false)
                      setInput(text)
                      
                      // Auto-expand textarea
                      if (textareaRef.current) {
                        textareaRef.current.style.height = 'auto'
                        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
                      }
                    }}
                    onKeyDown={(e) => {
                      const canSubmit = input.trim().length > 0 || attachedFiles.length > 0
                      if (e.key === 'Enter' && !e.shiftKey && !loading && canSubmit && !isGuestLimitReached) {
                        e.preventDefault()
                        handleSubmit()
                      }
                    }}
                    placeholder="Talk about your issue, ask for explanations, or request procedural guidance..."
                    disabled={loading || isGuestLimitReached}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: 'transparent',
                      fontFamily: 'Google Sans, sans-serif',
                      fontSize: '16px',
                      fontWeight: 500,
                      color: '#F3F1FA',
                      outline: 'none',
                      resize: 'none',
                      overflow: 'auto',
                      minHeight: '40px',
                      maxHeight: '200px',
                      lineHeight: '1.3',
                      padding: '4px 0',
                      verticalAlign: 'top'
                    }}
                    className="custom-placeholder auto-expand-textarea"
                  />
                  <style jsx>{`
                    .custom-placeholder::placeholder {
                      color: #A39BC6;
                      opacity: 1;
                      font-size: 16px;
                    }
                    .auto-expand-textarea {
                      overflow-y: auto !important;
                      scrollbar-width: none; /* Firefox */
                      -ms-overflow-style: none; /* IE 10+ */
                    }
                    .auto-expand-textarea::-webkit-scrollbar {
                      display: none; /* Chrome, Safari, Opera */
                    }
                  `}</style>
                </div>

                {/* Divider removed to blend chatbar with page */}

                {/* Chatbar buttons row with attach button absolutely positioned bottom left */}
                <div style={{ position: 'relative', width: '100%' }}>
                  {/* Attach button absolutely positioned bottom left */}
                  {/* Attach button moved to the right-side controls (renders next to Send) */}
                  {/* Other buttons row, right aligned */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'flex-end', flex: 1 }}>
                    {/* File input + attach button (left of send) */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={handleAttachClick}
                      aria-label="Add attachment"
                      className="attach-btn"
                      style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: '#3b1f44',
                          color: '#F3F1FA',
                          border: '1px solid rgba(236,72,153,0.12)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          cursor: supabaseUser ? 'pointer' : 'not-allowed',
                          flexShrink: 0,
                          lineHeight: 0,
                          transition: 'all 0.2s ease',
                          opacity: supabaseUser ? 1 : 0.5
                        }}
                      disabled={!supabaseUser}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                          stroke="#F3F1FA"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <style jsx>{`
                      .attach-btn:hover {
                        background: #5b2f6b;
                        border-color: rgba(236,72,153,0.22);
                        box-shadow: 0 2px 8px rgba(92,40,110,0.22);
                        color: #fff;
                      }
                    `}</style>

                    {loading ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (typingIntervalRef.current) {
                            clearInterval(typingIntervalRef.current)
                            typingIntervalRef.current = null
                          }
                          // Mark the last message as no longer typing
                          setMessages(prev => {
                            const updated = [...prev]
                            const lastIndex = updated.length - 1
                            if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
                              updated[lastIndex] = {
                                ...updated[lastIndex],
                                isTyping: false
                              }
                            }
                            return updated
                          })
                          setLoading(false)
                          setLoadingLabel(null)
                        }}
                        aria-label="Stop generation"
                        style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: '#8b5a8c',
                            color: '#F3F1FA',
                            border: '1px solid rgba(236,72,153,0.18)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                            cursor: 'pointer',
                            flexShrink: 0,
                            lineHeight: 0,
                            transition: 'all 0.2s ease'
                          }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <rect x="6" y="6" width="12" height="12" rx="2" fill="#F3F1FA" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="submit"
                        aria-label="Send message"
                        disabled={!(input.trim().length > 0 || attachedFiles.length > 0) || isGuestLimitReached}
                          style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: '#6b3a84',
                          color: '#F3F1FA',
                          border: '1px solid rgba(236,72,153,0.18)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          cursor: (input.trim().length > 0 || attachedFiles.length > 0) && !isGuestLimitReached ? 'pointer' : 'not-allowed',
                          flexShrink: 0,
                          lineHeight: 0,
                          transition: 'all 0.2s ease',
                          opacity: (input.trim().length > 0 || attachedFiles.length > 0) && !isGuestLimitReached ? 1 : 0.5
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M4 12h16m-7-7l7 7-7 7"
                            stroke="#F3F1FA"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div
                style={{
                  width: '100%',
                  maxWidth: '700px',
                  margin: '10px auto 0',
                  textAlign: 'center',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.78)',
                  lineHeight: 1.4,
                }}
              >
                Informational support only — MyMcKenzie Assistant is not a substitute for legal advice.
              </div>

              {/* Word limit warning */}
              {showWordLimitWarning && (
                <div style={{ textAlign: 'center', marginTop: '12px' }}>
                  <p style={{ 
                    fontSize: '16px', 
                    color: '#ff4444',
                    fontWeight: '600',
                    margin: 0
                  }}>
                    ⚠️ You have reached the word limit (600 words maximum)
                  </p>
                </div>
              )}
            </div>
          </div>



          <div style={{ height: '2px' }} />
        </div>
        </form>

        {/* Report Modal */}
        {showReportModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}>
            <div style={{
              background: '#1a1a1a',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px', color: '#ffffff' }}>
                Report Issue
              </h2>
              <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)', marginBottom: '24px' }}>
                Help us improve by describing the issue with this response
              </p>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#ffffff' }}>
                  What&apos;s the issue? *
                </label>
                <input
                  type="text"
                  value={reportIssue}
                  onChange={(e) => setReportIssue(e.target.value)}
                  placeholder="e.g., Incorrect information, Unhelpful response..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '16px',
                    background: 'rgba(255,255,255,0.9)',
                    color: '#1a1a1a',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#ffffff' }}>
                  Describe the problem *
                </label>
                <textarea
                  value={reportProblem}
                  onChange={(e) => setReportProblem(e.target.value)}
                  placeholder="Please provide details about what went wrong..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '16px',
                    background: 'rgba(255,255,255,0.9)',
                    color: '#1a1a1a',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowReportModal(false)
                    setReportIssue('')
                    setReportProblem('')
                    setReportingMessageIndex(null)
                    setReportingMessageContent('')
                  }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: '2px solid rgba(255,255,255,0.5)',
                    background: 'transparent',
                    color: '#ffffff',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitReport}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#ffffff',
                    color: '#1a1a1a',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Submit Report
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  );
}
