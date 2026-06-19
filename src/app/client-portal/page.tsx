'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import { Mail, FileText, Calendar, Clock, User, MessageSquare, Video, ShieldCheck, UploadCloud, Paperclip, X, Loader2, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import styles from './clientPortal.module.css'
import { parseInboxAttachments, type InboxMessageAttachment } from '@/lib/inbox/attachments'

interface BusinessLink {
  id: string
  business_id: string
  client_name: string
  status: string
  business_name?: string
  has_open_matter?: boolean
  is_closed?: boolean
}

interface Message {
  id: string
  sender: string
  senderEmail: string
  subject: string
  content: string
  timestamp: string
  isRead: boolean
  attachments?: InboxMessageAttachment[]
}

interface ClientDocument {
  id: string
  name: string
  createdAt: string
  size: number
  mimeType: string
  sourceLabel?: string
}

type PreviewDocument = {
  id: string
  name: string
  createdAt: string
  size: number
  mimeType: string
  sourceLabel?: string
}

interface ClientMeeting {
  id: string
  title: string
  description: string
  meetingDate: string
  meetingTime: string
  durationMinutes: number
  roomName: string
  status: string
  businessName: string
}

export default function ClientPortalPage() {
  const [businessLinks, setBusinessLinks] = useState<BusinessLink[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [documents, setDocuments] = useState<ClientDocument[]>([])
  const [sharedPortalDocuments, setSharedPortalDocuments] = useState<ClientDocument[]>([])
  const [meetings, setMeetings] = useState<ClientMeeting[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTab, setSelectedTab] = useState<'messages' | 'meetings' | 'documents' | 'profile'>('messages')
  const [showCompose, setShowCompose] = useState(false)
  const [composeForm, setComposeForm] = useState({ subject: '', content: '' })
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeNotice, setComposeNotice] = useState('')
  const [leavingLinkId, setLeavingLinkId] = useState<string | null>(null)
  const [portalNotice, setPortalNotice] = useState('')
  const [portalUploading, setPortalUploading] = useState(false)
  const [portalUploadNotice, setPortalUploadNotice] = useState('')
  const [previewDocument, setPreviewDocument] = useState<PreviewDocument | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const portalUploadInputRef = useRef<HTMLInputElement>(null)

  const formatPreviewDate = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString()
  }

  const sharedDocuments = useMemo(() => {
    const seen = new Map<string, ClientDocument>()
    sharedPortalDocuments.forEach((doc) => {
      seen.set(doc.id, doc)
    })
    messages.forEach((message) => {
      message.attachments?.forEach((attachment) => {
        if (!attachment.documentId || seen.has(attachment.documentId)) return
        seen.set(attachment.documentId, {
          id: attachment.documentId,
          name: attachment.name,
          createdAt: message.timestamp,
          size: attachment.size || 0,
          mimeType: attachment.mimeType || '',
          sourceLabel: 'Message attachment',
        })
      })
    })
    return Array.from(seen.values())
  }, [messages, sharedPortalDocuments])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load business links
      const { data: links } = await supabase
        .from('client_business_links')
        .select('*, businesses(name)')
        .eq('client_id', user.id)
        .eq('status', 'active')

      if (links) {
        const nextLinks = links.map((link: any) => ({
          id: link.id,
          business_id: link.business_id,
          client_name: link.client_name,
          status: link.status,
          business_name: link.businesses?.name,
        }))

        let statuses: Record<string, { hasOpenMatter: boolean; isClosed: boolean }> = {}
        try {
          const statusResponse = await fetch('/api/client/relationship-statuses', {
            credentials: 'include',
            cache: 'no-store',
          })
          const payload = await statusResponse.json().catch(() => ({}))
          if (statusResponse.ok && payload?.statuses && typeof payload.statuses === 'object') {
            statuses = payload.statuses
          }
        } catch {
          // Keep default behavior when status feed is unavailable.
        }

        setBusinessLinks(nextLinks.map((link: any) => ({
          ...link,
          has_open_matter: Boolean(statuses[link.business_id]?.hasOpenMatter),
          is_closed: Boolean(statuses[link.business_id]?.isClosed),
        })))
      }

      // Load messages
      const { data: msgs } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('recipient_email', user.email)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (msgs) {
        setMessages(msgs.map((msg: any) => ({
          id: msg.id,
          sender: msg.sender_name || msg.sender_email?.split('@')[0] || 'Unknown',
          senderEmail: msg.sender_email,
          subject: msg.subject,
          content: msg.content,
          timestamp: new Date(msg.created_at).toLocaleDateString(),
          isRead: msg.is_read,
          attachments: parseInboxAttachments(msg.metadata),
        })))
      }

      const docsResponse = await fetch('/api/client/documents', {
        credentials: 'include',
        cache: 'no-store',
      })
      const docsPayload = await docsResponse.json().catch(() => ({}))
      if (docsResponse.ok && Array.isArray(docsPayload?.documents)) {
        const nextDocs = docsPayload.documents.map((doc: any) => ({
          id: String(doc.id),
          name: String(doc.name || 'Document'),
          createdAt: String(doc.createdAt || doc.created_at || new Date().toISOString()),
          size: Number(doc.size || doc.file_size || 0),
          mimeType: String(doc.mimeType || doc.mime_type || ''),
          sourceLabel: typeof doc.sourceLabel === 'string' ? doc.sourceLabel : undefined,
        }))
        setDocuments(nextDocs.filter((doc: ClientDocument) => doc.sourceLabel !== 'Shared by your professional'))
        setSharedPortalDocuments(nextDocs.filter((doc: ClientDocument) => doc.sourceLabel === 'Shared by your professional'))
      }

      try {
        const meetingsResponse = await fetch('/api/client/meetings', {
          credentials: 'include',
          cache: 'no-store',
        })
        const meetingsPayload = await meetingsResponse.json().catch(() => ({}))
        if (meetingsResponse.ok && Array.isArray(meetingsPayload?.meetings)) {
          setMeetings(meetingsPayload.meetings)
        }
      } catch {
        setMeetings([])
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLeaveProfessional = async (linkId: string, businessName?: string) => {
    const label = businessName || 'this professional'
    const shouldContinue = window.confirm(
      `Leave ${label}? You will lose portal access for this connection until they invite you again.`,
    )
    if (!shouldContinue) return

    setLeavingLinkId(linkId)
    setPortalNotice('')
    try {
      const response = await fetch('/api/client/business-links', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ linkId }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Unable to leave this professional.')
      setPortalNotice('Connection removed.')
      await loadData()
    } catch (err) {
      setPortalNotice(err instanceof Error ? err.message : 'Unable to leave this professional.')
    } finally {
      setLeavingLinkId(null)
    }
  }

  const handleCompose = (businessId: string, subject = '') => {
    setSelectedBusinessId(businessId)
    if (subject) setComposeForm((prev) => ({ ...prev, subject }))
    setShowCompose(true)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    setComposeSending(true)
    setComposeNotice('')

    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const response = await fetch('/api/client/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          businessId: selectedBusinessId,
          subject: composeForm.subject,
          content: composeForm.content,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to send message')
      }

      setComposeNotice('sent')
      setComposeForm({ subject: '', content: '' })
      setSelectedBusinessId('')
      setTimeout(() => { setShowCompose(false); setComposeNotice(''); loadData() }, 1500)
    } catch (err) {
      setComposeNotice(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setComposeSending(false)
    }
  }

  const handleOpenDocument = async (id: string, previewMeta?: Partial<PreviewDocument>) => {
    const matched = documents.find((doc) => doc.id === id)
    setPreviewDocument(
      previewMeta
        ? {
            id,
            name: previewMeta.name || matched?.name || 'Document',
            createdAt: previewMeta.createdAt || matched?.createdAt || new Date().toISOString(),
            size: typeof previewMeta.size === 'number' ? previewMeta.size : matched?.size || 0,
            mimeType: previewMeta.mimeType || matched?.mimeType || '',
            sourceLabel: previewMeta.sourceLabel,
          }
        : matched || {
            id,
            name: 'Document',
            createdAt: new Date().toISOString(),
            size: 0,
            mimeType: '',
          },
    )
    setPreviewUrl('')
    setPreviewError('')
    setPreviewLoading(true)
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(id)}/signed`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'Unable to open document.')
      }
      setPreviewUrl(String(payload.url))
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Unable to open document.')
    } finally {
      setPreviewLoading(false)
    }
  }

  const closePreview = () => {
    setPreviewDocument(null)
    setPreviewUrl('')
    setPreviewLoading(false)
    setPreviewError('')
  }

  const handlePortalUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setPortalUploading(true)
    setPortalUploadNotice('')

    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const formData = new FormData()
      formData.append('source', 'client-portal')
      for (const file of Array.from(files)) {
        formData.append('files', file)
      }

      const response = await fetch('/api/documents', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Upload failed.')
      }

      const uploadedCount = Array.isArray(payload?.documents) ? payload.documents.length : files.length
      const sharedNote = businessLinks.length > 0
        ? ' Your connected professional has been notified.'
        : ''
      setPortalUploadNotice(`${uploadedCount} document${uploadedCount === 1 ? '' : 's'} uploaded.${sharedNote}`)
      if (portalUploadInputRef.current) portalUploadInputRef.current.value = ''
      await loadData()
    } catch (error) {
      setPortalUploadNotice(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setPortalUploading(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '—'
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  const formatMeetingDate = (meeting: ClientMeeting) => {
    const date = new Date(`${meeting.meetingDate}T${meeting.meetingTime || '00:00'}`)
    if (Number.isNaN(date.getTime())) return meeting.meetingDate
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date)
  }

  const meetingHref = (roomName: string) => `/video-call?room=${encodeURIComponent(roomName)}`
  const unreadMessageCount = messages.filter((message) => !message.isRead).length
  const upcomingMeetingCount = meetings.length
  const connectedProfessionalCount = businessLinks.length
  const portalIntroText =
    'Use this portal for messages, meeting links, and documents shared by a professional. Your case workspace remains available from the header.'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className={styles.portalPage}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className={styles.overline}>Client portal</p>
            <h1 className={styles.title}>MyMcKenzieCS Client Portal</h1>
          </div>
        </div>
        <nav className={styles.nav} aria-label="Client portal">
          <Link href="/dashboard" className={styles.navLink}>Go to dashboard</Link>
        </nav>
      </header>

      <section className={styles.summary}>
        <div className={styles.summaryText}>
          <p className={styles.overline}>Client workspace</p>
          <h2 className={styles.summaryTitle}>Messages, meetings, and documents from your professional.</h2>
          <p className={styles.summaryCopy}>{portalIntroText}</p>
        </div>
        <div className={styles.stats} aria-label="Portal summary">
          <div className={styles.stat}><strong>{connectedProfessionalCount}</strong>Professionals</div>
          <div className={styles.stat}><strong>{upcomingMeetingCount}</strong>Meetings</div>
          <div className={styles.stat}><strong>{documents.length + sharedPortalDocuments.length}</strong>Documents</div>
        </div>
      </section>

      {businessLinks.length === 0 && (
        <div className={styles.emptyConnection}>
          <h2>No professional connection yet</h2>
          <p>Your client portal becomes active when a professional invites you or accepts your enquiry. Once connected, their messages, meeting links, and shared documents appear here automatically.</p>
        </div>
      )}

      {portalNotice && (
        <div className={styles.notice}>
          <p>{portalNotice}</p>
        </div>
      )}

      {(upcomingMeetingCount > 0 || unreadMessageCount > 0) && (
        <div className={styles.notice}>
          <h2>Client portal updates</h2>
          <p>
            {[
              upcomingMeetingCount > 0 ? `${upcomingMeetingCount} upcoming video meeting${upcomingMeetingCount === 1 ? '' : 's'}` : '',
              unreadMessageCount > 0 ? `${unreadMessageCount} unread message${unreadMessageCount === 1 ? '' : 's'}` : '',
            ].filter(Boolean).join(' and ')}.
          </p>
        </div>
      )}

      <main className={styles.workspace}>
        <aside className={styles.sidePanel}>
          <div className={styles.panelHeader}>
            <span className={styles.overline}>Portal sections</span>
            <h2 className={styles.panelTitle}>Your workspace</h2>
          </div>
          <div className={styles.sectionNav}>
            <button type="button" className={selectedTab === 'messages' ? styles.sectionButtonActive : styles.sectionButton} onClick={() => setSelectedTab('messages')}>
              <span className={styles.sectionLabel}><MessageSquare size={16} />Messages</span>
              {unreadMessageCount > 0 && <span className={styles.badge}>{unreadMessageCount > 99 ? '99+' : unreadMessageCount}</span>}
            </button>
            <button type="button" className={selectedTab === 'meetings' ? styles.sectionButtonActive : styles.sectionButton} onClick={() => setSelectedTab('meetings')}>
              <span className={styles.sectionLabel}><Video size={16} />Meetings</span>
              {upcomingMeetingCount > 0 && <span className={styles.badge}>{upcomingMeetingCount > 99 ? '99+' : upcomingMeetingCount}</span>}
            </button>
            <button type="button" className={selectedTab === 'documents' ? styles.sectionButtonActive : styles.sectionButton} onClick={() => setSelectedTab('documents')}>
              <span className={styles.sectionLabel}><FileText size={16} />Documents</span>
            </button>
            <button type="button" className={selectedTab === 'profile' ? styles.sectionButtonActive : styles.sectionButton} onClick={() => setSelectedTab('profile')}>
              <span className={styles.sectionLabel}><User size={16} />Profile</span>
            </button>
          </div>

          {businessLinks.length > 0 && (
            <>
              <div className={styles.panelHeader}>
                <span className={styles.overline}>Professionals</span>
                <h2 className={styles.panelTitle}>Connected access</h2>
              </div>
              <div className={styles.professionals}>
                {businessLinks.map((link) => (
                  <div key={link.id} className={styles.professionalCard}>
                    <div className={styles.professionalTop}>
                      <div className={styles.avatar}><User size={18} /></div>
                      <div>
                        <p className={styles.professionalName}>{link.business_name || 'Legal Professional'}</p>
                        <p className={styles.professionalMeta}>{link.is_closed ? 'Case closed' : link.has_open_matter ? 'Active matter' : 'Connected'}</p>
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <button type="button" className={styles.messageButton} onClick={() => handleCompose(link.business_id, link.is_closed ? 'Request to open a new matter' : '')}>
                        {link.is_closed ? 'Request matter' : 'Message'}
                      </button>
                      <button type="button" className={styles.dangerButton} onClick={() => handleLeaveProfessional(link.id, link.business_name)} disabled={leavingLinkId === link.id}>
                        {leavingLinkId === link.id ? 'Leaving...' : 'Leave'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>

        <section className={styles.listPanel}>
          <div className={styles.listHeader}>
            <h2 className={styles.listTitle}>
              {selectedTab === 'messages' && 'Messages'}
              {selectedTab === 'meetings' && 'Video meetings'}
              {selectedTab === 'documents' && 'Documents'}
              {selectedTab === 'profile' && 'Profile'}
            </h2>
            <p className={styles.listSub}>
              {selectedTab === 'messages' && `${messages.length} received message${messages.length === 1 ? '' : 's'}`}
              {selectedTab === 'meetings' && `${meetings.length} upcoming meeting${meetings.length === 1 ? '' : 's'}`}
              {selectedTab === 'documents' && `${documents.length + sharedPortalDocuments.length} shared document${documents.length + sharedPortalDocuments.length === 1 ? '' : 's'}`}
              {selectedTab === 'profile' && 'Your client portal details'}
            </p>
          </div>
          <div className={styles.listContent}>
            {selectedTab === 'messages' && (
              <>
                {messages.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div>
                      <Mail size={44} />
                      <strong>No messages yet</strong>
                      <span>Messages from connected professionals will appear here.</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`${styles.listItem} ${!msg.isRead ? styles.listItemUnread : ''}`}
                      >
                        <div className={styles.itemTop}>
                          <div>
                            <h4 className={styles.itemTitle}>{msg.subject}</h4>
                            <p className={styles.itemMeta}>From {msg.sender}</p>
                          </div>
                          <span className={styles.itemTime}>{msg.timestamp}</span>
                        </div>
                        <p className={styles.itemPreview}>{msg.content}</p>
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className={styles.messageAttachments}>
                            {msg.attachments.map((attachment) => (
                              <button
                                key={attachment.documentId}
                                type="button"
                                className={styles.messageAttachmentBtn}
                                onClick={() => void handleOpenDocument(attachment.documentId, {
                                  name: attachment.name,
                                  createdAt: msg.timestamp,
                                  size: attachment.size || 0,
                                  mimeType: attachment.mimeType || '',
                                  sourceLabel: 'Message attachment',
                                })}
                              >
                                <Paperclip size={13} />
                                <span>{attachment.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            {selectedTab === 'meetings' && (
              <>
                {meetings.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div>
                      <Video size={44} />
                      <strong>No scheduled video meetings yet</strong>
                      <span>When a professional schedules a call, the join button appears here.</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {meetings.map((meeting) => (
                      <div key={meeting.id} className={styles.listItem}>
                        <div className={styles.itemTop}>
                          <div>
                            <h4 className={styles.itemTitle}>{meeting.title}</h4>
                            <p className={styles.itemMeta}>With {meeting.businessName}</p>
                          </div>
                          <span className={styles.statusPill}>{meeting.status === 'in_progress' ? 'Live' : 'Scheduled'}</span>
                        </div>
                        <div className={styles.meetingInfo}>
                          <span><Calendar size={14} />{formatMeetingDate(meeting)}</span>
                          <span><Clock size={14} />{meeting.meetingTime || 'Time TBC'} · {meeting.durationMinutes} min</span>
                        </div>
                            {meeting.description && (
                          <p className={styles.itemPreview}>{meeting.description}</p>
                            )}
                          <Link
                            href={meetingHref(meeting.roomName)}
                          className={styles.primaryButton}
                          >
                            <Video size={16} />
                            Join meeting
                          </Link>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            {selectedTab === 'documents' && (
              <>
                <div className={styles.sharedDocsPanel}>
                  <div className={styles.sharedDocsHeader}>
                    <div>
                      <h3 className={styles.uploadPanelTitle}>Shared by your professional</h3>
                      <p className={styles.uploadPanelCopy}>Documents sent by your professional appear here so you can open them without leaving the workspace.</p>
                    </div>
                    <span className={styles.sharedDocsCount}>{sharedDocuments.length} file{sharedDocuments.length === 1 ? '' : 's'}</span>
                  </div>
                  {sharedDocuments.length === 0 ? (
                    <div className={styles.sharedDocsEmpty}>No shared documents yet.</div>
                  ) : (
                    <div className={styles.sharedDocsList}>
                      {sharedDocuments.map((doc) => (
                        <div key={doc.id} className={styles.sharedDocsRow}>
                          <div>
                            <h4 className={styles.itemTitle}>{doc.name}</h4>
                            <p className={styles.itemMeta}>
                              {doc.sourceLabel || 'Shared document'} • {doc.size > 0 ? `${Math.max(1, Math.round(doc.size / 1024))} KB` : 'Document'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleOpenDocument(doc.id, {
                              name: doc.name,
                              createdAt: doc.createdAt,
                              size: doc.size,
                              mimeType: doc.mimeType,
                              sourceLabel: 'Shared by your professional',
                            })}
                            className={styles.secondaryButton}
                          >
                            Open
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.uploadPanel}>
                  <div>
                    <h3 className={styles.uploadPanelTitle}>Upload documents</h3>
                    <p className={styles.uploadPanelCopy}>Your files stay in your portal, and connected professionals are notified when you upload from here.</p>
                  </div>
                  <label className={styles.uploadButton}>
                    <UploadCloud size={16} />
                    {portalUploading ? 'Uploading…' : 'Choose files'}
                    <input
                      ref={portalUploadInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(event) => void handlePortalUpload(event.target.files)}
                      disabled={portalUploading}
                    />
                  </label>
                </div>
                {portalUploadNotice && (
                  <div className={styles.portalUploadNotice}>
                    <p>{portalUploadNotice}</p>
                  </div>
                )}
                {documents.length === 0 && sharedPortalDocuments.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div>
                      <FileText size={44} />
                      <strong>No documents yet</strong>
                      <span>Documents uploaded here and documents shared by your professional will be listed here.</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {documents.map((doc) => (
                      <div key={doc.id} className={`${styles.listItem} ${styles.documentRow}`}>
                        <div>
                          <h4 className={styles.itemTitle}>{doc.name}</h4>
                          <p className={styles.itemMeta}>
                            {new Date(doc.createdAt).toLocaleDateString()} • {formatSize(doc.size)}
                            {doc.sourceLabel ? ` • ${doc.sourceLabel}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleOpenDocument(doc.id, {
                            name: doc.name,
                            createdAt: doc.createdAt,
                            size: doc.size,
                            mimeType: doc.mimeType,
                          })}
                          className={styles.secondaryButton}
                        >
                          Open
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            {selectedTab === 'profile' && (
              <div className={styles.listItem}>
                <p className={styles.itemPreview}>This profile is used for your client portal connection.</p>
                <div className={styles.field}>
                    <label>Name</label>
                    <input
                      type="text"
                      value={businessLinks[0]?.client_name || ''}
                      readOnly
                    className={styles.input}
                    />
                  </div>
                <div className={styles.field}>
                    <label>Email</label>
                    <input
                      type="email"
                      readOnly
                    className={styles.input}
                    />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className={styles.detailPanel}>
          <div className={styles.detailHeader}>
            <h2 className={styles.detailTitle}>Portal overview</h2>
          </div>
          <div className={styles.detailBody}>
            <p className={styles.detailText}>
              This area keeps the practical items shared by your connected professional in one place. Use Messages for correspondence, Meetings for video links, and Documents for files they share with you.
            </p>
            {selectedTab === 'meetings' && meetings[0] && (
              <div className={styles.listItem}>
                <h3 className={styles.itemTitle}>Next meeting</h3>
                <p className={styles.itemMeta}>{meetings[0].title} with {meetings[0].businessName}</p>
                <div className={styles.cardActions}>
                  <Link href={meetingHref(meetings[0].roomName)} className={styles.primaryButton}><Video size={16} />Join meeting</Link>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Compose modal */}
      {showCompose && (
        <div className={styles.composeOverlay}>
          <div className={styles.composeModal}>
            <div className={styles.composeHeader}>
              <h2 className={styles.composeTitle}>Send Message</h2>
              <button
                type="button"
                onClick={() => setShowCompose(false)}
                className={styles.closeButton}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSendMessage} className={styles.composeForm}>
              <div className={styles.field}>
                <label htmlFor="subject">
                  Subject
                </label>
                <input
                  type="text"
                  id="subject"
                  required
                  value={composeForm.subject}
                  onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                  className={styles.input}
                  placeholder="Subject of your message"
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="content">
                  Message
                </label>
                <textarea
                  id="content"
                  required
                  rows={6}
                  value={composeForm.content}
                  onChange={(e) => setComposeForm({ ...composeForm, content: e.target.value })}
                  className={styles.textarea}
                  placeholder="Type your message here..."
                />
              </div>
              {composeNotice && (
                <p className={composeNotice === 'sent' ? styles.successText : styles.errorText}>
                  {composeNotice === 'sent' ? 'Message sent!' : composeNotice}
                </p>
              )}
              <div className={styles.composeActions}>
                <button
                  type="submit"
                  disabled={composeSending}
                  className={styles.primaryButton}
                >
                  {composeSending ? 'Sending...' : 'Send Message'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCompose(false)}
                  className={styles.secondaryButton}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document preview modal */}
      {previewDocument && (
        <div className={styles.previewOverlay} onClick={(event) => { if (event.target === event.currentTarget) closePreview() }}>
          <div className={styles.previewModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.previewHeader}>
              <div>
                <p className={styles.previewEyebrow}>{previewDocument.sourceLabel || 'Shared document'}</p>
                <h2 className={styles.previewTitle}>{previewDocument.name}</h2>
                <p className={styles.previewMeta}>
                  {previewDocument.createdAt ? formatPreviewDate(previewDocument.createdAt) : 'Document'}
                  {previewDocument.size > 0 ? ` • ${Math.max(1, Math.round(previewDocument.size / 1024))} KB` : ''}
                </p>
              </div>
              <button type="button" className={styles.closeButton} onClick={closePreview} aria-label="Close document preview">
                <X size={16} />
              </button>
            </div>
            <div className={styles.previewBody}>
              {previewLoading ? (
                <div className={styles.previewLoading}>
                  <Loader2 size={20} className={styles.spin} />
                  <p>Loading document…</p>
                </div>
              ) : previewError ? (
                <div className={styles.previewError}>
                  <p>{previewError}</p>
                  <button type="button" className={styles.primaryButton} onClick={() => void handleOpenDocument(previewDocument.id)}>
                    Retry
                  </button>
                </div>
              ) : previewUrl ? (
                <>
                  {previewDocument.mimeType.startsWith('image/') ? (
                    <img src={previewUrl} alt={previewDocument.name} className={styles.previewImage} />
                  ) : (
                    <iframe src={previewUrl} title={previewDocument.name} className={styles.previewFrame} />
                  )}
                </>
              ) : (
                <div className={styles.previewError}>
                  <p>Preparing document preview…</p>
                </div>
              )}
            </div>
            <div className={styles.previewFooter}>
              <button type="button" className={styles.secondaryButton} onClick={closePreview}>
                Close
              </button>
              {previewUrl && (
                <a href={previewUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>
                  <ExternalLink size={14} />
                  Open in new tab
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
