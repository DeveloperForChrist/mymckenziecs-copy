'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import {
  Mail,
  FileText,
  Calendar,
  Clock,
  User,
  MessageSquare,
  Video,
  ShieldCheck,
  UploadCloud,
  Paperclip,
  X,
  Loader2,
  ExternalLink,
  FolderOpen,
  Archive,
  CheckCircle2,
  RefreshCcw,
} from 'lucide-react'
import Link from 'next/link'
import styles from './clientPortal.module.css'
import { parseInboxAttachments, type InboxMessageAttachment } from '@/lib/inbox/attachments'
import type { LucideIcon } from 'lucide-react'

interface MatterSummary {
  id: string
  caseId: string | null
  matterNumber: string
  issueType: string
  urgency: string
  summary: string
  fullDetails: string
  phone: string
  location: string
  courtDate: string | null
  opposing: string
  documents: string[]
  tags: string[]
  status: string
  stage: string
  owner: string
  nextAction: string
  nextDeadline: string | null
  acceptedAt: string | null
  lastActivityAt: string | null
  currentBalance: number
}

interface BusinessLink {
  id: string
  business_id: string
  client_name: string
  status: string
  business_name: string
  has_open_matter: boolean
  is_closed: boolean
  latestMatterId: string | null
  lastActivityAt: string | null
  matters: MatterSummary[]
}

interface Message {
  id: string
  sender: string
  senderEmail: string
  subject: string
  content: string
  timestamp: string
  isRead: boolean
  businessId: string | null
  matterId: string | null
  caseId: string | null
  matterLabel: string | null
  attachments?: InboxMessageAttachment[]
}

interface ClientDocument {
  id: string
  name: string
  createdAt: string
  size: number
  mimeType: string
  sourceLabel?: string
  businessId?: string | null
  matterId?: string | null
  caseId?: string | null
  matterLabel?: string | null
}

type PreviewDocument = ClientDocument

interface ClientMeeting {
  id: string
  title: string
  description: string
  meetingDate: string
  meetingTime: string
  durationMinutes: number
  roomName: string
  status: string
  businessId: string
  businessName: string
  matterId?: string | null
  caseId?: string | null
  matterLabel?: string | null
  matterStage?: string | null
}

interface SyncTarget {
  businessId: string
  businessName: string
  caseId: string
  matterId: string
  matterLabel: string
}

type PortalTab = 'messages' | 'meetings' | 'documents' | 'matter'

function normalizeTab(value: string | null | undefined): PortalTab {
  if (value === 'messages' || value === 'meetings' || value === 'documents' || value === 'matter') return value
  return 'messages'
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatMatterLabel(matter: MatterSummary | null | undefined) {
  if (!matter) return 'General portal history'
  return matter.matterNumber || matter.issueType || 'Client matter'
}

function formatStageLabel(value: string | null | undefined) {
  const normalized = String(value || '').trim()
  if (!normalized) return 'Not set'
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatStatusLabel(value: string | null | undefined) {
  return formatStageLabel(value)
}

function formatUrgencyLabel(value: string | null | undefined) {
  return formatStageLabel(value)
}

function formatCurrency(value: number | null | undefined) {
  const amount = typeof value === 'number' ? value : Number(value || 0)
  if (!Number.isFinite(amount)) return 'Not recorded'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 2,
  }).format(amount)
}

function ClientPortalContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [businessLinks, setBusinessLinks] = useState<BusinessLink[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [documents, setDocuments] = useState<ClientDocument[]>([])
  const [sharedPortalDocuments, setSharedPortalDocuments] = useState<ClientDocument[]>([])
  const [meetings, setMeetings] = useState<ClientMeeting[]>([])
  const [syncTargets, setSyncTargets] = useState<SyncTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTab, setSelectedTab] = useState<PortalTab>('messages')
  const [showCompose, setShowCompose] = useState(false)
  const [composeForm, setComposeForm] = useState({ subject: '', content: '' })
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('')
  const [selectedMatterId, setSelectedMatterId] = useState<string>('')
  const [composeMatterId, setComposeMatterId] = useState<string>('')
  const [showArchivedMatters, setShowArchivedMatters] = useState(false)
  const [composeSending, setComposeSending] = useState(false)
  const [composeNotice, setComposeNotice] = useState('')
  const [leavingLinkId, setLeavingLinkId] = useState<string | null>(null)
  const [portalNotice, setPortalNotice] = useState('')
  const [portalUploading, setPortalUploading] = useState(false)
  const [portalUploadNotice, setPortalUploadNotice] = useState('')
  const [syncNotice, setSyncNotice] = useState('')
  const [syncingDocumentId, setSyncingDocumentId] = useState<string | null>(null)
  const [previewDocument, setPreviewDocument] = useState<PreviewDocument | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const portalUploadInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSelectedTab(normalizeTab(searchParams?.get('tab')))
  }, [searchParams])

  const businessById = useMemo(() => new Map(businessLinks.map((link) => [link.business_id, link])), [businessLinks])

  const selectedBusiness = useMemo(() => {
    if (!selectedBusinessId) return businessLinks[0] || null
    return businessLinks.find((link) => link.business_id === selectedBusinessId) || businessLinks[0] || null
  }, [businessLinks, selectedBusinessId])

  const visibleMatterOptions = useMemo(() => {
    const matters = selectedBusiness?.matters || []
    if (showArchivedMatters) return matters
    return matters.filter((matter) => matter.status !== 'archived' && matter.stage !== 'closed')
  }, [selectedBusiness, showArchivedMatters])

  const selectedMatter = useMemo(() => {
    const matters = selectedBusiness?.matters || []
    if (!matters.length) return null
    if (selectedMatterId) {
      return matters.find((matter) => matter.id === selectedMatterId) || null
    }
    return matters.find((matter) => matter.status !== 'archived' && matter.stage !== 'closed') || matters[0] || null
  }, [selectedBusiness, selectedMatterId])

  const activeSyncTarget = useMemo(() => {
    if (!selectedBusiness) return null
    if (selectedMatter) {
      return syncTargets.find((target) => target.businessId === selectedBusiness.business_id && target.matterId === selectedMatter.id) || null
    }
    return syncTargets.find((target) => target.businessId === selectedBusiness.business_id) || null
  }, [selectedBusiness, selectedMatter, syncTargets])

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
          businessId: message.businessId,
          matterId: message.matterId,
          caseId: message.caseId,
          matterLabel: message.matterLabel,
          sourceLabel: 'Message attachment',
        })
      })
    })
    return Array.from(seen.values())
  }, [messages, sharedPortalDocuments])

  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      if (selectedBusiness && message.businessId && message.businessId !== selectedBusiness.business_id) return false
      if (selectedMatter && message.matterId && message.matterId !== selectedMatter.id) return false
      if (selectedMatter && message.caseId && selectedMatter.caseId && message.caseId !== selectedMatter.caseId) return false
      return true
    })
  }, [messages, selectedBusiness, selectedMatter])

  const filteredMeetings = useMemo(() => {
    return meetings.filter((meeting) => {
      if (selectedBusiness && meeting.businessId && meeting.businessId !== selectedBusiness.business_id) return false
      if (selectedMatter && meeting.matterId && meeting.matterId !== selectedMatter.id) return false
      if (selectedMatter && meeting.caseId && selectedMatter.caseId && meeting.caseId !== selectedMatter.caseId) return false
      return true
    })
  }, [meetings, selectedBusiness, selectedMatter])

  const filteredSharedDocuments = useMemo(() => {
    return sharedDocuments.filter((doc) => {
      if (selectedBusiness && doc.businessId && doc.businessId !== selectedBusiness.business_id) return false
      if (selectedMatter && doc.matterId && doc.matterId !== selectedMatter.id) return false
      if (selectedMatter && doc.caseId && selectedMatter.caseId && doc.caseId !== selectedMatter.caseId) return false
      return true
    })
  }, [sharedDocuments, selectedBusiness, selectedMatter])

  const unreadMessageCount = messages.filter((message) => !message.isRead).length
  const upcomingMeetingCount = meetings.length
  const connectedProfessionalCount = businessLinks.length
  const portalIntroText =
    'Secure messages stay in the portal. Email only sends a sign-in prompt, while case history, meetings, and shared documents stay organised by professional and matter.'
  const portalCards: Array<{
    tab: PortalTab
    icon: LucideIcon
    title: string
    desc: string
    color: string
    alertCount?: number
  }> = [
    {
      tab: 'messages',
      icon: MessageSquare,
      title: 'Messages',
      desc: 'Read secure messages and reply to your professional.',
      color: '#2563eb,#60a5fa',
      alertCount: unreadMessageCount,
    },
    {
      tab: 'meetings',
      icon: Video,
      title: 'Meetings',
      desc: 'Open your scheduled calls and review meeting details.',
      color: '#ea580c,#fb923c',
      alertCount: upcomingMeetingCount,
    },
    {
      tab: 'documents',
      icon: FileText,
      title: 'Documents',
      desc: 'Open shared files and upload documents into the portal.',
      color: '#0f766e,#2dd4bf',
      alertCount: documents.length + sharedPortalDocuments.length,
    },
    {
      tab: 'matter',
      icon: User,
      title: 'My Matter',
      desc: 'Check your case summary, contacts, dates, and next steps.',
      color: '#7c3aed,#22d3ee',
    },
  ]

  const handleTabNavigation = (tab: PortalTab) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('tab', tab)
    setSelectedTab(tab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (!selectedBusinessId && businessLinks[0]?.business_id) {
      setSelectedBusinessId(businessLinks[0].business_id)
    }
  }, [businessLinks, selectedBusinessId])

  useEffect(() => {
    if (!selectedBusiness) {
      if (selectedMatterId) setSelectedMatterId('')
      return
    }

    const hasSelectedMatter = selectedBusiness.matters.some((matter) => matter.id === selectedMatterId)
    if (hasSelectedMatter) return

    const defaultMatter =
      selectedBusiness.matters.find((matter) => matter.status !== 'archived' && matter.stage !== 'closed') ||
      selectedBusiness.matters[0] ||
      null
    setSelectedMatterId(defaultMatter?.id || '')
  }, [selectedBusiness, selectedMatterId])

  useEffect(() => {
    if (!showCompose) return
    if (composeMatterId) return
    setComposeMatterId(selectedMatter?.id || '')
  }, [showCompose, composeMatterId, selectedMatter])

  const loadData = async () => {
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const userEmail = normalizeEmail(user.email)

      const { data: links } = await supabase
        .from('client_business_links')
        .select('*, businesses(name)')
        .eq('client_id', user.id)
        .eq('status', 'active')

      let statuses: Record<string, any> = {}
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
        statuses = {}
      }

      if (links) {
        const nextLinks = links.map((link: any) => {
          const statusEntry = statuses[String(link.business_id || '')] || {}
          const matters = Array.isArray(statusEntry.matters) ? statusEntry.matters : []
          return {
            id: String(link.id),
            business_id: String(link.business_id),
            client_name: String(link.client_name || '').trim() || 'Client',
            status: String(link.status || 'active'),
            business_name: String(link.businesses?.name || 'Legal Professional'),
            has_open_matter: Boolean(statusEntry.hasOpenMatter),
            is_closed: Boolean(statusEntry.isClosed),
            latestMatterId: typeof statusEntry.latestMatterId === 'string' ? statusEntry.latestMatterId : null,
            lastActivityAt: typeof statusEntry.lastActivityAt === 'string' ? statusEntry.lastActivityAt : null,
            matters: matters.map((matter: any) => ({
              id: String(matter.id || ''),
              caseId: typeof matter.caseId === 'string' ? matter.caseId : null,
              matterNumber: String(matter.matterNumber || '').trim(),
              issueType: String(matter.issueType || 'Client matter').trim() || 'Client matter',
              urgency: String(matter.urgency || 'medium').trim().toLowerCase(),
              summary: String(matter.summary || '').trim(),
              fullDetails: String(matter.fullDetails || '').trim(),
              phone: String(matter.phone || '').trim(),
              location: String(matter.location || '').trim(),
              courtDate: typeof matter.courtDate === 'string' ? matter.courtDate : null,
              opposing: String(matter.opposing || '').trim(),
              documents: Array.isArray(matter.documents) ? matter.documents.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : [],
              tags: Array.isArray(matter.tags) ? matter.tags.map((entry: unknown) => String(entry || '').trim()).filter(Boolean) : [],
              status: String(matter.status || 'active').toLowerCase(),
              stage: String(matter.stage || 'intake').toLowerCase(),
              owner: String(matter.owner || 'Unassigned').trim() || 'Unassigned',
              nextAction: String(matter.nextAction || '').trim(),
              nextDeadline: typeof matter.nextDeadline === 'string' ? matter.nextDeadline : null,
              acceptedAt: typeof matter.acceptedAt === 'string' ? matter.acceptedAt : null,
              lastActivityAt: typeof matter.lastActivityAt === 'string' ? matter.lastActivityAt : null,
              currentBalance: typeof matter.currentBalance === 'number' ? matter.currentBalance : Number(matter.currentBalance || 0),
            })).filter((matter: MatterSummary) => matter.id),
          } satisfies BusinessLink
        })
        setBusinessLinks(nextLinks)
      } else {
        setBusinessLinks([])
      }

      const { data: msgs } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('recipient_email', userEmail)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (msgs) {
        setMessages(msgs.map((msg: any) => ({
          id: String(msg.id),
          sender: msg.sender_name || msg.sender_email?.split('@')[0] || 'Unknown',
          senderEmail: String(msg.sender_email || ''),
          subject: String(msg.subject || ''),
          content: String(msg.content || ''),
          timestamp: String(msg.created_at || new Date().toISOString()),
          isRead: Boolean(msg.is_read),
          businessId: typeof msg.metadata?.businessId === 'string' ? msg.metadata.businessId : null,
          matterId: typeof msg.metadata?.matterId === 'string' ? msg.metadata.matterId : null,
          caseId: typeof msg.metadata?.caseId === 'string' ? msg.metadata.caseId : null,
          matterLabel:
            typeof msg.metadata?.matterNumber === 'string'
              ? msg.metadata.matterNumber
              : typeof msg.metadata?.matterLabel === 'string'
                ? msg.metadata.matterLabel
                : null,
          attachments: parseInboxAttachments(msg.metadata),
        })))
      } else {
        setMessages([])
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
          businessId: typeof doc.businessId === 'string' ? doc.businessId : null,
          matterId: typeof doc.matterId === 'string' ? doc.matterId : null,
          caseId: typeof doc.caseId === 'string' ? doc.caseId : null,
          matterLabel: typeof doc.matterLabel === 'string' ? doc.matterLabel : null,
          sourceLabel: typeof doc.sourceLabel === 'string' ? doc.sourceLabel : undefined,
        }))
        setDocuments(nextDocs.filter((doc: ClientDocument) => doc.sourceLabel !== 'Shared by your professional'))
        setSharedPortalDocuments(nextDocs.filter((doc: ClientDocument) => doc.sourceLabel === 'Shared by your professional'))
      } else {
        setDocuments([])
        setSharedPortalDocuments([])
      }

      try {
        const [meetingsResponse, syncTargetsResponse] = await Promise.all([
          fetch('/api/client/meetings', {
            credentials: 'include',
            cache: 'no-store',
          }),
          fetch('/api/client/document-sync', {
            credentials: 'include',
            cache: 'no-store',
          }),
        ])

        const meetingsPayload = await meetingsResponse.json().catch(() => ({}))
        if (meetingsResponse.ok && Array.isArray(meetingsPayload?.meetings)) {
          setMeetings(meetingsPayload.meetings)
        } else {
          setMeetings([])
        }

        const syncTargetsPayload = await syncTargetsResponse.json().catch(() => ({}))
        if (syncTargetsResponse.ok && Array.isArray(syncTargetsPayload?.targets)) {
          setSyncTargets(syncTargetsPayload.targets)
        } else {
          setSyncTargets([])
        }
      } catch {
        setMeetings([])
        setSyncTargets([])
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
      `Disconnect from ${label}? Messages, meetings, and shared documents will stay in your history, but new portal updates will stop until they reconnect you.`,
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
      if (!response.ok) throw new Error(payload?.message || 'Unable to disconnect from this professional.')
      setPortalNotice('Portal connection removed. Your past history remains available in the portal view until the page refreshes.')
      await loadData()
    } catch (err) {
      setPortalNotice(err instanceof Error ? err.message : 'Unable to disconnect from this professional.')
    } finally {
      setLeavingLinkId(null)
    }
  }

  const handleCompose = (businessId: string, subject = '', matterId = '') => {
    setSelectedBusinessId(businessId)
    setComposeMatterId(matterId)
    setComposeForm((prev) => ({ ...prev, subject }))
    setComposeNotice('')
    setShowCompose(true)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBusiness) return

    setComposeSending(true)
    setComposeNotice('')

    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const composeMatter = selectedBusiness.matters.find((matter) => matter.id === composeMatterId) || null
      const response = await fetch('/api/client/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          businessId: selectedBusiness.business_id,
          matterId: composeMatter?.id || undefined,
          caseId: composeMatter?.caseId || undefined,
          subject: composeForm.subject,
          content: composeForm.content,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to send message')
      }

      setComposeNotice('sent')
      setComposeForm({ subject: '', content: '' })
      setComposeMatterId('')
      window.setTimeout(() => {
        setShowCompose(false)
        setComposeNotice('')
        void loadData()
      }, 1200)
    } catch (err) {
      setComposeNotice(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setComposeSending(false)
    }
  }

  const handleOpenDocument = async (id: string, previewMeta?: Partial<PreviewDocument>) => {
    const matched = [...documents, ...sharedDocuments].find((doc) => doc.id === id)
    setPreviewDocument(
      previewMeta
        ? {
            id,
            name: previewMeta.name || matched?.name || 'Document',
            createdAt: previewMeta.createdAt || matched?.createdAt || new Date().toISOString(),
            size: typeof previewMeta.size === 'number' ? previewMeta.size : matched?.size || 0,
            mimeType: previewMeta.mimeType || matched?.mimeType || '',
            businessId: previewMeta.businessId || matched?.businessId || null,
            matterId: previewMeta.matterId || matched?.matterId || null,
            caseId: previewMeta.caseId || matched?.caseId || null,
            matterLabel: previewMeta.matterLabel || matched?.matterLabel || null,
            sourceLabel: previewMeta.sourceLabel || matched?.sourceLabel,
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
      setPortalUploadNotice(
        activeSyncTarget
          ? `${uploadedCount} document${uploadedCount === 1 ? '' : 's'} uploaded. You can now share them into ${activeSyncTarget.matterLabel}.`
          : `${uploadedCount} document${uploadedCount === 1 ? '' : 's'} uploaded.`,
      )
      if (portalUploadInputRef.current) portalUploadInputRef.current.value = ''
      await loadData()
    } catch (error) {
      setPortalUploadNotice(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setPortalUploading(false)
    }
  }

  const handleSyncDocument = async (documentId: string, mode: 'sync' | 'remove') => {
    if (!selectedBusiness || !activeSyncTarget) {
      setSyncNotice('Choose an active matter before sharing documents.')
      return
    }

    setSyncNotice('')
    setSyncingDocumentId(documentId)
    try {
      const response = await fetch('/api/client/document-sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: selectedBusiness.business_id,
          matterId: activeSyncTarget.matterId,
          caseId: activeSyncTarget.caseId,
          documentIds: [documentId],
          mode,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Unable to update shared documents.')
      }

      setSyncNotice(
        mode === 'sync'
          ? `Document shared to ${activeSyncTarget.matterLabel}.`
          : `Shared copy removed from ${activeSyncTarget.matterLabel}.`,
      )
      await loadData()
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : 'Unable to update shared documents.')
    } finally {
      setSyncingDocumentId(null)
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className={styles.portalPage}>
      <aside className={styles.portalSidebar}>
        <div className={styles.portalSidebarHeader}>
          <div className={styles.brand}>
            <div className={styles.brandIcon}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className={styles.overline}>Client portal</p>
              <h1 className={styles.title}>MyMcKenzieCS Client Portal</h1>
              <p className={styles.sidebarIntro}>Secure messages, meetings, and case documents in one place.</p>
            </div>
          </div>
        </div>

        <div className={styles.portalSidebarBody}>
          <div className={styles.panelHeader}>
            <span className={styles.overline}>Workspace cards</span>
            <h2 className={styles.panelTitle}>Navigate from the dashboard cards</h2>
            <p className={styles.panelCopy}>Each card opens its own portal view, just like the case workspace dashboard.</p>
          </div>

          {businessLinks.length > 0 && (
            <>
              <div className={styles.panelHeader}>
                <span className={styles.overline}>Professionals</span>
                <h2 className={styles.panelTitle}>Connected access</h2>
              </div>
              <div className={styles.professionals}>
                {businessLinks.map((link) => {
                  const openMatterCount = link.matters.filter((matter) => matter.status !== 'archived' && matter.stage !== 'closed').length
                  const closedMatterCount = link.matters.length - openMatterCount
                  const isActiveSelection = selectedBusiness?.business_id === link.business_id
                  return (
                    <div key={link.id} className={`${styles.professionalCard} ${isActiveSelection ? styles.professionalCardActive : ''}`}>
                      <div className={styles.professionalTop}>
                        <div className={styles.avatar}><User size={18} /></div>
                        <div>
                          <p className={styles.professionalName}>{link.business_name || 'Legal Professional'}</p>
                          <p className={styles.professionalMeta}>
                            {link.is_closed ? 'Case history archived' : link.has_open_matter ? 'Active matter in progress' : 'Portal connection active'}
                          </p>
                        </div>
                      </div>
                      <div className={styles.professionalStats}>
                        <span className={styles.inlinePill}><FolderOpen size={12} />{openMatterCount} open</span>
                        <span className={styles.inlinePill}><Archive size={12} />{closedMatterCount} archived</span>
                      </div>
                      <div className={styles.cardActions}>
                        <button type="button" className={styles.secondaryButton} onClick={() => setSelectedBusinessId(link.business_id)}>
                          {isActiveSelection ? 'Focused' : 'Focus'}
                        </button>
                        <button
                          type="button"
                          className={styles.messageButton}
                          onClick={() => handleCompose(link.business_id, link.is_closed ? 'Request to open a new matter' : '', link.latestMatterId || '')}
                        >
                          {link.is_closed ? 'Request matter' : 'Message'}
                        </button>
                        <button type="button" className={styles.dangerButton} onClick={() => handleLeaveProfessional(link.id, link.business_name)} disabled={leavingLinkId === link.id}>
                          {leavingLinkId === link.id ? 'Disconnecting...' : 'Disconnect'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className={styles.portalSidebarFooter} aria-label="Portal summary">
          <div className={styles.sidebarStat}><strong>{connectedProfessionalCount}</strong><span>Professionals</span></div>
          <div className={styles.sidebarStat}><strong>{upcomingMeetingCount}</strong><span>Meetings</span></div>
          <div className={styles.sidebarStat}><strong>{documents.length + sharedPortalDocuments.length}</strong><span>Documents</span></div>
        </div>
      </aside>

      <main className={styles.portalMain}>
        <header className={styles.portalHeader}>
          <div className={styles.summaryText}>
            <p className={styles.overline}>Client workspace</p>
            <h2 className={styles.summaryTitle}>Messages, meetings, and documents grouped by professional and matter.</h2>
            <p className={styles.summaryCopy}>{portalIntroText}</p>
          </div>
          <div className={styles.summaryHighlights}>
            <div className={styles.summaryCard}>
              <CheckCircle2 size={16} />
              <div>
                <strong>{connectedProfessionalCount} active connection{connectedProfessionalCount === 1 ? '' : 's'}</strong>
                <span>Focused around the professionals and matters linked to your account.</span>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <Clock size={16} />
              <div>
                <strong>{upcomingMeetingCount} scheduled meeting{upcomingMeetingCount === 1 ? '' : 's'}</strong>
                <span>Unread updates and upcoming calls stay visible in the workspace.</span>
              </div>
            </div>
          </div>
        </header>

        <div className={styles.portalContent}>
          <section className={styles.dashboardCardGrid} aria-label="Client portal sections">
            {portalCards.map((card) => {
              const Icon = card.icon
              const isActive = selectedTab === card.tab
              return (
                <Link
                  key={card.tab}
                  href={`${pathname}?tab=${card.tab}`}
                  prefetch={false}
                  className={styles.dashboardCardLink}
                  onClick={() => handleTabNavigation(card.tab)}
                >
                  <article
                    className={`${styles.dashboardCard} ${isActive ? styles.dashboardCardActive : ''}`}
                    style={{ ['--portal-card-gradient' as string]: `linear-gradient(135deg, ${card.color})` }}
                  >
                    <div>
                      {typeof card.alertCount === 'number' && card.alertCount > 0 && (
                        <div className={styles.dashboardCardBadge} aria-label={`${card.alertCount} updates for ${card.title}`}>
                          {card.alertCount > 99 ? '99+' : card.alertCount}
                        </div>
                      )}
                      <Icon size={32} className={styles.dashboardCardIcon} />
                      <h3 className={styles.dashboardCardTitle}>{card.title}</h3>
                      <p className={styles.dashboardCardDesc}>{card.desc}</p>
                    </div>
                    <span className={styles.dashboardCardFooter}>{isActive ? 'Current view' : 'Open section'}</span>
                  </article>
                </Link>
              )
            })}
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

          <section className={styles.workspace}>
            <section className={styles.listPanel}>
              <div className={styles.listHeader}>
                <h2 className={styles.listTitle}>
                  {selectedTab === 'messages' && 'Messages'}
                  {selectedTab === 'meetings' && 'Video meetings'}
                  {selectedTab === 'documents' && 'Documents'}
                  {selectedTab === 'matter' && 'My matter'}
                </h2>
                <p className={styles.listSub}>
                  {selectedTab === 'messages' && `${filteredMessages.length} message${filteredMessages.length === 1 ? '' : 's'} in this view`}
                  {selectedTab === 'meetings' && `${filteredMeetings.length} meeting${filteredMeetings.length === 1 ? '' : 's'} in this view`}
                  {selectedTab === 'documents' && `${filteredSharedDocuments.length + documents.length} document${filteredSharedDocuments.length + documents.length === 1 ? '' : 's'} available`}
                  {selectedTab === 'matter' && 'Matter details shared with you by your professional'}
                </p>
                {selectedBusiness && (
                  <div className={styles.filterBar}>
                    <button
                      type="button"
                      className={selectedMatter ? styles.filterChip : styles.filterChipActive}
                      onClick={() => setSelectedMatterId('')}
                    >
                      {selectedBusiness.business_name}
                    </button>
                    {selectedBusiness.matters.length > 1 && (
                      <button
                        type="button"
                        className={styles.toggleLink}
                        onClick={() => setShowArchivedMatters((current) => !current)}
                      >
                        {showArchivedMatters ? 'Hide archived matters' : 'Show archived matters'}
                      </button>
                    )}
                  </div>
                )}
                {visibleMatterOptions.length > 0 && (
                  <div className={styles.matterChips}>
                    {visibleMatterOptions.map((matter) => (
                      <button
                        key={matter.id}
                        type="button"
                        className={selectedMatter?.id === matter.id ? styles.filterChipActive : styles.filterChip}
                        onClick={() => setSelectedMatterId(matter.id)}
                      >
                        {formatMatterLabel(matter)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.listContent}>
                {selectedTab === 'messages' && (
                  filteredMessages.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div>
                        <Mail size={44} />
                        <strong>No messages in this view</strong>
                        <span>Messages from the selected professional or matter will appear here.</span>
                      </div>
                    </div>
                  ) : (
                    filteredMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`${styles.listItem} ${!msg.isRead ? styles.listItemUnread : ''}`}
                      >
                        <div className={styles.itemTop}>
                          <div>
                            <h4 className={styles.itemTitle}>{msg.subject}</h4>
                            <p className={styles.itemMeta}>
                              From {msg.sender}
                              {msg.businessId && businessById.get(msg.businessId) ? ` • ${businessById.get(msg.businessId)?.business_name}` : ''}
                              {msg.matterLabel ? ` • ${msg.matterLabel}` : ''}
                            </p>
                          </div>
                          <span className={styles.itemTime}>{formatDateTime(msg.timestamp)}</span>
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
                                  businessId: msg.businessId,
                                  matterId: msg.matterId,
                                  caseId: msg.caseId,
                                  matterLabel: msg.matterLabel,
                                })}
                              >
                                <Paperclip size={13} />
                                <span>{attachment.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )
                )}

            {selectedTab === 'meetings' && (
              filteredMeetings.length === 0 ? (
                <div className={styles.emptyState}>
                  <div>
                    <Video size={44} />
                    <strong>No scheduled video meetings in this view</strong>
                    <span>When a professional schedules a call, the join button appears here with its matter context.</span>
                  </div>
                </div>
              ) : (
                filteredMeetings.map((meeting) => (
                  <div key={meeting.id} className={styles.listItem}>
                    <div className={styles.itemTop}>
                      <div>
                        <h4 className={styles.itemTitle}>{meeting.title}</h4>
                        <p className={styles.itemMeta}>
                          With {meeting.businessName}
                          {meeting.matterLabel ? ` • ${meeting.matterLabel}` : ''}
                        </p>
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
                ))
              )
            )}

            {selectedTab === 'documents' && (
              <>
                <div className={styles.sharedDocsPanel}>
                  <div className={styles.sharedDocsHeader}>
                    <div>
                      <h3 className={styles.uploadPanelTitle}>Shared by your professional</h3>
                      <p className={styles.uploadPanelCopy}>
                        {selectedMatter
                          ? `Documents connected to ${formatMatterLabel(selectedMatter)} appear here.`
                          : 'Documents from the selected professional appear here so you can open them without leaving the workspace.'}
                      </p>
                    </div>
                    <span className={styles.sharedDocsCount}>{filteredSharedDocuments.length} file{filteredSharedDocuments.length === 1 ? '' : 's'}</span>
                  </div>
                  {filteredSharedDocuments.length === 0 ? (
                    <div className={styles.sharedDocsEmpty}>No shared documents in this view yet.</div>
                  ) : (
                    <div className={styles.sharedDocsList}>
                      {filteredSharedDocuments.map((doc) => (
                        <div key={doc.id} className={styles.sharedDocsRow}>
                          <div>
                            <h4 className={styles.itemTitle}>{doc.name}</h4>
                            <p className={styles.itemMeta}>
                              {doc.matterLabel ? `${doc.matterLabel} • ` : ''}
                              {doc.sourceLabel || 'Shared document'} • {formatSize(doc.size)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleOpenDocument(doc.id, doc)}
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
                    <p className={styles.uploadPanelCopy}>
                      Upload to your portal first. If a matter is selected, you can then share those files directly into that professional matter.
                    </p>
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

                {activeSyncTarget && (
                  <div className={styles.syncPanel}>
                    <div>
                      <h3 className={styles.uploadPanelTitle}>Share uploads to selected matter</h3>
                      <p className={styles.uploadPanelCopy}>Current target: {activeSyncTarget.businessName} • {activeSyncTarget.matterLabel}</p>
                    </div>
                    <span className={styles.sharedDocsCount}>Matter ready</span>
                  </div>
                )}

                {syncNotice && (
                  <div className={styles.notice}>
                    <p>{syncNotice}</p>
                  </div>
                )}

                {documents.length === 0 && filteredSharedDocuments.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div>
                      <FileText size={44} />
                      <strong>No documents yet</strong>
                      <span>Documents uploaded here and documents shared by your professional will be listed here.</span>
                    </div>
                  </div>
                ) : (
                  documents.map((doc) => (
                    <div key={doc.id} className={`${styles.listItem} ${styles.documentRow}`}>
                      <div>
                        <h4 className={styles.itemTitle}>{doc.name}</h4>
                        <p className={styles.itemMeta}>
                          {formatDate(doc.createdAt)} • {formatSize(doc.size)}
                          {doc.sourceLabel ? ` • ${doc.sourceLabel}` : ''}
                        </p>
                      </div>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          onClick={() => void handleOpenDocument(doc.id, doc)}
                          className={styles.secondaryButton}
                        >
                          Open
                        </button>
                        {activeSyncTarget && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleSyncDocument(doc.id, 'sync')}
                              className={styles.primaryButton}
                              disabled={syncingDocumentId === doc.id}
                            >
                              {syncingDocumentId === doc.id ? <Loader2 size={14} className={styles.spin} /> : <RefreshCcw size={14} />}
                              Share to matter
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSyncDocument(doc.id, 'remove')}
                              className={styles.secondaryButton}
                              disabled={syncingDocumentId === doc.id}
                            >
                              Remove shared copy
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {selectedTab === 'matter' && (
              <div className={styles.profileStack}>
                {selectedMatter ? (
                  <>
                    <div className={styles.listItem}>
                      <div className={styles.itemTop}>
                        <div>
                          <h4 className={styles.itemTitle}>{formatMatterLabel(selectedMatter)}</h4>
                          <p className={styles.itemMeta}>{selectedBusiness?.business_name || 'Legal Professional'}</p>
                        </div>
                        <span className={styles.statusPill}>
                          {selectedMatter.status === 'archived' || selectedMatter.stage === 'closed' ? 'Archived' : 'Active'}
                        </span>
                      </div>
                      <div className={styles.matterGrid}>
                        <div className={styles.matterFact}>
                          <span className={styles.matterFactLabel}>Stage</span>
                          <strong>{formatStageLabel(selectedMatter.stage)}</strong>
                        </div>
                        <div className={styles.matterFact}>
                          <span className={styles.matterFactLabel}>Status</span>
                          <strong>{formatStatusLabel(selectedMatter.status)}</strong>
                        </div>
                        <div className={styles.matterFact}>
                          <span className={styles.matterFactLabel}>Urgency</span>
                          <strong>{formatUrgencyLabel(selectedMatter.urgency)}</strong>
                        </div>
                        <div className={styles.matterFact}>
                          <span className={styles.matterFactLabel}>Balance</span>
                          <strong>{formatCurrency(selectedMatter.currentBalance)}</strong>
                        </div>
                      </div>
                    </div>

                    <div className={styles.listItem}>
                      <h4 className={styles.itemTitle}>Next steps</h4>
                      <div className={styles.timelineList}>
                        <div className={styles.timelineRow}>
                          <span className={styles.timelineLabel}>Next action</span>
                          <strong>{selectedMatter.nextAction || 'No action published yet'}</strong>
                        </div>
                        <div className={styles.timelineRow}>
                          <span className={styles.timelineLabel}>Next deadline</span>
                          <strong>{formatDate(selectedMatter.nextDeadline)}</strong>
                        </div>
                        <div className={styles.timelineRow}>
                          <span className={styles.timelineLabel}>Court date</span>
                          <strong>{formatDate(selectedMatter.courtDate)}</strong>
                        </div>
                        <div className={styles.timelineRow}>
                          <span className={styles.timelineLabel}>Matter owner</span>
                          <strong>{selectedMatter.owner || 'Unassigned'}</strong>
                        </div>
                      </div>
                    </div>

                    <div className={styles.listItem}>
                      <h4 className={styles.itemTitle}>Matter summary</h4>
                      <p className={styles.detailText}>{selectedMatter.summary || 'No summary has been shared yet.'}</p>
                      {selectedMatter.fullDetails && (
                        <>
                          <h4 className={styles.itemTitle}>Full details</h4>
                          <p className={styles.detailText}>{selectedMatter.fullDetails}</p>
                        </>
                      )}
                    </div>

                    <div className={styles.listItem}>
                      <h4 className={styles.itemTitle}>Contacts and parties</h4>
                      <div className={styles.timelineList}>
                        <div className={styles.timelineRow}>
                          <span className={styles.timelineLabel}>Client name</span>
                          <strong>{selectedBusiness?.client_name || 'Client'}</strong>
                        </div>
                        <div className={styles.timelineRow}>
                          <span className={styles.timelineLabel}>Phone</span>
                          <strong>{selectedMatter.phone || 'Not recorded'}</strong>
                        </div>
                        <div className={styles.timelineRow}>
                          <span className={styles.timelineLabel}>Location</span>
                          <strong>{selectedMatter.location || 'Not recorded'}</strong>
                        </div>
                        <div className={styles.timelineRow}>
                          <span className={styles.timelineLabel}>Opposing party</span>
                          <strong>{selectedMatter.opposing || 'Not recorded'}</strong>
                        </div>
                      </div>
                    </div>

                    <div className={styles.listItem}>
                      <h4 className={styles.itemTitle}>Documents and tags</h4>
                      {selectedMatter.documents.length > 0 ? (
                        <div className={styles.tokenRow}>
                          {selectedMatter.documents.map((documentName) => (
                            <span key={documentName} className={styles.tokenPill}>{documentName}</span>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.itemPreview}>No matter-level document names have been shared yet.</p>
                      )}
                      {selectedMatter.tags.length > 0 && (
                        <>
                          <h4 className={styles.itemTitle}>Tags</h4>
                          <div className={styles.tokenRow}>
                            {selectedMatter.tags.map((tag) => (
                              <span key={tag} className={styles.tokenPill}>{tag}</span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <div>
                      <User size={44} />
                      <strong>No matter selected</strong>
                      <span>Select a professional or matter chip to view the shared case details here.</span>
                    </div>
                  </div>
                )}
              </div>
                )}
              </div>
            </section>

            <section className={styles.detailPanel}>
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>Matter overview</h2>
              </div>
              <div className={styles.detailBody}>
                {selectedBusiness ? (
                  <>
                    <div className={styles.timelineCard}>
                      <p className={styles.timelineEyebrow}>Focused professional</p>
                      <h3 className={styles.timelineTitle}>{selectedBusiness.business_name}</h3>
                      <p className={styles.detailText}>
                        {selectedMatter
                          ? `You are currently viewing ${formatMatterLabel(selectedMatter)}. Secure replies stay in the portal, and documents can be shared directly into this matter.`
                          : 'Choose a matter chip to narrow the view to one case, or stay at the professional level to see everything for this relationship.'}
                      </p>
                    </div>

                    {selectedMatter ? (
                      <div className={styles.timelineCard}>
                        <p className={styles.timelineEyebrow}>Case timeline</p>
                        <h3 className={styles.timelineTitle}>{formatMatterLabel(selectedMatter)}</h3>
                        <div className={styles.timelineList}>
                          <div className={styles.timelineRow}>
                            <span className={styles.timelineLabel}>Stage</span>
                            <strong>{formatStageLabel(selectedMatter.stage)}</strong>
                          </div>
                          <div className={styles.timelineRow}>
                            <span className={styles.timelineLabel}>Status</span>
                            <strong>{formatStatusLabel(selectedMatter.status)}</strong>
                          </div>
                          <div className={styles.timelineRow}>
                            <span className={styles.timelineLabel}>Last activity</span>
                            <strong>{formatDateTime(selectedMatter.lastActivityAt)}</strong>
                          </div>
                          <div className={styles.timelineRow}>
                            <span className={styles.timelineLabel}>Next deadline</span>
                            <strong>{formatDate(selectedMatter.nextDeadline)}</strong>
                          </div>
                          <div className={styles.timelineRow}>
                            <span className={styles.timelineLabel}>Next action</span>
                            <strong>{selectedMatter.nextAction || 'No action published yet'}</strong>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.timelineCard}>
                        <p className={styles.timelineEyebrow}>Relationship summary</p>
                        <h3 className={styles.timelineTitle}>{selectedBusiness.matters.length} matter{selectedBusiness.matters.length === 1 ? '' : 's'} on record</h3>
                        <div className={styles.timelineList}>
                          <div className={styles.timelineRow}>
                            <span className={styles.timelineLabel}>Open matters</span>
                            <strong>{selectedBusiness.matters.filter((matter) => matter.status !== 'archived' && matter.stage !== 'closed').length}</strong>
                          </div>
                          <div className={styles.timelineRow}>
                            <span className={styles.timelineLabel}>Archived matters</span>
                            <strong>{selectedBusiness.matters.filter((matter) => matter.status === 'archived' || matter.stage === 'closed').length}</strong>
                          </div>
                          <div className={styles.timelineRow}>
                            <span className={styles.timelineLabel}>Last portal activity</span>
                            <strong>{formatDateTime(selectedBusiness.lastActivityAt)}</strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedTab === 'meetings' && filteredMeetings[0] && (
                      <div className={styles.listItem}>
                        <h3 className={styles.itemTitle}>Next meeting</h3>
                        <p className={styles.itemMeta}>
                          {filteredMeetings[0].title} with {filteredMeetings[0].businessName}
                          {filteredMeetings[0].matterLabel ? ` • ${filteredMeetings[0].matterLabel}` : ''}
                        </p>
                        <div className={styles.cardActions}>
                          <Link href={meetingHref(filteredMeetings[0].roomName)} className={styles.primaryButton}><Video size={16} />Join meeting</Link>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className={styles.detailText}>
                    Once a professional connects you to the portal, your matter timeline, meetings, and shared documents will appear here.
                  </p>
                )}
              </div>
            </section>
          </section>
        </div>
      </main>

      {showCompose && selectedBusiness && (
        <div className={styles.composeOverlay}>
          <div className={styles.composeModal}>
            <div className={styles.composeHeader}>
              <div>
                <h2 className={styles.composeTitle}>Send secure message</h2>
                <p className={styles.composeSub}>To {selectedBusiness.business_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCompose(false)}
                className={styles.closeButton}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSendMessage} className={styles.composeForm}>
              {selectedBusiness.matters.length > 0 && (
                <div className={styles.field}>
                  <label htmlFor="matter">Matter context</label>
                  <select
                    id="matter"
                    value={composeMatterId}
                    onChange={(event) => setComposeMatterId(event.target.value)}
                    className={styles.input}
                  >
                    <option value="">General portal message</option>
                    {selectedBusiness.matters.map((matter) => (
                      <option key={matter.id} value={matter.id}>
                        {formatMatterLabel(matter)} {matter.status === 'archived' || matter.stage === 'closed' ? '(archived)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className={styles.field}>
                <label htmlFor="subject">Subject</label>
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
                <label htmlFor="content">Message</label>
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
              <p className={styles.composeHelp}>The professional receives an email notification to sign in and reply. The conversation itself stays in the portal.</p>
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

      {previewDocument && (
        <div className={styles.previewOverlay} onClick={(event) => { if (event.target === event.currentTarget) closePreview() }}>
          <div className={styles.previewModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.previewHeader}>
              <div>
                <p className={styles.previewEyebrow}>{previewDocument.sourceLabel || 'Shared document'}</p>
                <h2 className={styles.previewTitle}>{previewDocument.name}</h2>
                <p className={styles.previewMeta}>
                  {previewDocument.matterLabel ? `${previewDocument.matterLabel} • ` : ''}
                  {previewDocument.createdAt ? formatDate(previewDocument.createdAt) : 'Document'}
                  {previewDocument.size > 0 ? ` • ${formatSize(previewDocument.size)}` : ''}
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
                previewDocument.mimeType.startsWith('image/') ? (
                  <img src={previewUrl} alt={previewDocument.name} className={styles.previewImage} />
                ) : (
                  <iframe src={previewUrl} title={previewDocument.name} className={styles.previewFrame} />
                )
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

export default function ClientPortalPage() {
  return (
    <Suspense fallback={null}>
      <ClientPortalContent />
    </Suspense>
  )
}
