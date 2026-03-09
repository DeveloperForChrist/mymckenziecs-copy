"use client"

import { Fragment, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MutableRefObject, RefObject } from 'react'
import type { Message, ParsedLine, ParsedSection, SourceReference } from '@/components/chatbot/chat-types'

type StatusIndicatorComponentType = (props: { label?: string; compact?: boolean }) => JSX.Element

type ChatMessageListProps = {
  messages: Message[]
  feedbackState: { [key: number]: 'like' | 'dislike' | null }
  parseAssistantResponse: (text: string, allowHeadings?: boolean) => ParsedSection[]
  renderMessageContent: (content: string, sources?: SourceReference[]) => (string | JSX.Element)[]
  onCopyMessage: (content: string) => void
  formatAssistantResponse: (text: string) => string
  onRegenerate: (index: number) => void
  onFeedback: (index: number, type: 'like' | 'dislike' | 'report', content: string) => void
  loading: boolean
  loadingLabel: string | null
  messagesEndRef: MutableRefObject<HTMLDivElement | null>
  StatusIndicatorComponent: StatusIndicatorComponentType
  scrollContainerRef?: RefObject<HTMLDivElement | null>
}

type VirtualRow = {
  index: number
  key: string
  top: number
  height: number
}

type VirtualWindow = {
  items: VirtualRow[]
  totalHeight: number
}

const MESSAGE_ROW_GAP = 20
const VIRTUALIZATION_MIN_MESSAGES = 80
const VIRTUALIZATION_OVERSCAN_PX = 1200

const messageStyles = `
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
    font-family: inherit;
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
    font-family: inherit;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.6;
    margin: 6px 0 4px 0;
    color: #f1f5f9;
    text-transform: uppercase;
    text-decoration: underline;
    text-decoration-thickness: 1.5px;
    text-underline-offset: 4px;
  }
  .message-container .assistant-summary {
    font-family: inherit;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.65;
    margin: 10px 0 4px 0;
    color: #f8fafc;
  }
  .message-container .assistant-paragraph {
    font-family: inherit;
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
  .message-container .assistant-list-ordered {
    list-style-type: decimal;
    padding-left: 22px;
  }
  .message-container .assistant-list-item {
    font-family: inherit;
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
`

