"use client"

import { Fragment } from 'react'
import type { MutableRefObject } from 'react'
import type { Message, ParsedLine, ParsedSection, SourceReference } from '@/components/chatbot/chat-types'

type TypingIndicatorComponentType = (props: { label?: string; compact?: boolean }) => JSX.Element

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
  TypingIndicatorComponent: TypingIndicatorComponentType
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
  TypingIndicatorComponent
}: ChatMessageListProps) {
  const messageSideInsetPx = 26
  const assistantReadableWidth = `min(calc(100% - ${messageSideInsetPx * 2}px), 72ch)`

  const stripLegacyReferenceIndex = (text: string) =>
    (text || '')
      .replace(/^\s*Reference\s+index:\s*[^\n]*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

  return (
    <>
      {messages.map((message, index) => {
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
            `}</style>
            <div
              style={{
                padding: isUser ? '6px 14px 6px 10px' : '0',
                borderRadius: isUser ? '12px' : '0',
                maxWidth: isUser ? 'min(60%, 420px)' : assistantReadableWidth,
                width: isUser ? 'fit-content' : assistantReadableWidth,
                boxSizing: 'border-box',
                lineHeight: 1.65,
                fontFamily: 'inherit',
                fontSize: '16px',
                fontWeight: 500,
                background: isUser ? `rgba(168, 85, 247, 0.08)` : 'transparent',
                color: isUser ? '#ffffff' : 'inherit',
                border: isUser ? '1px solid rgba(168, 85, 247, 0.15)' : 'none',
                boxShadow: 'none',
                backdropFilter: isUser ? 'blur(4px)' : 'none',
                overflow: isUser ? 'hidden' : 'visible',
                textShadow: 'none',
                transform: isUser ? 'translateZ(0)' : 'none',
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                marginLeft: isUser ? '0' : `${messageSideInsetPx}px`,
                marginRight: isUser ? `${messageSideInsetPx}px` : '0'
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
                    {renderMessageContent(assistantDisplayContent)}
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
                    const sections = parseAssistantResponse(assistantDisplayContent, !message.isTyping)
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {sections.map((section, sectionIndex) => (
                          <Fragment key={`section-${sectionIndex}`}>
                            <div className="assistant-section">
                              {section.heading && (
                                <p className="assistant-heading whitespace-pre-wrap">
                                  {renderAssistantText(section.heading)}
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
                                          {renderAssistantText(line.text)}
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

                                flushList()
                                return elements
                              })()}
                            </div>
                          </Fragment>
                        ))}
                      </div>
                    )
                  })()}
                  {visibleSources.length > 0 && (
                    <div
                      style={{
                        display: 'inline-flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '6px',
                        marginTop: '4px',
                        marginLeft: '0'
                      }}
                    >
                      <span style={{ fontSize: '16px', color: 'rgba(226,232,240,0.9)', fontWeight: 600, marginLeft: '0', lineHeight: 1.4 }}>
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
                            border: '1px solid rgba(239, 68, 68, 0.2)'
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
              <>
                <div className="user-copy-button" style={{ display: 'flex', gap: '10px', marginTop: '8px', alignItems: 'center', justifyContent: 'flex-start', marginLeft: '12px', flexWrap: 'wrap' }}>
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
                    gap: '4px'
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
                    gap: '4px'
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
                    gap: '4px'
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
                    gap: '4px'
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
              </>
            )}
          </div>
        )
      })}

      {loading && (
        <div style={{ margin: '10px 0 6px', display: 'flex', justifyContent: 'flex-start', marginLeft: '8px' }}>
          <TypingIndicatorComponent label={(loadingLabel || 'Working').replace(/\.+$/, '')} compact />
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  )
}
