'use client'

import { useState, useEffect } from 'react'
import { Mail, Send, FileText, Trash2, Archive, Star, Search, Reply, Forward, X, UserPlus, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import styles from './inbox.module.css'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'

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
  }
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
  const [composeSending, setComposeSending] = useState(false)
  const [inviteSending, setInviteSending] = useState(false)
  const [composeNotice, setComposeNotice] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')

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
          metadata: r.metadata as Record<string, unknown> | undefined,
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
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to send')
      }
      setComposeNotice('sent')
      setComposeForm({ to: '', subject: '', body: '' })
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
    try {
      const supabase = getSupabaseBrowserClient()
      await supabase.from('inbox_messages').update({ is_read: true }).eq('id', id)
    } catch { /* ignore */ }
  }

  const handleStar = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const msg = messages.find(m => m.id === id); if (!msg) return
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isStarred: !m.isStarred } : m))
    try {
      const supabase = getSupabaseBrowserClient()
      await supabase.from('inbox_messages').update({ is_starred: !msg.isStarred }).eq('id', id)
    } catch { /* ignore */ }
  }

  const listed = selectedFolder === 'clients' ? clientMessages
    : selectedFolder === 'invitations' ? invitations
    : selectedFolder === 'client-invites' ? clientInvites
    : selectedFolder === 'starred' ? messages.filter(m => m.isStarred)
    : messages

  const filtered = listed.filter(m =>
    m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.preview.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const counts: Record<string, number> = {
    inbox: messages.filter(m => !m.isRead).length,
    clients: clientMessages.filter(m => !m.isRead).length,
    invitations: invitations.filter(m => m.metadata?.status === 'pending').length,
    'client-invites': clientInvites.filter(m => m.metadata?.status === 'pending').length,
    starred: messages.filter(m => m.isStarred).length,
  }

  return (
    <div className={styles.inboxContainer}>

      {/* Compose modal */}
      {showCompose && (
        <div className={styles.composeOverlay} onClick={e => { if (e.target === e.currentTarget) setShowCompose(false)}}>
          <div className={styles.composeModal}>
            <div className={styles.composeHeader}>
              <span className={styles.composeTitle}>New Message</span>
              <button type="button" className={styles.composeClose} onClick={() => setShowCompose(false)}><X size={16}/></button>
            </div>
            <form onSubmit={handleComposeSend} className={styles.composeForm}>
              <div className={styles.composeField}>
                <label className={styles.composeLabel}>To</label>
                <input className={styles.composeInput} type="email" required placeholder="recipient@email.com"
                  value={composeForm.to} onChange={e => setComposeForm(f => ({ ...f, to: e.target.value }))}/>
              </div>
              <div className={styles.composeField}>
                <label className={styles.composeLabel}>Subject</label>
                <input className={styles.composeInput} type="text" required placeholder="Subject"
                  value={composeForm.subject} onChange={e => setComposeForm(f => ({ ...f, subject: e.target.value }))}/>
              </div>
              <div className={styles.composeBodyField}>
                <textarea className={styles.composeTextarea} rows={8} placeholder="Write your message…"
                  value={composeForm.body} onChange={e => setComposeForm(f => ({ ...f, body: e.target.value }))}/>
              </div>
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
                <button type="button" className={styles.composeCancelBtn} onClick={() => setShowCompose(false)}>Discard</button>
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
                    <button type="button" className={styles.deleteActionBtn} aria-label="Delete"><Trash2 size={16}/></button>
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
                <button type="button" className={styles.replyBtn}><Reply size={15}/>Reply</button>
                <button type="button" className={styles.forwardBtn}><Forward size={15}/>Forward</button>
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