const stripLegacyReferenceIndex = (text: string) =>
  (text || '')
    .replace(/^\s*Reference\s+index:\s*[^\n]*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const getMessageRenderKey = (message: Message, index: number) => {
  if (typeof message.id === 'string' && message.id.trim()) {
    return `id:${message.id}`
  }

  return `fallback:${message.role}:${message.timestamp.toISOString()}:${index}`
}

const estimateMessageHeight = (message: Message) => {
  const content = stripLegacyReferenceIndex(message.content || '')
  const attachments = Array.isArray(message.attachments) ? message.attachments.length : 0
  const sources = Array.isArray(message.metadata?.sources) ? message.metadata.sources.length : 0
  const baseHeight = message.role === 'user' ? 92 : 156
  const perLineHeight = message.role === 'user' ? 20 : 22
  const estimatedLines = Math.max(1, Math.ceil(content.length / (message.role === 'user' ? 54 : 68)))
  const attachmentHeight = attachments * 34
  const sourceHeight = message.role === 'assistant' && !message.isTyping && sources > 0 ? 34 : 0
  return baseHeight + estimatedLines * perLineHeight + attachmentHeight + sourceHeight + MESSAGE_ROW_GAP
}

export const calculateVirtualMessageWindow = ({
  messages,
  measuredHeights,
  scrollTop,
  viewportHeight,
}: {
  messages: Message[]
  measuredHeights: Map<string, number>
  scrollTop: number
  viewportHeight: number
}): VirtualWindow => {
  const rows: VirtualRow[] = []
  let top = 0

  messages.forEach((message, index) => {
    const key = getMessageRenderKey(message, index)
    const height = measuredHeights.get(key) ?? estimateMessageHeight(message)
    rows.push({ index, key, top, height })
    top += height
  })

  if (rows.length === 0) {
    return { items: [], totalHeight: 0 }
  }

  const viewportTop = Math.max(0, scrollTop - VIRTUALIZATION_OVERSCAN_PX)
  const viewportBottom = Math.max(viewportTop + viewportHeight + VIRTUALIZATION_OVERSCAN_PX, viewportHeight)

  let startIndex = 0
  while (
    startIndex < rows.length - 1 &&
    rows[startIndex].top + rows[startIndex].height < viewportTop
  ) {
    startIndex += 1
  }

  let endIndex = startIndex
  while (
    endIndex < rows.length - 1 &&
    rows[endIndex].top < viewportBottom
  ) {
    endIndex += 1
  }

  return {
    items: rows.slice(startIndex, endIndex + 1),
    totalHeight: top,
  }
}

type ChatMessageRowProps = Omit<ChatMessageListProps, 'messages' | 'loading' | 'loadingLabel' | 'messagesEndRef' | 'StatusIndicatorComponent' | 'scrollContainerRef'> & {
  message: Message
  index: number
  style?: CSSProperties
  onMeasured?: (height: number) => void
  StatusIndicatorComponent: StatusIndicatorComponentType
}

function ChatMessageRow({
  message,
  index,
  feedbackState,
  parseAssistantResponse,
  renderMessageContent,
  onCopyMessage,
  formatAssistantResponse,
  onRegenerate,
  onFeedback,
  style,
  onMeasured,
  StatusIndicatorComponent,
}: ChatMessageRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const messageSideInsetPx = 0
  const messageBubbleMaxWidth = `calc(100% - ${messageSideInsetPx * 2}px)`
  const userMessageMaxWidth = `calc((${messageBubbleMaxWidth} / 2) + 40px)`
  const assistantMaxWidth = `min(${messageBubbleMaxWidth}, 650px)`
  const isAlert = message.content?.trim().startsWith('⚠️')
  const isUser = message.role === 'user'
  const assistantDisplayContent = !isUser
    ? stripLegacyReferenceIndex(message.content || '')
    : message.content
  const messageSources = Array.isArray(message.metadata?.sources)
    ? message.metadata.sources
    : []
  const visibleSources = message.isTyping ? [] : messageSources
  const renderAssistantText = (text: string) =>
    message.isTyping ? [text] : renderMessageContent(text, visibleSources)
  const inlineStreamStatusLabel = !isUser && message.isTyping && !assistantDisplayContent.trim()
    ? String(message.streamStatusLabel || '').trim()
    : ''
  const assistantSections = !isUser && assistantDisplayContent.trim()
    ? (
        !message.isTyping &&
        message.metadata?.presentation?.version === 1 &&
        Array.isArray(message.metadata.presentation.sections)
          ? message.metadata.presentation.sections
          : parseAssistantResponse(assistantDisplayContent, true)
      )
    : []

  useLayoutEffect(() => {
    if (!onMeasured || !rowRef.current) return

    const measure = () => {
      const nextHeight = Math.ceil(rowRef.current?.getBoundingClientRect().height || 0)
      if (nextHeight > 0) {
        onMeasured(nextHeight)
      }
    }

    measure()

    if (typeof ResizeObserver !== 'undefined' && rowRef.current) {
      const observer = new ResizeObserver(() => measure())
      observer.observe(rowRef.current)
      return () => observer.disconnect()
    }
  }, [assistantDisplayContent, message.attachments, message.isTyping, message.metadata, onMeasured, visibleSources.length])

  return (
    <div
      ref={rowRef}
      className="message-container"
      style={{
        display: 'flex',
        width: '100%',
        boxSizing: 'border-box',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        paddingBottom: `${MESSAGE_ROW_GAP}px`,
        ...style,
      }}
    >
      {isAlert ? (
        <div style={{ textAlign: 'center' }}>
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
      ) : (
        <>
          <div
            style={{
              padding: isUser ? '6px 14px 6px 10px' : '0',
              borderRadius: isUser ? '12px' : '0',
              maxWidth: isUser ? userMessageMaxWidth : assistantMaxWidth,
              width: isUser ? 'fit-content' : assistantMaxWidth,
              boxSizing: 'border-box',
              lineHeight: 1.65,
              fontFamily: 'inherit',
              fontSize: '16px',
              fontWeight: 500,
              background: isUser ? 'rgba(168, 85, 247, 0.08)' : 'transparent',
              color: isUser ? '#ffffff' : 'inherit',
              border: isUser ? '1px solid rgba(168, 85, 247, 0.15)' : 'none',
              boxShadow: 'none',
              backdropFilter: isUser ? 'blur(4px)' : 'none',
              overflow: isUser ? 'hidden' : 'visible',
              textShadow: 'none',
              transform: isUser ? 'translateZ(0)' : 'none',
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              marginLeft: isUser ? undefined : `${messageSideInsetPx}px`,
              marginRight: isUser ? `${messageSideInsetPx}px` : undefined,
            }}
            className={isUser ? 'user-message-bubble' : ''}
          >
            {isUser ? (
              <>
                {message.attachments && message.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                    {message.attachments.map((file, attachmentIndex) => (
                      file.downloadURL ? (
                        <a
                          key={`${file.storagePath || file.name}-${attachmentIndex}`}
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
                            border: '1px solid rgba(255,255,255,0.18)',
                          }}
                        >
                          📎 {file.name}
                        </a>
                      ) : (
                        <div
                          key={`${file.storagePath || file.name}-${attachmentIndex}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 10px',
                            borderRadius: '999px',
                            background: 'rgba(255,255,255,0.08)',
                            color: '#e2e8f0',
                            fontSize: '13px',
                            border: '1px dashed rgba(255,255,255,0.2)',
                          }}
                        >
                          📎 {file.name} <span style={{ opacity: 0.8 }}>Uploading...</span>
                        </div>
                      )
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap assistant-paragraph">
                  {renderMessageContent(assistantDisplayContent)}
                </p>
              </>
            ) : (
              <div className="assistant-message">
                {message.attachments && message.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                    {message.attachments.map((file, attachmentIndex) => (
                      file.downloadURL ? (
                        <a
                          key={`${file.storagePath || file.name}-${attachmentIndex}`}
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
                            border: '1px solid rgba(255,255,255,0.18)',
                          }}
                        >
                          📎 {file.name}
                        </a>
                      ) : (
                        <div
                          key={`${file.storagePath || file.name}-${attachmentIndex}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 10px',
                            borderRadius: '999px',
                            background: 'rgba(255,255,255,0.08)',
                            color: '#e2e8f0',
                            fontSize: '13px',
                            border: '1px dashed rgba(255,255,255,0.2)',
                          }}
                        >
                          📎 {file.name} <span style={{ opacity: 0.8 }}>Uploading...</span>
                        </div>
                      )
                    ))}
                  </div>
                )}
                {inlineStreamStatusLabel ? (
                  <div style={{ padding: '2px 0 6px' }}>
                    <StatusIndicatorComponent
                      label={inlineStreamStatusLabel.replace(/\.+$/, '')}
                      compact
                    />
                  </div>
                ) : assistantSections.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {assistantSections.map((section, sectionIndex) => (
                      <Fragment key={`section-${sectionIndex}`}>
                        <div className="assistant-section">
                          {section.heading && (
                            <p className="assistant-heading whitespace-pre-wrap">
                              {renderAssistantText(section.heading)}
                            </p>
                          )}
                          {(() => {
                            const elements: JSX.Element[] = []
                            let bulletBuffer: Array<{ line: ParsedLine; lineIndex: number }> = []
                            let orderedBuffer: Array<{ line: ParsedLine; lineIndex: number }> = []

                            const flushBulletList = () => {
                              if (!bulletBuffer.length) return
                              const first = bulletBuffer[0]
                              elements.push(
                                <ul key={`section-${sectionIndex}-list-${first.lineIndex}`} className="assistant-list">
                                  {bulletBuffer.map(({ line, lineIndex }) => (
                                    <li key={`section-${sectionIndex}-li-${lineIndex}`} className="assistant-list-item whitespace-pre-wrap">
                                      {renderAssistantText(line.text)}
                                    </li>
                                  ))}
                                </ul>
                              )
                              bulletBuffer = []
                            }

                            const flushOrderedList = () => {
                              if (!orderedBuffer.length) return
                              const first = orderedBuffer[0]
                              elements.push(
                                <ol
                                  key={`section-${sectionIndex}-olist-${first.lineIndex}`}
                                  className="assistant-list assistant-list-ordered"
                                  start={typeof first.line.order === 'number' ? first.line.order : undefined}
                                >
                                  {orderedBuffer.map(({ line, lineIndex }) => (
                                    <li
                                      key={`section-${sectionIndex}-oli-${lineIndex}`}
                                      className="assistant-list-item whitespace-pre-wrap"
                                      value={typeof line.order === 'number' ? line.order : undefined}
                                    >
                                      {renderAssistantText(line.text)}
                                    </li>
                                  ))}
                                </ol>
                              )
                              orderedBuffer = []
                            }

                            const flushLists = () => {
                              flushBulletList()
                              flushOrderedList()
                            }

                            section.lines.forEach((line, lineIndex) => {
                              if (!line.text.trim()) return
                              if (line.kind === 'bullet') {
                                flushOrderedList()
                                bulletBuffer.push({ line, lineIndex })
                                return
                              }
                              if (line.kind === 'ordered') {
                                flushBulletList()
                                orderedBuffer.push({ line, lineIndex })
                                return
                              }

                              flushLists()
                              if (line.kind === 'divider') {
                                elements.push(
                                  <div key={`section-${sectionIndex}-div-${lineIndex}`} aria-hidden="true" className="assistant-divider" />
                                )
                              } else if (line.kind === 'summary') {
                                elements.push(
                                  <p key={`section-${sectionIndex}-sum-${lineIndex}`} className="assistant-summary whitespace-pre-wrap">
                                    {renderAssistantText(line.text)}
                                  </p>
                                )
                              } else if (line.kind === 'subheading') {
                                elements.push(
                                  <p key={`section-${sectionIndex}-sh-${lineIndex}`} className="assistant-subheading whitespace-pre-wrap">
                                    {renderAssistantText(line.text)}
                                  </p>
                                )
                              } else {
                                elements.push(
                                  <p key={`section-${sectionIndex}-p-${lineIndex}`} className="assistant-paragraph whitespace-pre-wrap">
                                    {renderAssistantText(line.text)}
                                  </p>
                                )
                              }
                            })

                            flushLists()
                            return elements
                          })()}
                        </div>
                      </Fragment>
                    ))}
                  </div>
                ) : assistantDisplayContent.trim() ? (
                  <p className="assistant-paragraph whitespace-pre-wrap">
                    {renderAssistantText(assistantDisplayContent)}
                  </p>
                ) : null}
                {visibleSources.length > 0 && (
                  <div
                    style={{
                      display: 'inline-flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '4px',
                    }}
                  >
                    <span style={{ fontSize: '16px', color: 'rgba(226,232,240,0.9)', fontWeight: 600, lineHeight: 1.4 }}>
                      Sources:
                    </span>
                    {visibleSources.map((source) => (
                      <a
                        key={`source-inline-${index}-${source.number}-${source.url}`}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 8px',
                          borderRadius: '999px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#fecaca',
                          fontSize: '12px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                        }}
                        title={source.title}
                      >
                        [{source.number}]
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {!isUser && message.content && (
            <div className="user-copy-button" style={{ display: 'flex', gap: '10px', marginTop: '8px', alignItems: 'center', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              <button
                onClick={() => onCopyMessage(formatAssistantResponse(assistantDisplayContent))}
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
                  gap: '4px',
                }}
                title="Copy"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>

              <button
                onClick={() => onRegenerate(index)}
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
                  gap: '4px',
                }}
                title="Regenerate"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
              </button>

              <button
                onClick={() => onFeedback(index, 'like', message.content)}
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
                  gap: '4px',
                }}
                title="Like"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                </svg>
              </button>

              <button
                onClick={() => onFeedback(index, 'dislike', message.content)}
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
                  gap: '4px',
                }}
                title="Dislike"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                </svg>
              </button>

              <button
                onClick={() => onFeedback(index, 'report', message.content)}
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
                  gap: '4px',
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
        </>
      )}
    </div>
  )
}

