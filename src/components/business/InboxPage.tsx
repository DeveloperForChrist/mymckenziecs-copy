'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Mail, Send, FileText, Trash2, Archive, Star, Search, Reply, X, UserPlus, CheckCircle2, XCircle, Loader2, Paperclip, UploadCloud, RotateCcw } from 'lucide-react'
import styles from './inbox.module.css'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import { parseInboxAttachments, type InboxMessageAttachment } from '@/lib/inbox/attachments'
import { EMAIL_ATTACHMENT_ACCEPT, EMAIL_ATTACHMENT_LABEL, isAllowedEmailAttachment } from '@/lib/inbox/attachment-policy'
import WorkspaceLoadingState from './WorkspaceLoadingState'

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
  type: 'email' | 'invitation' | 'client_invite' | 'draft'
  isSentByBusiness?: boolean
  metadata?: {
    invitation_id?: string
    role?: string
    inviter_email?: string
    status?: string
    invited_email?: string
    client_name?: string
    accepted_at?: string | null
    fromClient?: boolean
    caseId?: string | null
    matterId?: string | null
    matterNumber?: string | null
    matterLabel?: string | null
    matterStage?: string | null
    matterStatus?: string | null
    deliveryMode?: 'portal' | 'direct'
    sentByBusinessDashboard?: boolean
    attachmentIds?: string[]
    attachments?: InboxMessageAttachment[]
  }
  deletedAt?: string | null
}

type SavedComposeDraft = {
  to: string
  subject: string
  body: string
  updatedAt: string
}

type ActiveClientOption = {
  id: string
  name: string
  email: string
  label: string
  updatedAt: string | null
}

type MatterOption = {
  id: string
  caseId: string | null
  email: string
  clientName: string
  matterNumber: string
  issueType: string
  status: 'active' | 'archived'
  stage: string
  lastActivity: string | null
}

type StoredDocumentOption = {
  id: string
  name: string
  mimeType: string | null
  fileSize: number | null
  createdAt: string | null
}

type ComposeDeliveryMode = 'portal' | 'direct'

type PendingComposeSend = {
  to: string
  subject: string
  body: string
  deliveryMode: ComposeDeliveryMode
  recipient: ActiveClientOption | null
  matter: MatterOption | null
  attachedFiles: File[]
  selectedDocumentIds: string[]
}

const COMPOSE_DRAFT_STORAGE_KEY = 'business-inbox-compose-draft-v1'
const SENT_MESSAGES_STORAGE_KEY = 'business-inbox-sent-messages-v1'

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

function mapInboxMessageRow(row: Record<string, unknown>, overrides?: { sentByBusiness?: boolean }): Message {
  const metadata = (row.metadata as Record<string, unknown> | undefined) || {}
  return {
    id: String(row.id),
    sender: String(row.sender_name || String(row.sender_email || '').split('@')[0] || 'Unknown'),
    senderEmail: String(row.sender_email || ''),
    subject: String(row.subject || ''),
    preview: String(row.content || '').slice(0, 100),
    content: String(row.content || ''),
    timestamp: fmtTime(String(row.created_at || new Date().toISOString())),
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    type: 'email',
    isSentByBusiness: Boolean(overrides?.sentByBusiness),
    deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    metadata: {
      ...metadata,
      fromClient: Boolean(metadata.fromClient),
      attachments: parseInboxAttachments(metadata),
    },
  }
}

function normalizeRecipient(value: string) {
  return value.trim().toLowerCase()
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

function hasMeaningfulComposeDraft(draft: { to: string; subject: string; body: string } | null | undefined) {
  if (!draft) return false
  return [draft.to, draft.subject, draft.body].some((value) => String(value || '').trim().length > 0)
}

function buildDraftMessage(draft: SavedComposeDraft): Message {
  return {
    id: 'local-compose-draft',
    sender: 'Saved draft',
    senderEmail: '',
    subject: draft.subject.trim() || '(No subject)',
    preview: draft.body.trim().slice(0, 100) || draft.to.trim() || 'Continue writing this draft.',
    content: draft.body,
    timestamp: '',
    isRead: true,
    isStarred: false,
    type: 'draft',
    metadata: {
      invited_email: draft.to,
    },
  }
}

function loadStoredMessages(key: string): Message[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is Message => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry) && typeof (entry as Message).id === 'string')
      .map((entry) => ({
        ...entry,
        sender: String(entry.sender || 'Unknown'),
        senderEmail: String(entry.senderEmail || ''),
        subject: String(entry.subject || ''),
        preview: String(entry.preview || '').slice(0, 100),
        content: String(entry.content || ''),
        timestamp: String(entry.timestamp || fmtTime(new Date().toISOString())),
        isRead: Boolean(entry.isRead),
        isStarred: Boolean(entry.isStarred),
        type: entry.type === 'draft' ? 'draft' : 'email',
        isSentByBusiness: Boolean(entry.isSentByBusiness),
        metadata: entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : undefined,
        deletedAt: typeof entry.deletedAt === 'string' ? entry.deletedAt : null,
      }))
  } catch {
    return []
  }
}

function saveStoredMessages(key: string, messages: Message[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(messages))
  } catch {
    // ignore localStorage failures
  }
}

