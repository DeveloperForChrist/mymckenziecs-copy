'use client'

import { useEffect, useRef, useState } from 'react'
import { Mail, Send, FileText, Trash2, Archive, Star, Search, Reply, Forward, X, UserPlus, CheckCircle2, XCircle, Loader2, Paperclip, UploadCloud, RotateCcw } from 'lucide-react'
import styles from './inbox.module.css'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import { parseInboxAttachments, type InboxMessageAttachment } from '@/lib/inbox/attachments'

interface Message {
  id: string
  sender: string
  senderEmail: string
  subject: string
  preview: string
  content: string
  timestamp: string
  isRead: boolean
  isStarred: boolean
  type: 'email' | 'invitation' | 'client_invite'
  metadata?: {
    invitation_id?: string
    role?: string
    inviter_email?: string
    status?: string
    invited_email?: string
    client_name?: string
    accepted_at?: string | null
    fromClient?: boolean
    attachmentIds?: string[]
    attachments?: InboxMessageAttachment[]
  }
  deletedAt?: string | null
}

type DocumentOption = {
  id: string
  name: string
  createdAt: string
  size: number
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', solicitor: 'Solicitor/McKenzie Friend',
  paralegal: 'Paralegal', admin: 'Admin', viewer: 'Viewer',
}

const FOLDERS = [
  { id: 'inbox', name: 'Inbox', icon: Mail },
  { id: 'clients', name: 'Clients', icon: UserPlus },
  { id: 'invitations', name: 'Invitations', icon: UserPlus },
  { id: 'client-invites', name: 'Client Invites', icon: UserPlus },
  { id: 'sent', name: 'Sent', icon: Send },
  { id: 'drafts', name: 'Drafts', icon: FileText },
  { id: 'starred', name: 'Starred', icon: Star },
  { id: 'trash', name: 'Trash', icon: Trash2 },
  { id: 'archive', name: 'Archive', icon: Archive },
]

