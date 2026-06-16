"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { FormEvent, KeyboardEvent, MutableRefObject, ChangeEvent } from 'react'
import { CHAT_ATTACHMENT_ACCEPT } from '@/lib/chat/attachments'

type ChatComposerProps = {
  onSubmit: (e?: FormEvent<HTMLFormElement>) => void
  showGuestSignupModal: boolean
  onCloseGuestSignupModal: () => void
  guestSignupReason?: 'upload' | 'limit'
  guestHomeHref?: string
  anonymousMessageLimit?: number | null
  attachedFiles: File[]
  onRemoveFile: (index: number) => void
  guestUploadWarning: string | null
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>
  input: string
  onInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
  onInputKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  loading: boolean
  fileInputRef: MutableRefObject<HTMLInputElement | null>
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
  onAttachClick: () => void
  hasSupabaseUser: boolean
  onStopGeneration: () => void
  canSubmit: boolean
  showWordLimitWarning: boolean
  isPlanLocked: boolean
  planLockMessage?: string
  dockToPane?: boolean
  paneWidth?: 'full' | 'standard'
}

export default function ChatComposer({
  onSubmit,
  showGuestSignupModal,
  onCloseGuestSignupModal,
  guestSignupReason = 'upload',
  guestHomeHref = '/uk',
  anonymousMessageLimit = null,
  attachedFiles,
  onRemoveFile,
  guestUploadWarning,
  textareaRef,
  input,
  onInputChange,
  onInputKeyDown,
  loading,
  fileInputRef,
  onFileChange,
  onAttachClick,
  hasSupabaseUser,
  onStopGeneration,
  canSubmit,
  showWordLimitWarning,
  isPlanLocked,
  planLockMessage,
  dockToPane = false,
  paneWidth = 'full',
}: ChatComposerProps) {
  const pathname = usePathname()
  const useFullPaneWidth = dockToPane && paneWidth === 'full'
  const controlButtonSize = 'clamp(28px, 1.15vw + 22px, 40px)'
  const controlIconSize = 'clamp(16px, 0.45vw + 14px, 22px)'
  const controlFontSize = 'clamp(12px, 0.2vw + 11px, 14px)'
  const composerShellMaxWidth = useFullPaneWidth ? '100%' : 'min(760px, 100%)'
  const composerPanelMaxWidth = useFullPaneWidth ? '100%' : 'min(760px, 100%)'
  const composerInlinePaddingEnd = useFullPaneWidth ? 'clamp(16px, 3vw, 36px)' : 'max(10px, env(safe-area-inset-right))'
  const composerInlinePaddingStart = useFullPaneWidth ? 'clamp(16px, 3vw, 36px)' : 'max(10px, env(safe-area-inset-left))'
  const signupTitle = guestSignupReason === 'limit'
    ? 'Create a free account to continue this chat'
    : 'Sign up to attach documents'
  const signupBody = guestSignupReason === 'limit'
    ? 'Create a free account and we will bring this conversation with you after sign-up.'
    : 'File uploads are available to registered Plus and Premium users. Create an account or sign in to upload documents and keep them with your chat.'
  const authRedirect = pathname === '/assistant' ? '/assistant/pricing' : (pathname || '/assistant')
  const signInHref = `/auth/signin?redirect=${encodeURIComponent(authRedirect)}`
  const signUpHref = `/auth/signup?redirect=${encodeURIComponent(authRedirect)}&signupSource=assistant`

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0px',
        position: 'relative',
        alignItems: 'center',
        width: '100%',
        flexShrink: 0,
        zIndex: 50,
      }}
    >
      {showGuestSignupModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            background: 'rgba(10, 8, 12, 0.86)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: 'clamp(88px, 22vh, 190px) clamp(16px, 5vw, 28px) clamp(28px, 8vh, 60px)'
          }}
          onClick={onCloseGuestSignupModal}
        >
          <button
            type="button"
            onClick={onCloseGuestSignupModal}
            aria-label="Close"
            style={{
              position: 'fixed',
              top: '18px',
              right: '22px',
              width: '34px',
              height: '34px',
              display: 'grid',
              placeItems: 'center',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.86)',
              cursor: 'pointer',
              fontSize: '20px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '360px',
              background: 'transparent',
              border: '0',
              borderRadius: '0',
              padding: '0',
              color: '#fff',
              boxShadow: 'none',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                fontSize: 'clamp(1.65rem, 5vw, 2.25rem)',
                fontWeight: 650,
                lineHeight: 1.12,
                marginBottom: '14px',
                letterSpacing: 0,
              }}
            >
              {signupTitle}
            </div>
            <div
              style={{
                opacity: 0.78,
                lineHeight: 1.55,
                margin: '0 auto 28px',
                fontSize: '0.95rem',
                maxWidth: '340px',
              }}
            >
              {signupBody}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              <Link
                href={signUpHref}
                style={{
                  minHeight: '44px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 16px',
                  borderRadius: '8px',
                  background: '#f3f0f4',
                  color: '#17131a',
                  fontWeight: 800,
                  textDecoration: 'none',
                  border: '1px solid rgba(255,255,255,0.18)',
                }}
              >
                Create account
              </Link>
              <Link
                href={signInHref}
                style={{
                  minHeight: '42px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#f8fafc',
                  fontWeight: 750,
                  textDecoration: 'none'
                }}
              >
                Sign in
              </Link>
              {guestSignupReason === 'limit' ? (
                <Link
                  href={guestHomeHref}
                  style={{
                    minHeight: '36px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 16px',
                    borderRadius: '8px',
                    border: '0',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.68)',
                    fontWeight: 650,
                    textDecoration: 'none'
                  }}
                >
                  Go home
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onCloseGuestSignupModal}
                  style={{
                    minHeight: '36px',
                    padding: '0 16px',
                    borderRadius: '8px',
                    border: '0',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.58)',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Maybe later
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <div
        style={{
          position: dockToPane ? 'relative' : 'fixed',
          left: dockToPane ? undefined : 0,
          right: dockToPane ? undefined : 0,
          bottom: dockToPane ? undefined : 0,
          width: '100%',
          padding: `0 ${composerInlinePaddingEnd} calc(10px + env(safe-area-inset-bottom)) ${composerInlinePaddingStart}`,
          pointerEvents: 'auto',
          zIndex: 50,
          background: dockToPane
            ? 'linear-gradient(180deg, rgba(39,4,39,0) 0%, rgba(39,4,39,0.84) 28%, #270427 100%)'
            : 'transparent',
        }}
      >
        <div style={{ width: '100%', maxWidth: composerShellMaxWidth, margin: '0 auto', position: 'relative', pointerEvents: 'auto', display: 'flex', justifyContent: 'center' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0', width: '100%', maxWidth: composerShellMaxWidth, alignItems: 'center' }}>
            <div
              style={{
                width: '100%',
                maxWidth: composerPanelMaxWidth,
                margin: '0 auto',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #2a0726 0%, #4b1b4f 60%, rgba(43,11,42,0.95) 100%)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                border: '1px solid rgba(236,72,153,0.18)',
                boxShadow: '0 10px 30px rgba(25,6,30,0.6), inset 0 1px 0 rgba(255,255,255,0.02)',
                padding: '10px 12px',
                transition: 'background 0.25s, box-shadow 0.25s, transform 0.15s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                overflow: 'hidden'
              }}
            >
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
                          onClick={() => onRemoveFile(index)}
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
              {isPlanLocked && (
                <div
                  style={{
                    width: '100%',
                    marginBottom: '10px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(251, 191, 36, 0.45)',
                    background: 'rgba(92, 53, 10, 0.35)',
                    color: '#fde68a',
                    fontSize: '13px',
                    lineHeight: 1.45,
                  }}
                >
                  {planLockMessage || 'Your plan is currently paused. Chat is locked until billing is resumed.'}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px', paddingTop: '0px', width: '100%', justifyContent: 'flex-start' }}>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={onInputChange}
                  onKeyDown={onInputKeyDown}
                  placeholder={
                    isPlanLocked
                      ? 'Chat is locked while your plan is paused. Resume your plan to continue.'
                      : 'Talk about your issue, ask for explanations, or request procedural guidance...'
                  }
                  disabled={loading || isPlanLocked}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
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
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                  }
                  .auto-expand-textarea::-webkit-scrollbar {
                    display: none;
                  }
                `}</style>
              </div>

              <div style={{ position: 'relative', width: '100%' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'flex-end', flex: 1 }}>
                  {!isPlanLocked && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={CHAT_ATTACHMENT_ACCEPT}
                        onChange={onFileChange}
                        style={{ display: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={onAttachClick}
                        aria-label="Add attachment"
                        className="attach-btn"
                        style={{
                          width: controlButtonSize,
                          height: controlButtonSize,
                          borderRadius: '50%',
                          background: '#3b1f44',
                          color: '#F3F1FA',
                          border: '1px solid rgba(236,72,153,0.12)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: controlFontSize,
                          cursor: hasSupabaseUser ? 'pointer' : 'not-allowed',
                          flexShrink: 0,
                          lineHeight: 0,
                          transition: 'all 0.2s ease',
                          opacity: hasSupabaseUser ? 1 : 0.5
                        }}
                        disabled={!hasSupabaseUser}
                      >
                        <svg width={controlIconSize} height={controlIconSize} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
                          onClick={onStopGeneration}
                          aria-label="Stop generation"
                          style={{
                            width: controlButtonSize,
                            height: controlButtonSize,
                            borderRadius: '50%',
                            background: '#8b5a8c',
                            color: '#F3F1FA',
                            border: '1px solid rgba(236,72,153,0.18)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: controlIconSize,
                            cursor: 'pointer',
                            flexShrink: 0,
                            lineHeight: 0,
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <svg width={controlIconSize} height={controlIconSize} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="6" y="6" width="12" height="12" rx="2" fill="#F3F1FA" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="submit"
                          aria-label="Send message"
                          disabled={!canSubmit}
                          style={{
                            width: controlButtonSize,
                            height: controlButtonSize,
                            borderRadius: '50%',
                            background: '#6b3a84',
                            color: '#F3F1FA',
                            border: '1px solid rgba(236,72,153,0.18)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: controlIconSize,
                            cursor: canSubmit ? 'pointer' : 'not-allowed',
                            flexShrink: 0,
                            lineHeight: 0,
                            transition: 'all 0.2s ease',
                            opacity: canSubmit ? 1 : 0.5
                          }}
                        >
                          <svg width={controlIconSize} height={controlIconSize} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
                    </>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                width: '100%',
                maxWidth: 'min(700px, 100%)',
                margin: '10px auto 0',
                textAlign: 'center',
                fontSize: 'clamp(11px, 2.8vw, 13px)',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.78)',
                lineHeight: 1.4,
              }}
            >
              Informational support only - MyMcKenzie Assistant can make mistakes and is not a substitute for legal advice.
            </div>

            {showWordLimitWarning && (
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <p style={{
                  fontSize: 'clamp(13px, 3.3vw, 16px)',
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
  )
}