function dedupeMessages(messages: Message[]) {
  const seen = new Set<string>()
  return messages.filter((message) => {
    if (seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
}

export default function InboxPage({
  composePreset,
}: {
  composePreset?: { to: string; subject?: string; body?: string; caseId?: string; matterLabel?: string } | null
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [clientMessages, setClientMessages] = useState<Message[]>([])
  const [sentMessages, setSentMessages] = useState<Message[]>([])
  const [invitations, setInvitations] = useState<Message[]>([])
  const [clientInvites, setClientInvites] = useState<Message[]>([])
  const [activeClients, setActiveClients] = useState<ActiveClientOption[]>([])
  const [activeClientsLoading, setActiveClientsLoading] = useState(false)
  const [activeClientsError, setActiveClientsError] = useState('')
  const [matterOptions, setMatterOptions] = useState<MatterOption[]>([])
  const [mattersLoading, setMattersLoading] = useState(false)
  const [_mattersError, setMattersError] = useState('')
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null)
  const [selectedFolder, setSelectedFolder] = useState('inbox')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [showClientInvite, setShowClientInvite] = useState(false)
  const [composeForm, setComposeForm] = useState({ to: '', subject: '', body: '' })
  const [recipientQuery, setRecipientQuery] = useState('')
  const [selectedRecipient, setSelectedRecipient] = useState<ActiveClientOption | null>(null)
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false)
  const [deliveryMode, setDeliveryMode] = useState<ComposeDeliveryMode>('direct')
  const [clientInviteForm, setClientInviteForm] = useState({ email: '', name: '' })
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [selectedMatter, setSelectedMatter] = useState<MatterOption | null>(null)
  const [composeCaseId, setComposeCaseId] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [queuedSend, setQueuedSend] = useState<PendingComposeSend | null>(null)
  const [inviteSending, setInviteSending] = useState(false)
  const [composeNotice, setComposeNotice] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')
  const [savedDraft, setSavedDraft] = useState<SavedComposeDraft | null>(null)
  const [existingDocuments, setExistingDocuments] = useState<StoredDocumentOption[]>([])
  const [existingDocumentsLoading, setExistingDocumentsLoading] = useState(false)
  const [existingDocumentsError, setExistingDocumentsError] = useState('')
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [documentPickerOpen, setDocumentPickerOpen] = useState(false)
  const [documentSearchQuery, setDocumentSearchQuery] = useState('')
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const queuedSendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetComposeAttachments = () => {
    setAttachedFiles([])
    setSelectedDocumentIds([])
    setExistingDocuments([])
    setExistingDocumentsError('')
    setExistingDocumentsLoading(false)
    setDocumentPickerOpen(false)
    setDocumentSearchQuery('')
    if (attachmentInputRef.current) attachmentInputRef.current.value = ''
  }

  const clearQueuedSend = () => {
    if (queuedSendTimeoutRef.current) {
      clearTimeout(queuedSendTimeoutRef.current)
      queuedSendTimeoutRef.current = null
    }
    setQueuedSend(null)
  }

  const persistComposeDraft = (draft: { to: string; subject: string; body: string } | null) => {
    if (typeof window === 'undefined') return
    if (!hasMeaningfulComposeDraft(draft)) {
      window.localStorage.removeItem(COMPOSE_DRAFT_STORAGE_KEY)
      setSavedDraft(null)
      return
    }

    const nextDraft = {
      to: draft?.to || '',
      subject: draft?.subject || '',
      body: draft?.body || '',
      updatedAt: new Date().toISOString(),
    } satisfies SavedComposeDraft

    window.localStorage.setItem(COMPOSE_DRAFT_STORAGE_KEY, JSON.stringify(nextDraft))
    setSavedDraft(nextDraft)
  }

  const resetRecipientPicker = () => {
    setActiveClients([])
    setActiveClientsError('')
    setActiveClientsLoading(false)
    setMatterOptions([])
    setMattersError('')
    setMattersLoading(false)
    setRecipientQuery('')
    setSelectedRecipient(null)
    setSelectedMatter(null)
    setRecipientPickerOpen(false)
    setDeliveryMode('direct')
  }

  const closeComposeModal = () => {
    if (hasMeaningfulComposeDraft(composeForm)) {
      persistComposeDraft(composeForm)
    }
    clearQueuedSend()
    setShowCompose(false)
    resetComposeAttachments()
    resetRecipientPicker()
    setComposeCaseId('')
    setComposeForm({ to: '', subject: '', body: '' })
    setComposeNotice('')
  }

  const openComposeDraft = (
    draft: { to: string; subject: string; body: string },
    message?: Message,
    context?: { caseId?: string; matterLabel?: string },
  ) => {
    if (message) {
      setSelectedFolder('inbox')
      setSelectedMsg(message)
    }
    setComposeNotice('')
    setComposeForm(draft)
    setRecipientQuery(draft.to)
    setSelectedRecipient(null)
    setSelectedMatter(null)
    setRecipientPickerOpen(false)
    setComposeCaseId((context?.caseId || '').trim())
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
      {
        caseId: typeof message.metadata?.caseId === 'string' ? message.metadata.caseId : '',
        matterLabel: typeof message.metadata?.matterNumber === 'string'
          ? message.metadata.matterNumber
          : typeof message.metadata?.matterLabel === 'string'
            ? message.metadata.matterLabel
            : '',
      },
    )
  }

  const openSavedDraft = () => {
    if (!savedDraft) return
    setComposeNotice('')
    setComposeForm({
      to: savedDraft.to,
      subject: savedDraft.subject,
      body: savedDraft.body,
    })
    setRecipientQuery(savedDraft.to)
    setSelectedRecipient(null)
    setSelectedMatter(null)
    setRecipientPickerOpen(Boolean(savedDraft.to.trim()))
    setShowCompose(true)
  }

  const filteredActiveClients = useMemo(() => {
    const term = normalizeRecipient(recipientQuery)
    if (!term) return activeClients
    return activeClients.filter((client) =>
      [client.name, client.email, client.label].some((value) => normalizeRecipient(value).includes(term))
    )
  }, [activeClients, recipientQuery])

  const visibleActiveClients = useMemo(() => filteredActiveClients.slice(0, 8), [filteredActiveClients])

  const recipientMatters = useMemo(() => {
    if (!selectedRecipient) return []
    return matterOptions.filter((matter) => normalizeRecipient(matter.email) === normalizeRecipient(selectedRecipient.email))
  }, [matterOptions, selectedRecipient])

  const requiresMatterSelection = Boolean(selectedRecipient && recipientMatters.length > 1 && !selectedMatter)
  const canAttachSavedDocuments = Boolean(selectedRecipient && selectedMatter?.caseId)
  const selectedStoredDocuments = useMemo(
    () => existingDocuments.filter((document) => selectedDocumentIds.includes(document.id)),
    [existingDocuments, selectedDocumentIds],
  )
  const filteredExistingDocuments = useMemo(() => {
    const term = documentSearchQuery.trim().toLowerCase()
    if (!term) return existingDocuments
    return existingDocuments.filter((document) =>
      [document.name, document.mimeType || '']
        .some((value) => value.toLowerCase().includes(term))
    )
  }, [documentSearchQuery, existingDocuments])
  const composeBusy = composeSending || Boolean(queuedSend)
  const draftMessage = savedDraft ? buildDraftMessage(savedDraft) : null

  const selectMatter = (matter: MatterOption | null) => {
    setSelectedMatter(matter)
    setComposeCaseId(matter?.caseId || '')
  }

  const selectRecipient = (client: ActiveClientOption) => {
    setSelectedRecipient(client)
    setRecipientQuery(client.email)
    setComposeForm((prev) => ({ ...prev, to: client.email }))
    selectMatter(null)
    setRecipientPickerOpen(false)
    setDeliveryMode('portal')
    setActiveClientsError('')
  }

  const clearRecipient = () => {
    setSelectedRecipient(null)
    selectMatter(null)
    setRecipientQuery('')
    setComposeForm((prev) => ({ ...prev, to: '' }))
    setRecipientPickerOpen(false)
    setDeliveryMode('direct')
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      void loadData()
    }, 60000)

    const onVisible = () => {
      if (!document.hidden) {
        void loadData()
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(COMPOSE_DRAFT_STORAGE_KEY)
      if (!rawDraft) return
      const parsed = JSON.parse(rawDraft) as Partial<SavedComposeDraft>
      if (!hasMeaningfulComposeDraft(parsed as SavedComposeDraft)) return
      setSavedDraft({
        to: String(parsed.to || ''),
        subject: String(parsed.subject || ''),
        body: String(parsed.body || ''),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      })
    } catch {
      window.localStorage.removeItem(COMPOSE_DRAFT_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (queuedSendTimeoutRef.current) {
        clearTimeout(queuedSendTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!showCompose || composeSending || queuedSend) return
    if (!hasMeaningfulComposeDraft(composeForm)) return

    const timeout = window.setTimeout(() => {
      persistComposeDraft(composeForm)
    }, 500)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [composeForm, composeSending, queuedSend, showCompose])

  useEffect(() => {
    if (!composePreset?.to) return
    setSelectedFolder('inbox')
    setSelectedMsg(null)
    setRecipientQuery(composePreset.to)
    setSelectedRecipient(null)
    setSelectedMatter(null)
    setRecipientPickerOpen(true)
    setComposeForm({
      to: composePreset.to,
      subject: composePreset.subject || '',
      body: composePreset.body || '',
    })
    setComposeCaseId((composePreset.caseId || '').trim())
    setDeliveryMode('direct')
    setShowCompose(true)
  }, [composePreset?.to, composePreset?.subject, composePreset?.body, composePreset?.caseId, composePreset?.matterLabel])

  useEffect(() => {
    if (!showCompose) return

    let cancelled = false
    const loadMatters = async () => {
      setMattersLoading(true)
      setMattersError('')
      try {
        const response = await fetch('/api/business/client-matters', {
          credentials: 'include',
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.message || 'Unable to load client matters.')
        }

        const nextMatters = (Array.isArray(payload?.matters) ? payload.matters : [])
          .map((matter: Record<string, unknown>) => {
            const email = normalizeRecipient(String(matter.email || ''))
            if (!email) return null
            return {
              id: String(matter.id || ''),
              caseId: typeof matter.caseId === 'string' ? matter.caseId : null,
              email,
              clientName: String(matter.clientName || 'Client').trim() || 'Client',
              matterNumber: String(matter.matterNumber || '').trim(),
              issueType: String(matter.issueType || 'Client matter').trim() || 'Client matter',
              status: String(matter.status || 'active') === 'archived' ? 'archived' : 'active',
              stage: String(matter.stage || '').trim(),
              lastActivity: typeof matter.lastActivity === 'string' ? matter.lastActivity : null,
            } satisfies MatterOption
          })
          .filter((matter: MatterOption | null): matter is MatterOption => Boolean(matter?.id))
          .sort((a: MatterOption, b: MatterOption) => {
            if (a.status !== b.status) return a.status === 'active' ? -1 : 1
            return String(b.lastActivity || '').localeCompare(String(a.lastActivity || ''))
          })

        if (!cancelled) {
          setMatterOptions(nextMatters)
        }
      } catch (err) {
        if (!cancelled) {
          setMatterOptions([])
          setMattersError(err instanceof Error ? err.message : 'Unable to load client matters.')
        }
      } finally {
        if (!cancelled) setMattersLoading(false)
      }
    }

    void loadMatters()
    return () => {
      cancelled = true
    }
  }, [composeForm.to, showCompose])

  useEffect(() => {
    if (!showCompose || !selectedRecipient) return

    const currentRecipientEmail = normalizeRecipient(selectedRecipient.email)
    const matchingMatters = matterOptions.filter((matter) => normalizeRecipient(matter.email) === currentRecipientEmail)
    const presetMatter = composeCaseId
      ? matchingMatters.find((matter) => matter.caseId === composeCaseId)
      : null

    if (presetMatter) {
      if (selectedMatter?.id !== presetMatter.id) {
        setSelectedMatter(presetMatter)
      }
      return
    }

    if (matchingMatters.length === 1) {
      const onlyMatter = matchingMatters[0]
      if (selectedMatter?.id !== onlyMatter.id) {
        selectMatter(onlyMatter)
      }
      return
    }

    if (matchingMatters.length === 0) {
      if (selectedMatter) selectMatter(null)
      return
    }

    if (selectedMatter && matchingMatters.some((matter) => matter.id === selectedMatter.id)) {
      return
    }

    selectMatter(null)
  }, [showCompose, selectedRecipient, matterOptions, composeCaseId, selectedMatter])

  useEffect(() => {
    if (!selectedRecipient && selectedMatter) {
      setSelectedMatter(null)
    }
  }, [selectedRecipient, selectedMatter])

  useEffect(() => {
    if (!showCompose) return
    const normalizedEmail = normalizeRecipient(composeForm.to)
    if (!normalizedEmail) {
      if (selectedRecipient) setSelectedRecipient(null)
      if (deliveryMode !== 'direct') setDeliveryMode('direct')
      return
    }

    const matchedClient = activeClients.find((client) => normalizeRecipient(client.email) === normalizedEmail) || null
    const previousEmail = selectedRecipient?.email || null

    if (matchedClient) {
      if (previousEmail !== matchedClient.email) {
        setSelectedRecipient(matchedClient)
        setDeliveryMode('portal')
      }
    } else {
      if (selectedRecipient) setSelectedRecipient(null)
      if (selectedMatter) setSelectedMatter(null)
      if (deliveryMode !== 'direct') setDeliveryMode('direct')
    }
  }, [activeClients, composeForm.to, deliveryMode, selectedMatter, selectedRecipient, showCompose])

  useEffect(() => {
    resetComposeAttachments()
  }, [selectedMatter?.id])

  useEffect(() => {
    if (!showCompose) return

    let cancelled = false
    const loadActiveClients = async () => {
      setActiveClientsLoading(true)
      setActiveClientsError('')
      try {
        const supabase = getSupabaseBrowserClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          throw new Error('Not authenticated')
        }

        const response = await fetch('/api/business/clients', {
          credentials: 'include',
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.message || 'Unable to load clients.')
        }

        const clients = Array.isArray(payload?.clients) ? payload.clients : []
        if (cancelled) return

        const nextClients: ActiveClientOption[] = clients
          .map((client: Record<string, unknown>) => {
            const email = normalizeRecipient(String(client.email || ''))
            if (!email) return null
            const name = String(client.name || email.split('@')[0] || 'Client').trim()
            return {
              id: String(client.id || email),
              name,
              email,
              label: String(client.label || `${name} <${email}>`),
              updatedAt: typeof client.updatedAt === 'string' ? client.updatedAt : null,
            } satisfies ActiveClientOption
          })
          .filter((client: ActiveClientOption | null): client is ActiveClientOption => client !== null)

        setActiveClients(nextClients)

        const initialRecipient = normalizeRecipient(composeForm.to)
        if (initialRecipient) {
          const matchedClient = nextClients.find((client) => normalizeRecipient(client.email) === initialRecipient)
          if (matchedClient) {
            setSelectedRecipient(matchedClient)
            setRecipientQuery(matchedClient.email)
            setComposeForm((prev) => ({ ...prev, to: matchedClient.email }))
            setDeliveryMode('portal')
          }
        }
      } catch (err) {
        if (!cancelled) {
          setActiveClients([])
          setActiveClientsError(err instanceof Error ? err.message : 'Unable to load clients.')
        }
      } finally {
        if (!cancelled) setActiveClientsLoading(false)
      }
    }

    void loadActiveClients()
    return () => {
      cancelled = true
    }
  }, [composeForm.to, showCompose])

  const loadExistingDocuments = async (caseId: string) => {
    setExistingDocumentsLoading(true)
    setExistingDocumentsError('')
    try {
      const response = await fetch(`/api/documents?caseId=${encodeURIComponent(caseId)}&limit=50`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to load related documents.')
      }

      const nextDocuments = (Array.isArray(payload?.documents) ? payload.documents : [])
        .map((document: Record<string, unknown>) => ({
          id: String(document.id || ''),
          name: String(document.name || 'Document'),
          mimeType: typeof document.mime_type === 'string' ? document.mime_type : null,
          fileSize: typeof document.file_size === 'number' ? document.file_size : null,
          createdAt: typeof document.created_at === 'string' ? document.created_at : null,
        } satisfies StoredDocumentOption))
        .filter((document: StoredDocumentOption) => Boolean(document.id))

      setExistingDocuments(nextDocuments)
    } catch (err) {
      setExistingDocuments([])
      setExistingDocumentsError(err instanceof Error ? err.message : 'Unable to load related documents.')
    } finally {
      setExistingDocumentsLoading(false)
    }
  }

  const toggleStoredDocument = (documentId: string) => {
    setSelectedDocumentIds((prev) =>
      prev.includes(documentId)
        ? prev.filter((id) => id !== documentId)
        : [...prev, documentId],
    )
  }

  const removeAttachedFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, idx) => idx !== index))
  }

  const getDeliveryLabel = (message: Message) => {
    const mode = message.metadata?.deliveryMode
    if (mode === 'portal') return 'Portal'
    if (mode === 'direct') return 'Direct'
    return null
  }

  async function loadData() {
    setLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const [{ data: sessionData }, { data: userData }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ])
      const session = sessionData.session
      const user = userData.user

      if (!session?.access_token || !user?.email) {
        setMessages([])
        setClientMessages([])
        setSentMessages([])
        setInvitations([])
        setClientInvites([])
        return
      }

      const inboxResponse = await fetch('/api/business/inbox', {
        credentials: 'include',
        cache: 'no-store',
      })
      const inboxPayload = await inboxResponse.json().catch(() => ({}))
      if (!inboxResponse.ok) {
        throw new Error(inboxPayload?.message || 'Unable to load inbox messages.')
      }

      const allMessages: Message[] = Array.isArray(inboxPayload?.messages)
        ? inboxPayload.messages.map((row: Record<string, unknown>) => mapInboxMessageRow(row))
        : []
      const allSentMessages: Message[] = Array.isArray(inboxPayload?.sentMessages)
        ? inboxPayload.sentMessages
            .map((row: Record<string, unknown>) => mapInboxMessageRow(row, { sentByBusiness: true }))
            .filter((message: Message) => {
              const sentSenderEmail = normalizeEmail(message.senderEmail)
              const currentUserEmail = normalizeEmail(user.email)
              return sentSenderEmail === currentUserEmail || Boolean(message.isSentByBusiness)
            })
        : []
      const storedSentMessages = loadStoredMessages(SENT_MESSAGES_STORAGE_KEY)
      const mergedSentMessages = dedupeMessages([...allSentMessages, ...storedSentMessages])

      setMessages(allMessages.filter((m: Message) => !m.metadata?.fromClient))
      setClientMessages(allMessages.filter((m: Message) => m.metadata?.fromClient))
      setSentMessages(mergedSentMessages)
      saveStoredMessages(SENT_MESSAGES_STORAGE_KEY, mergedSentMessages)

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
              data.invitations.map((inv: Record<string, unknown>) => {
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

  const performComposeSend = async (pending: PendingComposeSend) => {
    setComposeSending(true)
    setComposeNotice('')

    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const recipientEmail = normalizeRecipient(pending.to)
      if (!recipientEmail) {
        throw new Error('Enter an email address first.')
      }

      if (!pending.subject.trim()) {
        throw new Error('Add a subject before sending.')
      }

      if (!pending.body.trim()) {
        throw new Error('Write a message before sending.')
      }

      if (pending.deliveryMode === 'portal' && !pending.recipient) {
        throw new Error('Choose a linked client for secure portal delivery.')
      }

      if (pending.selectedDocumentIds.length > 0 && !pending.matter?.caseId) {
        throw new Error('Choose a linked matter before attaching saved client documents.')
      }

      let attachmentIds = [...pending.selectedDocumentIds]
      if (pending.attachedFiles.length > 0) {
        const formData = new FormData()
        pending.attachedFiles.forEach((file) => formData.append('files', file))
        formData.append('source', 'business-inbox-attachment')
        if (pending.matter?.caseId) {
          formData.append('caseId', pending.matter.caseId)
        }

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
        if (uploadedDocs.length !== pending.attachedFiles.length) {
          throw new Error('One or more attachments could not be uploaded.')
        }

        attachmentIds = [
          ...attachmentIds,
          ...uploadedDocs.map((doc: Record<string, unknown>) => String(doc.id || '')).filter(Boolean),
        ]
      }

      const response = await fetch('/api/business/inbox/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject: pending.subject,
          body: pending.body,
          attachmentIds,
          matterId: pending.matter?.id || undefined,
          caseId: pending.matter?.caseId || undefined,
          deliveryMode: pending.deliveryMode,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to send')
      }

      const sentMessage: Message = {
        id: `sent-${Date.now()}`,
        sender: 'Me',
        senderEmail: recipientEmail,
        subject: pending.subject,
        preview: pending.body.slice(0, 100),
        content: pending.body,
        timestamp: fmtTime(new Date().toISOString()),
        isRead: true,
        isStarred: false,
        type: 'email',
        isSentByBusiness: true,
        metadata: {
          sentByBusinessDashboard: true,
          deliveryMode: pending.deliveryMode,
          invited_email: recipientEmail,
          matterId: pending.matter?.id || null,
          caseId: pending.matter?.caseId || null,
          matterNumber: pending.matter?.matterNumber || null,
          matterLabel: pending.matter?.matterNumber || pending.matter?.issueType || null,
        },
      }
      setSentMessages((prev) => {
        const next = dedupeMessages([sentMessage, ...prev])
        saveStoredMessages(SENT_MESSAGES_STORAGE_KEY, next)
        return next
      })

      setComposeNotice('sent')
      persistComposeDraft(null)
      setComposeForm({ to: '', subject: '', body: '' })
      resetComposeAttachments()
      void loadData()
      setTimeout(() => { closeComposeModal() }, 1500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send'
      if (/row-level security policy for table "documents"/i.test(msg) || /failed to upload attachments/i.test(msg)) {
        setComposeNotice('Document uploads are blocked by database permissions right now. You can still send the message without attachments.')
      } else {
        setComposeNotice(msg.includes('does not exist') ? 'DB not set up yet — see code comment for SQL.' : msg)
      }
    } finally {
      clearQueuedSend()
      setComposeSending(false)
    }
  }

  const queueComposeSend = (pending: PendingComposeSend) => {
    clearQueuedSend()
    setQueuedSend(pending)
    setComposeNotice('')
    queuedSendTimeoutRef.current = setTimeout(() => {
      void performComposeSend(pending)
    }, 5000)
  }

  const handleComposeSend = async (e: React.FormEvent) => {
    e.preventDefault()

    const recipientEmail = normalizeRecipient(composeForm.to)
    if (!recipientEmail) {
      setComposeNotice('Enter an email address first.')
      return
    }

    const matchedRecipient = activeClients.find((client) => normalizeRecipient(client.email) === recipientEmail) || null
    const matchingMatters = matchedRecipient
      ? matterOptions.filter((matter) => normalizeRecipient(matter.email) === matchedRecipient.email)
      : []
    const resolvedMatter = selectedMatter || (matchingMatters.length === 1 ? matchingMatters[0] : null)

    if (selectedDocumentIds.length > 0 && !resolvedMatter?.caseId) {
      setComposeNotice('Choose a linked matter before attaching saved client documents.')
      return
    }

    if (deliveryMode === 'portal' && !matchedRecipient) {
      setComposeNotice('Portal delivery is only available for linked active clients.')
      return
    }

    if (composeForm.subject.trim().length === 0) {
      setComposeNotice('Add a subject before sending.')
      return
    }

    if (composeForm.body.trim().length === 0) {
      setComposeNotice('Write a message before sending.')
      return
    }

    queueComposeSend({
      to: recipientEmail,
      subject: composeForm.subject,
      body: composeForm.body,
      deliveryMode: matchedRecipient && deliveryMode === 'portal' ? 'portal' : 'direct',
      recipient: matchedRecipient,
      matter: resolvedMatter,
      attachedFiles: [...attachedFiles],
      selectedDocumentIds: [...selectedDocumentIds],
    })
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
  const activeSentMessages = sentMessages.filter(m => !m.deletedAt)
  const trashedMessages = [...messages, ...clientMessages].filter(m => Boolean(m.deletedAt))

  const listed = selectedFolder === 'clients' ? activeClientMessages
    : selectedFolder === 'invitations' ? invitations
    : selectedFolder === 'client-invites' ? clientInvites
    : selectedFolder === 'sent' ? activeSentMessages
    : selectedFolder === 'drafts' ? (draftMessage ? [draftMessage] : [])
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
    sent: activeSentMessages.length,
    drafts: draftMessage ? 1 : 0,
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
                  closeComposeModal()
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
                  closeComposeModal()
                }}
              >
                <X size={16}/>
              </button>
            </div>
            <form onSubmit={handleComposeSend} className={styles.composeForm}>
              <div className={styles.composeField}>
                <label className={styles.composeLabel}>To:</label>
                <div className={styles.clientPickerControls}>
                  <input
                    className={styles.composeInput}
                    type="email"
                    required
                    placeholder="client@email.com"
                    value={composeForm.to}
                    onFocus={() => {
                      if (recipientQuery.trim()) setRecipientPickerOpen(true)
                    }}
                    onChange={(event) => {
                      const next = event.target.value
                      setComposeForm((prev) => ({ ...prev, to: next }))
                      setRecipientQuery(next)
                      setRecipientPickerOpen(Boolean(next.trim()))
                      setComposeNotice('')
                    }}
                    autoComplete="off"
                    disabled={composeBusy}
                  />
                  {selectedRecipient && (
                    <button type="button" className={styles.clientPickerClearBtn} onClick={clearRecipient} disabled={composeBusy}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {recipientPickerOpen && recipientQuery.trim() && visibleActiveClients.length > 0 && (
                <div className={styles.clientPickerPanel}>
                  <div className={styles.clientPickerList} role="listbox" aria-label="Active clients">
                    {visibleActiveClients.map((client) => {
                      const active = selectedRecipient?.email === client.email
                      return (
                        <button
                          key={client.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={active ? styles.clientPickerOptionActive : styles.clientPickerOption}
                          onClick={() => selectRecipient(client)}
                        >
                          <div className={styles.clientPickerOptionMain}>
                            <span className={styles.clientPickerOptionName}>{client.name}</span>
                            <span className={styles.clientPickerOptionEmail}>{client.email}</span>
                          </div>
                          <span className={styles.clientPickerOptionLabel}>Use client</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {((composeForm.to.trim().length > 0) || selectedRecipient) && (activeClientsLoading || activeClientsError || selectedRecipient) && (
                <div className={styles.composeMetaCard}>
                  {activeClientsLoading ? (
                    <WorkspaceLoadingState variant="inline" label="Loading linked clients…" className={styles.composeMetaInline} />
                  ) : activeClientsError ? (
                    <div className={styles.documentPickerError}>{activeClientsError}</div>
                  ) : selectedRecipient ? (
                    <>
                      <div className={styles.composeMetaRow}>
                        <div className={styles.composeMetaCopy}>
                          <span className={styles.composeMetaEyebrow}>Linked client</span>
                          <strong className={styles.composeMetaTitle}>{selectedRecipient.name}</strong>
                          <span className={styles.composeMetaText}>{selectedRecipient.email}</span>
                        </div>
                        <div className={styles.composeDeliveryModes}>
                          <button
                            type="button"
                            className={deliveryMode === 'portal' ? styles.composeModeBtnActive : styles.composeModeBtn}
                            onClick={() => setDeliveryMode('portal')}
                            disabled={composeBusy}
                          >
                            Portal message
                          </button>
                          <button
                            type="button"
                            className={deliveryMode === 'direct' ? styles.composeModeBtnActive : styles.composeModeBtn}
                            onClick={() => setDeliveryMode('direct')}
                            disabled={composeBusy}
                          >
                            Direct email
                          </button>
                        </div>
                      </div>
                      <div className={styles.composeMetaRow}>
                        <div className={styles.composeMetaCopy}>
                          <span className={styles.composeMetaEyebrow}>Matter</span>
                          <span className={styles.composeMetaText}>
                            {mattersLoading
                              ? 'Loading linked matters...'
                              : recipientMatters.length === 0
                                ? 'No linked matter yet. You can still send a general message.'
                                : 'Choose the right matter if this message belongs to a specific case.'}
                          </span>
                        </div>
                        {recipientMatters.length > 0 && (
                          <select
                            className={styles.composeMatterSelect}
                            value={selectedMatter?.id || ''}
                            onChange={(event) => {
                              const nextMatter = recipientMatters.find((matter) => matter.id === event.target.value) || null
                              selectMatter(nextMatter)
                            }}
                            disabled={composeBusy || mattersLoading}
                          >
                            <option value="">
                              {recipientMatters.length > 1 ? 'Select matter' : 'General client message'}
                            </option>
                            {recipientMatters.map((matter) => (
                              <option key={matter.id} value={matter.id}>
                                {matter.matterNumber || matter.issueType}
                                {matter.stage ? ` - ${matter.stage}` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      {selectedMatter && (
                        <div className={styles.matterPickerSelected}>
                          {selectedMatter.matterNumber || selectedMatter.issueType}
                          {selectedMatter.stage ? ` • Stage: ${selectedMatter.stage}` : ''}
                        </div>
                      )}
                      {requiresMatterSelection && (
                        <div className={styles.matterPickerRequired}>
                          Choose the correct matter if you want to attach saved documents from the client record.
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              )}
              <div className={styles.composeField}>
                <label className={styles.composeLabel}>Subject:</label>
                <input
                  className={styles.composeInput}
                  type="text"
                  required
                  placeholder="Subject"
                  value={composeForm.subject}
                  onChange={e => setComposeForm(f => ({ ...f, subject: e.target.value }))}
                  disabled={composeBusy}
                />
              </div>
              <div className={styles.composeBodyField}>
                <textarea
                  className={styles.composeTextarea}
                  rows={8}
                  placeholder="Write your message..."
                  value={composeForm.body}
                  onChange={e => setComposeForm(f => ({ ...f, body: e.target.value }))}
                  disabled={composeBusy}
                />
              </div>
              {(attachedFiles.length > 0 || selectedStoredDocuments.length > 0 || documentPickerOpen) && (
                <div className={styles.composeAttachmentsPanel}>
                  {(attachedFiles.length > 0 || selectedStoredDocuments.length > 0) && (
                    <div className={styles.attachmentList}>
                      {attachedFiles.map((file, index) => (
                        <span key={`${file.name}-${file.size}-${index}`} className={styles.attachmentChip}>
                          <Paperclip size={13} />
                          <span className={styles.attachmentChipName}>{file.name}</span>
                          <button
                            type="button"
                            className={styles.attachmentChipRemove}
                            onClick={() => removeAttachedFile(index)}
                            aria-label={`Remove ${file.name}`}
                            disabled={composeBusy}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      {selectedStoredDocuments.map((document) => (
                        <span key={document.id} className={styles.attachmentChip}>
                          <FileText size={13} />
                          <span className={styles.attachmentChipName}>{document.name}</span>
                          <button
                            type="button"
                            className={styles.attachmentChipRemove}
                            onClick={() => toggleStoredDocument(document.id)}
                            aria-label={`Remove ${document.name}`}
                            disabled={composeBusy}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {documentPickerOpen && (
                    <div className={styles.documentPicker}>
                      <div className={styles.documentPickerHeader}>
                        <div className={styles.documentPickerHeaderCopy}>
                          <span className={styles.documentPickerLabel}>Related documents</span>
                          <span className={styles.documentPickerMeta}>
                            {selectedMatter?.matterNumber || selectedMatter?.issueType || 'Client matter'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={styles.composeSectionToggle}
                          onClick={() => setDocumentPickerOpen(false)}
                          disabled={composeBusy}
                        >
                          Close
                        </button>
                      </div>
                      <div className={styles.documentPickerSearch}>
                        <Search size={14} className={styles.searchIcon} />
                        <input
                          type="text"
                          value={documentSearchQuery}
                          onChange={(event) => setDocumentSearchQuery(event.target.value)}
                          placeholder="Search client documents"
                          className={styles.documentPickerSearchInput}
                          disabled={composeBusy || existingDocumentsLoading}
                        />
                      </div>
                      {existingDocumentsLoading ? (
                        <WorkspaceLoadingState variant="inline" label="Loading documents..." className={styles.documentPickerEmpty} />
                      ) : existingDocumentsError ? (
                        <div className={styles.documentPickerError}>{existingDocumentsError}</div>
                      ) : existingDocuments.length === 0 ? (
                        <div className={styles.documentPickerEmpty}>No saved documents are linked to this matter yet.</div>
                      ) : filteredExistingDocuments.length === 0 ? (
                        <div className={styles.documentPickerEmpty}>No client documents match this search.</div>
                      ) : (
                        <div className={styles.documentPickerList}>
                          {filteredExistingDocuments.map((document) => {
                            const selected = selectedDocumentIds.includes(document.id)
                            return (
                              <button
                                key={document.id}
                                type="button"
                                className={selected ? styles.documentPickerItemActive : styles.documentPickerItem}
                                onClick={() => toggleStoredDocument(document.id)}
                                disabled={composeBusy}
                              >
                                <div className={styles.documentPickerInfo}>
                                  <span className={styles.documentPickerName}>{document.name}</span>
                                  <span className={styles.documentPickerSub}>
                                    {document.mimeType || 'Document'}
                                  </span>
                                </div>
                                <span className={styles.documentPickerSelected}>
                                  {selected ? 'Attached' : 'Attach'}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {composeNotice && (
                <p className={composeNotice === 'sent' ? styles.composeSentNotice : styles.composeErrorNotice}>
                  {composeNotice === 'sent' ? 'Message sent!' : composeNotice}
                </p>
              )}
              {queuedSend && (
                <div className={styles.composeQueuedNotice}>
                  <span>
                    {queuedSend.deliveryMode === 'portal'
                      ? 'Secure portal message queued. Sending in 5 seconds.'
                      : 'Direct email queued. Sending in 5 seconds.'}
                  </span>
                  <button type="button" className={styles.composeUndoBtn} onClick={clearQueuedSend}>
                    Undo
                  </button>
                </div>
              )}
              <div className={styles.composeActions}>
                <div className={styles.composeActionTools}>
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
                        const validFiles = files.filter((file) => isAllowedEmailAttachment({ name: file.name, mimeType: file.type || null }))
                        const rejectedCount = files.length - validFiles.length
                        if (rejectedCount > 0) {
                          setComposeNotice(`Only ${EMAIL_ATTACHMENT_LABEL} are allowed as email attachments.`)
                        }
                        if (validFiles.length > 0) {
                          setAttachedFiles((prev) => [...prev, ...validFiles])
                        }
                        event.target.value = ''
                      }}
                      accept={EMAIL_ATTACHMENT_ACCEPT}
                      disabled={composeBusy}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.composeSecondaryBtn}
                    disabled={!canAttachSavedDocuments || composeBusy}
                    onClick={() => {
                      if (!selectedMatter?.caseId) return
                      const nextOpen = !documentPickerOpen
                      setDocumentPickerOpen(nextOpen)
                      if (nextOpen && existingDocuments.length === 0 && !existingDocumentsLoading) {
                        void loadExistingDocuments(selectedMatter.caseId)
                      }
                    }}
                  >
                    <FileText size={14} />
                    From client docs
                  </button>
                </div>
                <div className={styles.composeActionButtons}>
                  <button
                    type="button"
                    className={styles.composeCancelBtn}
                    onClick={() => {
                      closeComposeModal()
                    }}
                    disabled={composeSending}
                  >
                    Discard
                  </button>
                  <button type="submit" className={styles.composeSendBtn} disabled={composeBusy}>
                    {composeSending ? <Loader2 size={14} className={styles.spin}/> : <Send size={14}/>}
                    {queuedSend ? 'Queued...' : composeSending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
              <p className={styles.composeHint} role="note">
                {selectedRecipient && deliveryMode === 'portal'
                  ? 'The client receives an email notification and replies inside their secure portal.'
                  : 'Direct email sends to the address shown above. Undo is only available during the 5 second send delay.'}
              </p>
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
            <button
              className={styles.composeButton}
              onClick={() => {
                setComposeCaseId('')
                resetComposeAttachments()
                if (savedDraft) {
                  openSavedDraft()
                } else {
                  setShowCompose(true)
                }
              }}
            >
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
                {f.id === 'inbox' && cnt > 0 && <span className={styles.folderCount}>{cnt}</span>}
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
          {loading && <WorkspaceLoadingState variant="panel" label="Loading…" className={styles.emptyState} />}
          {!loading && filtered.length === 0 && <div className={styles.emptyState}><Mail size={32}/><p>No messages here</p></div>}
          {filtered.map(msg => (
            <div key={msg.id} role="button" tabIndex={0}
              className={`${styles.emailItem} ${selectedMsg?.id === msg.id ? styles.emailItemSelected : ''} ${!msg.isRead ? styles.emailItemUnread : ''} ${msg.type === 'invitation' ? styles.emailItemInvitation : ''} ${msg.type === 'client_invite' ? styles.emailItemClientInvite : ''}`}
              onClick={() => {
                if (msg.type === 'draft') {
                  openSavedDraft()
                  return
                }
                setSelectedMsg(msg)
                if (!msg.isRead && msg.type === 'email') handleMarkAsRead(msg.id)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (msg.type === 'draft') {
                    openSavedDraft()
                    return
                  }
                  setSelectedMsg(msg)
                }
              }}>
              <div className={styles.emailItemRow}>
                <span className={styles.senderName}>{msg.sender}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {msg.type !== 'draft' && (
                    <span className={styles.emailItemTimestamp}>{msg.timestamp}</span>
                  )}
                  {msg.type === 'email' && !msg.isSentByBusiness ? (
                    <button type="button" className={`${styles.starButtonSmall} ${msg.isStarred ? styles.starActive : ''}`} onClick={e => handleStar(msg.id, e)} aria-label="Star"><Star size={13} fill={msg.isStarred ? 'currentColor' : 'none'}/></button>
                  ) : msg.type === 'draft' ? (
                    <span className={styles.deliveryBadgeDraft}>Draft</span>
                  ) : (
                    <span className={msg.isSentByBusiness && getDeliveryLabel(msg)
                      ? (getDeliveryLabel(msg) === 'Portal' ? styles.deliveryBadgePortal : styles.deliveryBadgeDirect)
                      : styles.inviteBadge}>
                      {msg.isSentByBusiness
                        ? getDeliveryLabel(msg) || 'Sent'
                        : msg.type === 'invitation'
                          ? (msg.metadata?.status === 'accepted' ? '✓' : msg.metadata?.status === 'declined' ? '✗' : '·')
                          : (msg.metadata?.status === 'accepted' ? '✓' : '·')}
                    </span>
                  )}
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
                {selectedMsg.type === 'email' && !selectedMsg.isSentByBusiness && (
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
                    <span className={styles.previewSenderEmail}>
                      {selectedMsg.type === 'draft'
                        ? savedDraft?.to || 'No recipient yet'
                        : selectedMsg.senderEmail}
                    </span>
                  </div>
                </div>
                {selectedMsg.type !== 'draft' && (
                  <span className={styles.previewTimestamp}>{selectedMsg.timestamp}</span>
                )}
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

              {selectedMsg.type === 'draft' && (
                <div className={styles.invitationActions}>
                  <p className={styles.invitationPrompt}>This draft is saved locally and has not been sent yet.</p>
                  <div className={styles.invitationButtons}>
                    <button type="button" className={styles.replyBtn} onClick={openSavedDraft}>
                      <FileText size={15} />
                      Resume draft
                    </button>
                    <button
                      type="button"
                      className={styles.declineBtn}
                      onClick={() => {
                        persistComposeDraft(null)
                        if (selectedMsg?.type === 'draft') setSelectedMsg(null)
                      }}
                    >
                      <Trash2 size={14} />
                      Delete draft
                    </button>
                  </div>
                </div>
              )}
            </div>

            {selectedMsg.type === 'email' && !selectedMsg.isSentByBusiness && (
              <div className={styles.previewFooter}>
                <button type="button" className={styles.replyBtn} onClick={() => openReply(selectedMsg)}><Reply size={15}/>Reply</button>
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