function fmtTime(dateStr: string) {
  const d = new Date(dateStr), now = new Date()
  const h = Math.floor((now.getTime() - d.getTime()) / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  if (h < 48) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function InboxPage({ composePreset }: { composePreset?: { to: string; subject?: string; body?: string } | null }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [clientMessages, setClientMessages] = useState<Message[]>([])
  const [invitations, setInvitations] = useState<Message[]>([])
  const [clientInvites, setClientInvites] = useState<Message[]>([])
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null)
  const [selectedFolder, setSelectedFolder] = useState('inbox')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [showClientInvite, setShowClientInvite] = useState(false)
  const [composeForm, setComposeForm] = useState({ to: '', subject: '', body: '' })
  const [clientInviteForm, setClientInviteForm] = useState({ email: '', name: '' })
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [availableDocuments, setAvailableDocuments] = useState<DocumentOption[]>([])
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [inviteSending, setInviteSending] = useState(false)
  const [composeNotice, setComposeNotice] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')
  const attachmentInputRef = useRef<HTMLInputElement>(null)

  const resetComposeAttachments = () => {
    setAttachedFiles([])
    setSelectedDocumentIds([])
    setAvailableDocuments([])
    setDocumentsError('')
    if (attachmentInputRef.current) attachmentInputRef.current.value = ''
  }

  const openComposeDraft = (draft: { to: string; subject: string; body: string }, message?: Message) => {
    if (message) {
      setSelectedFolder('inbox')
      setSelectedMsg(message)
    }
    setComposeNotice('')
    setComposeForm(draft)
    resetComposeAttachments()
    setShowCompose(true)
  }

  const openReply = (message: Message) => {
    const replySubject = message.subject.toLowerCase().startsWith('re:') ? message.subject : `Re: ${message.subject}`
    openComposeDraft(
      {
        to: message.senderEmail,
        subject: replySubject,
        body: `\n\n--- Original message ---\nFrom: ${message.sender} <${message.senderEmail}>\nSent: ${message.timestamp}\nSubject: ${message.subject}\n\n${message.content}`,
      },
      message,
    )
  }

  const openForward = (message: Message) => {
    const forwardSubject = message.subject.toLowerCase().startsWith('fwd:') ? message.subject : `Fwd: ${message.subject}`
    openComposeDraft(
      {
        to: '',
        subject: forwardSubject,
        body: `\n\n--- Forwarded message ---\nFrom: ${message.sender} <${message.senderEmail}>\nSent: ${message.timestamp}\nSubject: ${message.subject}\n\n${message.content}`,
      },
      message,
    )
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (!composePreset?.to) return
    setSelectedFolder('inbox')
    setSelectedMsg(null)
    setComposeForm({
      to: composePreset.to,
      subject: composePreset.subject || '',
      body: composePreset.body || '',
    })
    setShowCompose(true)
  }, [composePreset?.to, composePreset?.subject, composePreset?.body])

  useEffect(() => {
    if (!showCompose) return

    let cancelled = false
    const loadDocuments = async () => {
      setDocumentsLoading(true)
      setDocumentsError('')
      try {
        const res = await fetch('/api/documents?limit=100&offset=0', {
          credentials: 'include',
          cache: 'no-store',
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(payload?.error || 'Unable to load documents.')
        }

        const docs = Array.isArray(payload?.documents) ? payload.documents : []
        if (!cancelled) {
          setAvailableDocuments(
            docs.map((doc: Record<string, unknown>) => ({
              id: String(doc.id || ''),
              name: String(doc.name || 'Document'),
              createdAt: String(doc.created_at || new Date().toISOString()),
              size: typeof doc.file_size === 'number' ? doc.file_size : Number(doc.file_size || 0),
            })).filter((doc: DocumentOption) => Boolean(doc.id)),
          )
        }
      } catch (err) {
        if (!cancelled) {
          setDocumentsError(err instanceof Error ? err.message : 'Unable to load documents.')
        }
      } finally {
        if (!cancelled) setDocumentsLoading(false)
      }
    }

    void loadDocuments()
    return () => {
      cancelled = true
    }
  }, [showCompose])

  async function loadData() {
    setLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { setLoading(false); return }

      const { data: msgs } = await supabase
        .from('inbox_messages').select('*')
        .eq('recipient_email', user.email)
        .order('created_at', { ascending: false })

      if (msgs) {
        const allMessages = msgs.map((r: Record<string, unknown>) => ({
          id: String(r.id),
          sender: String(r.sender_name || String(r.sender_email || '').split('@')[0] || 'Unknown'),
          senderEmail: String(r.sender_email || ''),
          subject: String(r.subject),
          preview: String(r.content || '').slice(0, 100),
          content: String(r.content || ''),
          timestamp: fmtTime(String(r.created_at)),
          isRead: Boolean(r.is_read),
          isStarred: Boolean(r.is_starred),
          type: 'email' as const,
          deletedAt: typeof r.deleted_at === 'string' ? r.deleted_at : null,
          metadata: {
            ...(r.metadata as Record<string, unknown> | undefined),
            fromClient: Boolean((r.metadata as Record<string, unknown> | undefined)?.fromClient),
            attachments: parseInboxAttachments(r.metadata),
          } as Message['metadata'],
        }))

        // Separate client messages from regular messages
        setMessages(allMessages.filter(m => !m.metadata?.fromClient))
        setClientMessages(allMessages.filter(m => m.metadata?.fromClient))
      }

      const { data: invs } = await supabase
        .from('team_invitations').select('*')
        .eq('invited_email', user.email).order('created_at', { ascending: false })

      if (invs) {
        setInvitations(invs.map((r: Record<string, unknown>) => ({
          id: String(r.id),
          sender: String(String(r.inviter_email || '').split('@')[0] || 'Unknown'),
          senderEmail: String(r.inviter_email || ''),
          subject: `Team invitation — ${ROLE_LABEL[String(r.role)] || String(r.role)}`,
          preview: `Invited by ${r.inviter_email} as ${ROLE_LABEL[String(r.role)] || String(r.role)}`,
          content: `${r.inviter_email} has invited you to join their team as ${ROLE_LABEL[String(r.role)] || String(r.role)}.`,
          timestamp: fmtTime(String(r.created_at)),
          isRead: r.status !== 'pending',
          isStarred: false,
          type: 'invitation' as const,
          metadata: { invitation_id: String(r.id), role: String(r.role), inviter_email: String(r.inviter_email || ''), status: String(r.status) },
        })))
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        try {
          const res = await fetch('/api/business/client-invite', {
            method: 'GET',
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store',
          })
          const data = await res.json().catch(() => ({}))
          if (res.ok && Array.isArray(data?.invitations)) {
            setClientInvites(
              data.invitations.map((inv: any) => {
                const invitedEmail = String(inv.invited_email || '')
                const clientName = typeof inv.client_name === 'string' ? inv.client_name : ''
                const status = String(inv.status || 'pending')
                const acceptedAt = inv.accepted_at ? String(inv.accepted_at) : null
                const who = clientName || invitedEmail || 'Client'
                const statusLabel = status === 'accepted' ? 'Accepted' : status === 'pending' ? 'Pending' : status
                return {
                  id: String(inv.id),
                  sender: who,
                  senderEmail: invitedEmail,
                  subject: 'Client portal invitation',
                  preview: `${statusLabel} • ${invitedEmail}`,
                  content:
                    status === 'accepted'
                      ? `Invitation accepted by ${invitedEmail}${clientName ? ` (${clientName})` : ''}.`
                      : `Invitation sent to ${invitedEmail}${clientName ? ` (${clientName})` : ''}.`,
                  timestamp: fmtTime(String(inv.created_at)),
                  isRead: true,
                  isStarred: false,
                  type: 'client_invite' as const,
                  metadata: { invitation_id: String(inv.id), status, invited_email: invitedEmail, client_name: clientName, accepted_at: acceptedAt },
                }
              })
            )
          }
        } catch {
          // ignore history fetch errors
        }
      }
    } catch { /* graceful fallback */ } finally { setLoading(false) }
  }

  const handleComposeSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setComposeSending(true); setComposeNotice('')
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      let attachmentIds: string[] = []
      if (attachedFiles.length > 0) {
        const formData = new FormData()
        attachedFiles.forEach((file) => formData.append('files', file))
        const uploadRes = await fetch('/api/documents', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        })
        const uploadPayload = await uploadRes.json().catch(() => ({}))
        if (!uploadRes.ok) {
          throw new Error(uploadPayload?.error || 'Failed to upload attachments')
        }
        const uploadedDocs = Array.isArray(uploadPayload?.documents) ? uploadPayload.documents : []
        if (uploadedDocs.length !== attachedFiles.length) {
          throw new Error('One or more attachments could not be uploaded.')
        }
        attachmentIds = uploadedDocs.map((doc: Record<string, unknown>) => String(doc.id || '')).filter(Boolean)
      }
      attachmentIds = Array.from(new Set([...selectedDocumentIds, ...attachmentIds]))

      const response = await fetch('/api/business/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          to: composeForm.to,
          subject: composeForm.subject,
          body: composeForm.body,
          attachmentIds,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to send')
      }
      setComposeNotice('sent')
      setComposeForm({ to: '', subject: '', body: '' })
      setAttachedFiles([])
      setSelectedDocumentIds([])
      setAvailableDocuments([])
      setDocumentsError('')
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = ''
      }
      void loadData()
      setTimeout(() => { setShowCompose(false); setComposeNotice('') }, 1500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send'
      setComposeNotice(msg.includes('does not exist') ? 'DB not set up yet — see code comment for SQL.' : msg)
    } finally { setComposeSending(false) }
  }

  const handleClientInviteSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteSending(true); setInviteNotice('')
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const response = await fetch('/api/business/client-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: clientInviteForm.email,
          name: clientInviteForm.name,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.message || 'Failed to send invite')
      }

      setInviteNotice('sent')
      setClientInviteForm({ email: '', name: '' })
      void loadData()
      setTimeout(() => { setShowClientInvite(false); setInviteNotice('') }, 1500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send invite'
      setInviteNotice(msg)
    } finally { setInviteSending(false) }
  }

  const handleInvitationAction = async (msg: Message, action: 'accepted' | 'declined') => {
    if (!msg.metadata?.invitation_id) return
    setActionLoading(msg.id)
    try {
      const supabase = getSupabaseBrowserClient()
      await supabase.from('team_invitations').update({ status: action }).eq('id', msg.metadata.invitation_id)
      setInvitations(prev => prev.map(m => m.id === msg.id
        ? { ...m, metadata: { ...m.metadata, status: action }, isRead: true } : m))
      if (selectedMsg?.id === msg.id)
        setSelectedMsg(prev => prev ? { ...prev, metadata: { ...prev.metadata, status: action } } : prev)
    } catch { /* ignore */ } finally { setActionLoading(null) }
  }

  const handleMarkAsRead = async (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isRead: true } : m))
    setClientMessages(prev => prev.map(m => m.id === id ? { ...m, isRead: true } : m))
    setSelectedMsg(prev => prev?.id === id ? { ...prev, isRead: true } : prev)
    try {
      const supabase = getSupabaseBrowserClient()
      await supabase.from('inbox_messages').update({ is_read: true }).eq('id', id)
    } catch { /* ignore */ }
  }

  const handleStar = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const msg = [...messages, ...clientMessages].find(m => m.id === id)
    if (!msg) return
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isStarred: !m.isStarred } : m))
    setClientMessages(prev => prev.map(m => m.id === id ? { ...m, isStarred: !m.isStarred } : m))
    setSelectedMsg(prev => prev?.id === id ? { ...prev, isStarred: !prev.isStarred } : prev)
    try {
      const supabase = getSupabaseBrowserClient()
      await supabase.from('inbox_messages').update({ is_starred: !msg.isStarred }).eq('id', id)
    } catch { /* ignore */ }
  }

  const updateLocalMessage = (id: string, updater: (message: Message) => Message) => {
    setMessages(prev => prev.map(m => (m.id === id ? updater(m) : m)))
    setClientMessages(prev => prev.map(m => (m.id === id ? updater(m) : m)))
    setSelectedMsg(prev => (prev?.id === id ? updater(prev) : prev))
  }

  const activeMessages = messages.filter(m => !m.deletedAt)
  const activeClientMessages = clientMessages.filter(m => !m.deletedAt)
  const trashedMessages = [...messages, ...clientMessages].filter(m => Boolean(m.deletedAt))

  const listed = selectedFolder === 'clients' ? activeClientMessages
    : selectedFolder === 'invitations' ? invitations
    : selectedFolder === 'client-invites' ? clientInvites
    : selectedFolder === 'starred' ? activeMessages.filter(m => m.isStarred)
    : selectedFolder === 'trash' ? trashedMessages
    : selectedFolder === 'archive' ? []
    : activeMessages

  const filtered = listed.filter(m =>
    m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.preview.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const counts: Record<string, number> = {
    inbox: activeMessages.filter(m => !m.isRead).length,
    clients: activeClientMessages.filter(m => !m.isRead).length,
    invitations: invitations.filter(m => m.metadata?.status === 'pending').length,
    'client-invites': clientInvites.filter(m => m.metadata?.status === 'pending').length,
    starred: activeMessages.filter(m => m.isStarred).length,
    trash: trashedMessages.length,
    archive: 0,
  }

  const selectedMsgIsTrashed = Boolean(selectedMsg?.deletedAt)

  const moveMessageToTrash = async (message: Message) => {
    if (message.deletedAt) return
    setActionLoading(message.id)
    try {
      const response = await fetch(`/api/business/inbox/${encodeURIComponent(message.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trash' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || 'Failed to move message to Trash.')
      }

      const deletedAt = typeof payload?.message?.deletedAt === 'string' ? payload.message.deletedAt : new Date().toISOString()
      updateLocalMessage(message.id, (current) => ({ ...current, deletedAt }))
      setSelectedFolder('trash')
    } catch {
      // Keep the current state if the server update fails.
    } finally {
      setActionLoading(null)
    }
  }

  const restoreMessage = async (message: Message) => {
    if (!message.deletedAt) return
    setActionLoading(message.id)
    try {
      const response = await fetch(`/api/business/inbox/${encodeURIComponent(message.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || 'Failed to restore message.')
      }

      updateLocalMessage(message.id, (current) => ({ ...current, deletedAt: null }))
      setSelectedFolder('inbox')
    } catch {
      // Keep the current state if the server update fails.
    } finally {
      setActionLoading(null)
    }
  }

  const permanentlyDeleteMessage = async (message: Message) => {
    if (!message.deletedAt) return
    if (!window.confirm('Delete this message permanently? This cannot be undone.')) return

    setActionLoading(message.id)
    try {
      const response = await fetch(`/api/business/inbox/${encodeURIComponent(message.id)}`, {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || 'Failed to permanently delete message.')
      }

      setMessages(prev => prev.filter(m => m.id !== message.id))
      setClientMessages(prev => prev.filter(m => m.id !== message.id))
      setSelectedMsg(prev => (prev?.id === message.id ? null : prev))
    } catch {
      // Keep the message in Trash if the hard delete fails.
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className={styles.inboxContainer}>

      {/* Compose modal */}
      {showCompose && (
        <div
              className={styles.composeOverlay}
              onClick={e => {
                if (e.target === e.currentTarget) {
                  setShowCompose(false)
                  resetComposeAttachments()
                }
              }}
            >
          <div className={styles.composeModal}>
            <div className={styles.composeHeader}>
              <span className={styles.composeTitle}>New Message</span>
              <button
                type="button"
                className={styles.composeClose}
                onClick={() => {
                  setShowCompose(false)
                  resetComposeAttachments()
                }}
              >
                <X size={16}/>
              </button>
            </div>
            <form onSubmit={handleComposeSend} className={styles.composeForm}>
              <div className={styles.composeField}>
                <label className={styles.composeLabel}>To:</label>
                <input className={styles.composeInput} type="email" required placeholder="recipient@email.com"
                  value={composeForm.to} onChange={e => setComposeForm(f => ({ ...f, to: e.target.value }))}/>
              </div>
              <div className={styles.composeField}>
                <label className={styles.composeLabel}>Subject:</label>
                <input className={styles.composeInput} type="text" required placeholder="Subject"
                  value={composeForm.subject} onChange={e => setComposeForm(f => ({ ...f, subject: e.target.value }))}/>
              </div>
              <div className={styles.composeBodyField}>
                <textarea className={styles.composeTextarea} rows={8} placeholder="Write your message…"
                  value={composeForm.body} onChange={e => setComposeForm(f => ({ ...f, body: e.target.value }))}/>
              </div>
              <div className={styles.attachmentField}>
                <div className={styles.attachmentHeader}>
                  <span className={styles.attachmentLabel}>Attachments</span>
                  <label className={styles.attachmentUploadBtn}>
                    <UploadCloud size={14} />
                    Add files
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(event) => {
                        const files = Array.from(event.target.files || [])
                        if (files.length === 0) return
                        setAttachedFiles((prev) => [...prev, ...files])
                        event.target.value = ''
                      }}
                    />
                  </label>
                </div>
                {attachedFiles.length > 0 ? (
                  <div className={styles.attachmentList}>
                    {attachedFiles.map((file, index) => (
                      <span key={`${file.name}-${file.size}-${index}`} className={styles.attachmentChip}>
                        <Paperclip size={13} />
                        <span className={styles.attachmentChipName}>{file.name}</span>
                          <button
                            type="button"
                            className={styles.attachmentChipRemove}
                            onClick={() => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== index))}
                            aria-label={`Remove ${file.name}`}
                          >
                            <X size={12} />
                          </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className={styles.attachmentHint}>Attach one or more documents. They will be uploaded and included with this message.</p>
                )}
              </div>
              <div className={styles.documentPicker}>
                <div className={styles.documentPickerHeader}>
                  <span className={styles.documentPickerLabel}>Attach existing documents</span>
                  <span className={styles.documentPickerMeta}>
                    {availableDocuments.length > 0 ? `${availableDocuments.length} available` : 'No documents loaded'}
                  </span>
                </div>
                {documentsLoading ? (
                  <div className={styles.documentPickerEmpty}>Loading your documents…</div>
                ) : documentsError ? (
                  <div className={styles.documentPickerError}>{documentsError}</div>
                ) : availableDocuments.length === 0 ? (
                  <div className={styles.documentPickerEmpty}>You do not have any saved documents yet.</div>
                ) : (
                  <div className={styles.documentPickerList}>
                    {availableDocuments.map((doc) => {
                      const checked = selectedDocumentIds.includes(doc.id)
                      return (
                        <label key={doc.id} className={checked ? styles.documentPickerItemActive : styles.documentPickerItem}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedDocumentIds((prev) =>
                                checked ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]
                              )
                            }}
                          />
                          <div className={styles.documentPickerInfo}>
                            <span className={styles.documentPickerName}>{doc.name}</span>
                            <span className={styles.documentPickerSub}>
                              {new Date(doc.createdAt).toLocaleDateString()} • {Math.max(1, Math.round(doc.size / 1024))} KB
                            </span>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
                {selectedDocumentIds.length > 0 && (
                  <div className={styles.documentPickerSelected}>
                    {selectedDocumentIds.length} existing document{selectedDocumentIds.length === 1 ? '' : 's'} selected
                  </div>
                )}
              </div>
              <p className={styles.composeHint} role="note">
                Messages are delivered securely in the client portal. The recipient receives an email notification to sign in and reply.
              </p>
              {composeNotice && (
                <p className={composeNotice === 'sent' ? styles.composeSentNotice : styles.composeErrorNotice}>
                  {composeNotice === 'sent' ? 'Message sent!' : composeNotice}
                </p>
              )}
              <div className={styles.composeActions}>
                <button type="submit" className={styles.composeSendBtn} disabled={composeSending}>
                  {composeSending ? <Loader2 size={14} className={styles.spin}/> : <Send size={14}/>}
                  {composeSending ? 'Sending…' : 'Send'}
                </button>
                <button
                  type="button"
                  className={styles.composeCancelBtn}
                  onClick={() => {
                    setShowCompose(false)
                    resetComposeAttachments()
                  }}
                >
                  Discard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client invite modal */}
      {showClientInvite && (
        <div className={styles.composeOverlay} onClick={e => { if (e.target === e.currentTarget) setShowClientInvite(false)}}>
          <div className={`${styles.composeModal} ${styles.inviteModal}`}>
            <div className={styles.composeHeader}>
              <span className={styles.composeTitle}>Invite Client to Portal</span>
              <button type="button" className={styles.composeClose} onClick={() => setShowClientInvite(false)}><X size={16}/></button>
            </div>
            <form onSubmit={handleClientInviteSend} className={`${styles.composeForm} ${styles.inviteForm}`}>
              <div className={styles.inviteFields}>
                <div className={styles.inviteField}>
                  <label className={styles.inviteLabel} htmlFor="invite-client-email">Client email</label>
                  <input
                    id="invite-client-email"
                    className={styles.inviteInput}
                    type="email"
                    required
                    placeholder="client@email.com"
                    value={clientInviteForm.email}
                    onChange={e => setClientInviteForm(f => ({ ...f, email: e.target.value }))}
                    autoComplete="email"
                  />
                </div>
                <div className={styles.inviteField}>
                  <label className={styles.inviteLabel} htmlFor="invite-client-name">
                    Client name <span className={styles.inviteOptional}>(optional)</span>
                  </label>
                  <input
                    id="invite-client-name"
                    className={styles.inviteInput}
                    type="text"
                    placeholder="John Doe"
                    value={clientInviteForm.name}
                    onChange={e => setClientInviteForm(f => ({ ...f, name: e.target.value }))}
                    autoComplete="name"
                  />
                </div>
              </div>
              <div className={styles.inviteCallout} role="note">
                The client receives an email with a signup link to access their client portal (messages, documents, and case updates).
              </div>
              {inviteNotice && (
                <p className={inviteNotice === 'sent' ? styles.composeSentNotice : styles.composeErrorNotice}>
                  {inviteNotice === 'sent' ? 'Invite sent!' : inviteNotice}
                </p>
              )}
              <div className={styles.composeActions}>
                <button type="submit" className={styles.composeSendBtn} disabled={inviteSending}>
                  {inviteSending ? <Loader2 size={14} className={styles.spin}/> : <Send size={14}/>}
                  {inviteSending ? 'Sending…' : 'Send Invite'}
                </button>
                <button type="button" className={styles.composeCancelBtn} onClick={() => setShowClientInvite(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Folder sidebar */}
      <div className={styles.inboxSidebar}>
        <div className={styles.inboxSidebarHeader}>
          <span className={styles.inboxSidebarTitle}>Mail</span>
          <div className={styles.composeButtons}>
            <button className={styles.composeButton} onClick={() => setShowCompose(true)}>
              <Mail size={15}/>Compose
            </button>
            <button className={styles.composeButton} onClick={() => setShowClientInvite(true)}>
              <UserPlus size={15}/>Invite Client
            </button>
          </div>
        </div>
        <div className={styles.inboxFolders}>
          {FOLDERS.map(f => {
            const Icon = f.icon; const cnt = counts[f.id] || 0
            return (
              <button key={f.id} type="button"
                className={`${styles.folderButton} ${selectedFolder === f.id ? styles.folderActive : ''}`}
                onClick={() => { setSelectedFolder(f.id); setSelectedMsg(null) }}>
                <Icon size={17}/><span className={styles.folderLabel}>{f.name}</span>
                {cnt > 0 && <span className={styles.folderCount}>{cnt}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Message list */}
      <div className={styles.emailListColumn}>
        <div className={styles.emailListHeader}>
          <h2 className={styles.emailListTitle}>{FOLDERS.find(f => f.id === selectedFolder)?.name ?? 'Inbox'}</h2>
          <div className={styles.searchBar}>
            <Search size={15} className={styles.searchIcon}/>
            <input type="text" placeholder="Search…" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} className={styles.searchInput}/>
          </div>
        </div>
        <div className={styles.emailListContent}>
          {loading && <div className={styles.emptyState}><Loader2 size={24} className={styles.spin}/><p>Loading…</p></div>}
          {!loading && filtered.length === 0 && <div className={styles.emptyState}><Mail size={32}/><p>No messages here</p></div>}
          {filtered.map(msg => (
            <div key={msg.id} role="button" tabIndex={0}
              className={`${styles.emailItem} ${selectedMsg?.id === msg.id ? styles.emailItemSelected : ''} ${!msg.isRead ? styles.emailItemUnread : ''} ${msg.type === 'invitation' ? styles.emailItemInvitation : ''} ${msg.type === 'client_invite' ? styles.emailItemClientInvite : ''}`}
              onClick={() => { setSelectedMsg(msg); if (!msg.isRead && msg.type === 'email') handleMarkAsRead(msg.id) }}
              onKeyDown={e => { if (e.key === 'Enter') setSelectedMsg(msg) }}>
              <div className={styles.emailItemRow}>
                <span className={styles.senderName}>{msg.sender}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className={styles.emailItemTimestamp}>{msg.timestamp}</span>
                  {msg.type === 'email'
                    ? <button type="button" className={`${styles.starButtonSmall} ${msg.isStarred ? styles.starActive : ''}`} onClick={e => handleStar(msg.id, e)} aria-label="Star"><Star size={13} fill={msg.isStarred ? 'currentColor' : 'none'}/></button>
                    : (
                      <span className={styles.inviteBadge}>
                        {msg.type === 'invitation'
                          ? (msg.metadata?.status === 'accepted' ? '✓' : msg.metadata?.status === 'declined' ? '✗' : '·')
                          : (msg.metadata?.status === 'accepted' ? '✓' : '·')}
                      </span>
                    )
                  }
                </div>
              </div>
              <p className={styles.emailItemSubject}>{msg.subject}</p>
              <p className={styles.emailItemPreview}>{msg.preview}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Preview pane */}
      <div className={styles.emailPreviewPane}>
        {selectedMsg ? (
          <>
            <div className={styles.previewHeader}>
              <div className={styles.previewTopRow}>
                <h2 className={styles.previewSubject}>{selectedMsg.subject}</h2>
                {selectedMsg.type === 'email' && (
                  <div className={styles.previewActions}>
                    <button type="button" className={`${styles.starActionBtn} ${selectedMsg.isStarred ? styles.starActionBtnActive : ''}`} onClick={e => handleStar(selectedMsg.id, e)} aria-label="Star">
                      <Star size={16} fill={selectedMsg.isStarred ? 'currentColor' : 'none'}/>
                    </button>
                    {!selectedMsgIsTrashed ? (
                      <button
                        type="button"
                        className={styles.deleteActionBtn}
                        onClick={() => void moveMessageToTrash(selectedMsg)}
                        aria-label="Move to Trash"
                        disabled={actionLoading === selectedMsg.id}
                      >
                        {actionLoading === selectedMsg.id ? <Loader2 size={16} className={styles.spin} /> : <Trash2 size={16} />}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={styles.restoreActionBtn}
                          onClick={() => void restoreMessage(selectedMsg)}
                          aria-label="Restore from Trash"
                          disabled={actionLoading === selectedMsg.id}
                        >
                          {actionLoading === selectedMsg.id ? <Loader2 size={16} className={styles.spin} /> : <RotateCcw size={16} />}
                        </button>
                        <button
                          type="button"
                          className={styles.deleteActionBtn}
                          onClick={() => void permanentlyDeleteMessage(selectedMsg)}
                          aria-label="Delete permanently"
                          disabled={actionLoading === selectedMsg.id}
                        >
                          {actionLoading === selectedMsg.id ? <Loader2 size={16} className={styles.spin} /> : <Trash2 size={16} />}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className={styles.previewMetaRow}>
                <div className={styles.previewSenderBlock}>
                  <div className={styles.senderAvatar}>{selectedMsg.sender.slice(0, 2).toUpperCase()}</div>
                  <div className={styles.senderInfo}>
                    <span className={styles.previewSenderName}>{selectedMsg.sender}</span>
                    <span className={styles.previewSenderEmail}>{selectedMsg.senderEmail}</span>
                  </div>
                </div>
                <span className={styles.previewTimestamp}>{selectedMsg.timestamp}</span>
              </div>
            </div>

            <div className={styles.previewBody}>
              <p className={styles.emailBodyText}>{selectedMsg.content}</p>
              {selectedMsgIsTrashed && (
                <div className={styles.trashNotice} role="note">
                  This message is in Trash. Restore it to move it back to the inbox, or permanently delete it if you no longer need it.
                </div>
              )}

              {selectedMsg.metadata?.attachments && selectedMsg.metadata.attachments.length > 0 && (
                <div className={styles.previewAttachments}>
                  <h3 className={styles.previewAttachmentsTitle}>Attachments</h3>
                  <div className={styles.previewAttachmentList}>
                    {selectedMsg.metadata.attachments.map((attachment) => (
                      <button
                        key={attachment.documentId}
                        type="button"
                        className={styles.previewAttachmentBtn}
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/documents/${encodeURIComponent(attachment.documentId)}/signed`, {
                              credentials: 'include',
                              cache: 'no-store',
                            })
                            const data = await res.json().catch(() => ({}))
                            if (!res.ok || !data?.url) {
                              throw new Error(data?.error || 'Unable to open attachment.')
                            }
                            window.open(String(data.url), '_blank', 'noopener,noreferrer')
                          } catch {
                            // Let the existing preview stay usable even when attachment opening fails.
                          }
                        }}
                      >
                        <Paperclip size={14} />
                        <span>{attachment.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedMsg.type === 'invitation' && selectedMsg.metadata?.status === 'pending' && (
                <div className={styles.invitationActions}>
                  <p className={styles.invitationPrompt}>Would you like to join this team?</p>
                  <div className={styles.invitationButtons}>
                    <button type="button" className={styles.acceptBtn} disabled={actionLoading === selectedMsg.id}
                      onClick={() => handleInvitationAction(selectedMsg, 'accepted')}>
                      {actionLoading === selectedMsg.id ? <Loader2 size={14} className={styles.spin}/> : <CheckCircle2 size={14}/>}Accept
                    </button>
                    <button type="button" className={styles.declineBtn} disabled={actionLoading === selectedMsg.id}
                      onClick={() => handleInvitationAction(selectedMsg, 'declined')}>
                      <XCircle size={14}/>Decline
                    </button>
                  </div>
                </div>
              )}
              {selectedMsg.type === 'invitation' && selectedMsg.metadata?.status === 'accepted' && (
                <div className={styles.invitationAccepted}><CheckCircle2 size={16}/>You accepted this invitation</div>
              )}
              {selectedMsg.type === 'invitation' && selectedMsg.metadata?.status === 'declined' && (
                <div className={styles.invitationDeclined}><XCircle size={16}/>You declined this invitation</div>
              )}

              {selectedMsg.type === 'client_invite' && (
                <div className={styles.invitationActions}>
                  <p className={styles.invitationPrompt}>
                    Status: <strong>{selectedMsg.metadata?.status || 'pending'}</strong>
                    {selectedMsg.metadata?.accepted_at ? ` • Accepted ${fmtTime(String(selectedMsg.metadata.accepted_at))}` : ''}
                  </p>
                </div>
              )}
            </div>

            {selectedMsg.type === 'email' && (
              <div className={styles.previewFooter}>
                <button type="button" className={styles.replyBtn} onClick={() => openReply(selectedMsg)}><Reply size={15}/>Reply</button>
                <button type="button" className={styles.forwardBtn} onClick={() => openForward(selectedMsg)}><Forward size={15}/>Forward</button>
              </div>
            )}
          </>
        ) : (
          <div className={styles.noEmailState}><Mail size={44}/><p>Select a message to read</p></div>
        )}
      </div>
    </div>
  )
}