export default function ChatMessageList({
  messages,
  feedbackState,
  parseAssistantResponse,
  renderMessageContent,
  onCopyMessage,
  formatAssistantResponse,
  onRegenerate,
  onFeedback,
  loading,
  loadingLabel,
  messagesEndRef,
  StatusIndicatorComponent,
  scrollContainerRef,
}: ChatMessageListProps) {
  const [scrollMetrics, setScrollMetrics] = useState({ top: 0, height: 0 })
  const [layoutVersion, setLayoutVersion] = useState(0)
  const measuredHeightsRef = useRef<Map<string, number>>(new Map())
  const refreshFrameRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (refreshFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(refreshFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const container = scrollContainerRef?.current
    if (!container) return

    const syncMetrics = () => {
      const nextTop = container.scrollTop
      const nextHeight = container.clientHeight
      startTransition(() => {
        setScrollMetrics((current) => (
          current.top === nextTop && current.height === nextHeight
            ? current
            : { top: nextTop, height: nextHeight }
        ))
      })
    }

    syncMetrics()
    const onScroll = () => syncMetrics()
    container.addEventListener('scroll', onScroll, { passive: true })

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => syncMetrics())
      observer.observe(container)
      return () => {
        container.removeEventListener('scroll', onScroll)
        observer.disconnect()
      }
    }

    const onResize = () => syncMetrics()
    window.addEventListener('resize', onResize)
    return () => {
      container.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [scrollContainerRef])

  const scheduleLayoutRefresh = () => {
    if (refreshFrameRef.current !== null || typeof window === 'undefined') {
      return
    }

    refreshFrameRef.current = window.requestAnimationFrame(() => {
      refreshFrameRef.current = null
      startTransition(() => {
        setLayoutVersion((current) => current + 1)
      })
    })
  }

  const handleMeasuredHeight = (key: string, height: number) => {
    const current = measuredHeightsRef.current.get(key)
    if (current && Math.abs(current - height) < 2) {
      return
    }

    measuredHeightsRef.current.set(key, height)
    scheduleLayoutRefresh()
  }

  const virtualizationEnabled =
    Boolean(scrollContainerRef?.current) &&
    messages.length >= VIRTUALIZATION_MIN_MESSAGES &&
    scrollMetrics.height > 0

  const virtualWindow = useMemo(
    () => calculateVirtualMessageWindow({
      messages,
      measuredHeights: measuredHeightsRef.current,
      scrollTop: scrollMetrics.top,
      viewportHeight: scrollMetrics.height,
    }),
    [layoutVersion, messages, scrollMetrics.height, scrollMetrics.top]
  )

  const rows = virtualizationEnabled
    ? virtualWindow.items
    : messages.map((message, index) => ({
        index,
        key: getMessageRenderKey(message, index),
        top: 0,
        height: measuredHeightsRef.current.get(getMessageRenderKey(message, index)) ?? estimateMessageHeight(message),
      }))

  return (
    <>
      <style>{messageStyles}</style>
      {virtualizationEnabled ? (
        <div style={{ position: 'relative', height: `${virtualWindow.totalHeight}px`, width: '100%' }}>
          {rows.map((row) => (
            <ChatMessageRow
              key={row.key}
              message={messages[row.index]}
              index={row.index}
              feedbackState={feedbackState}
              parseAssistantResponse={parseAssistantResponse}
              renderMessageContent={renderMessageContent}
              onCopyMessage={onCopyMessage}
              formatAssistantResponse={formatAssistantResponse}
                onRegenerate={onRegenerate}
                onFeedback={onFeedback}
                StatusIndicatorComponent={StatusIndicatorComponent}
                style={{
                  position: 'absolute',
                  top: `${row.top}px`,
                left: 0,
                right: 0,
              }}
              onMeasured={(height) => handleMeasuredHeight(row.key, height)}
            />
          ))}
        </div>
      ) : (
        <>
          {messages.map((message, index) => {
            const rowKey = getMessageRenderKey(message, index)
            return (
              <ChatMessageRow
                key={rowKey}
                message={message}
                index={index}
                feedbackState={feedbackState}
                parseAssistantResponse={parseAssistantResponse}
                renderMessageContent={renderMessageContent}
                onCopyMessage={onCopyMessage}
                formatAssistantResponse={formatAssistantResponse}
                onRegenerate={onRegenerate}
                onFeedback={onFeedback}
                StatusIndicatorComponent={StatusIndicatorComponent}
                onMeasured={virtualizationEnabled ? (height) => handleMeasuredHeight(rowKey, height) : undefined}
              />
            )
          })}
        </>
      )}

      {loading && (
        <div style={{ margin: '10px 0 6px', display: 'flex', justifyContent: 'flex-start', marginLeft: '8px' }}>
          <StatusIndicatorComponent label={(loadingLabel || 'Thinking').replace(/\.+$/, '')} compact />
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  )
}
