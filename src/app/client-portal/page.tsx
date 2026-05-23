'use client'

import { useState, useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import { Mail, FileText, Calendar, User, LogOut, MessageSquare } from 'lucide-react'
import { safeBrowserSignOut } from '@/lib/auth/safe-browser-signout'
import Link from 'next/link'

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
}

interface ClientDocument {
  id: string
  name: string
  createdAt: string
  size: number
  mimeType: string
}

export default function ClientPortalPage() {
  const [businessLinks, setBusinessLinks] = useState<BusinessLink[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [documents, setDocuments] = useState<ClientDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTab, setSelectedTab] = useState<'messages' | 'documents' | 'profile'>('messages')
  const [showCompose, setShowCompose] = useState(false)
  const [composeForm, setComposeForm] = useState({ subject: '', content: '' })
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeNotice, setComposeNotice] = useState('')
  const [leavingLinkId, setLeavingLinkId] = useState<string | null>(null)
  const [portalNotice, setPortalNotice] = useState('')
  const [canUseLitigantWorkspace, setCanUseLitigantWorkspace] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      try {
        const userResponse = await fetch('/api/user', {
          credentials: 'include',
          cache: 'no-store',
        })
        const userPayload = await userResponse.json().catch(() => ({}))
        if (userResponse.ok) {
          setCanUseLitigantWorkspace(Boolean(userPayload?.canUseLitigantWorkspace))
        }
      } catch {
        setCanUseLitigantWorkspace(false)
      }

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
        })))
      }

      const { data: docs } = await supabase
        .from('documents')
        .select('id, name, created_at, file_size, mime_type')
        .eq('uploaded_by', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (docs) {
        setDocuments(
          docs.map((doc: any) => ({
            id: String(doc.id),
            name: String(doc.name || 'Document'),
            createdAt: String(doc.created_at || new Date().toISOString()),
            size: Number(doc.file_size || 0),
            mimeType: String(doc.mime_type || ''),
          })),
        )
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    const shouldContinue = window.confirm('Sign out of your client dashboard now?')
    if (!shouldContinue) return
    const supabase = getSupabaseBrowserClient()
    await safeBrowserSignOut(supabase)
    window.location.href = '/'
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

  const handleOpenDocument = async (id: string) => {
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(id)}/signed`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'Unable to open document.')
      }
      window.open(String(payload.url), '_blank', 'noopener,noreferrer')
    } catch (error) {
      setPortalNotice(error instanceof Error ? error.message : 'Unable to open document.')
    }
  }

  const formatSize = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '—'
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">MyMcKenzieCS Client Portal</h1>
            </div>
            <div className="flex items-center gap-4">
              {canUseLitigantWorkspace && (
                <>
                  <Link href="/client-portal" className="text-sm font-semibold text-purple-700 hover:text-purple-900">
                    Client Portal
                  </Link>
                  <Link href="/dashboard" className="text-sm font-medium text-gray-600 hover:text-gray-900">
                    Litigant Workspace
                  </Link>
                </>
              )}
              <Link href="/dashboard/directory" className="text-sm font-medium text-gray-600 hover:text-gray-900">
                Directory
              </Link>
              <Link
                href="/pricing/litigants?audience=litigant&from=client-portal"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
              >
                Subscribe to Litigant Workspace
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {businessLinks.length === 0 && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
            <h2 className="text-sm font-semibold text-amber-900">No active professional links</h2>
            <p className="mt-1 text-sm text-amber-800">
              You have left all client portal connections. You can browse the directory to find a professional and return here any time.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/dashboard/directory"
                className="inline-flex items-center rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800"
              >
                Open Directory
              </Link>
              <Link
                href="/client-portal"
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                Return to Client Portal
              </Link>
            </div>
          </div>
        )}
        {portalNotice && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            {portalNotice}
          </div>
        )}
        {/* Business Links */}
        {businessLinks.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Legal Professionals</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {businessLinks.map((link) => (
                <div key={link.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <User size={20} className="text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{link.business_name || 'Legal Professional'}</h3>
                      <p className="text-sm text-gray-500">
                        {link.is_closed ? 'Case closed' : link.has_open_matter ? 'Active matter' : 'Connected'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      handleCompose(
                        link.business_id,
                        link.is_closed ? 'Request to open a new matter' : '',
                      )
                    }
                    className="mt-3 w-full py-2 px-4 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                  >
                    {link.is_closed ? 'Request New Matter' : 'Send Message'}
                  </button>
                  {link.is_closed && (
                    <Link
                      href="/dashboard/directory"
                      className="mt-2 block w-full py-2 px-4 border border-gray-200 text-gray-700 rounded-lg text-center text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                      Find Another Professional
                    </Link>
                  )}
                  <button
                    onClick={() => handleLeaveProfessional(link.id, link.business_name)}
                    disabled={leavingLinkId === link.id}
                    className="mt-2 w-full py-2 px-4 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-60"
                  >
                    {leavingLinkId === link.id ? 'Leaving...' : 'Leave Professional'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex gap-4 px-4">
              <button
                onClick={() => setSelectedTab('messages')}
                className={`py-4 px-2 text-sm font-medium border-b-2 transition-colors ${
                  selectedTab === 'messages'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} />
                  Messages
                </div>
              </button>
              <button
                onClick={() => setSelectedTab('documents')}
                className={`py-4 px-2 text-sm font-medium border-b-2 transition-colors ${
                  selectedTab === 'documents'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText size={16} />
                  Documents
                </div>
              </button>
              <button
                onClick={() => setSelectedTab('profile')}
                className={`py-4 px-2 text-sm font-medium border-b-2 transition-colors ${
                  selectedTab === 'profile'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <User size={16} />
                  Profile
                </div>
              </button>
            </nav>
          </div>

          <div className="p-4">
            {selectedTab === 'messages' && (
              <div>
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Mail size={48} className="mx-auto mb-4 text-gray-300" />
                    <p>No messages yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-4 rounded-lg border ${
                          msg.isRead ? 'bg-gray-50 border-gray-200' : 'bg-white border-purple-200'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-medium text-gray-900">{msg.subject}</h4>
                            <p className="text-sm text-gray-500">From: {msg.sender}</p>
                          </div>
                          <span className="text-xs text-gray-400">{msg.timestamp}</span>
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-2">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedTab === 'documents' && (
              <div>
                {documents.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                    <p>No documents yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div key={doc.id} className="p-4 rounded-lg border bg-white border-gray-200 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="font-medium text-gray-900 truncate">{doc.name}</h4>
                          <p className="text-sm text-gray-500">
                            {new Date(doc.createdAt).toLocaleDateString()} • {formatSize(doc.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleOpenDocument(doc.id)}
                          className="shrink-0 py-2 px-3 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                        >
                          Open
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedTab === 'profile' && (
              <div className="max-w-md">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={businessLinks[0]?.client_name || ''}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compose modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-gray-900">Send Message</h2>
              <button
                type="button"
                onClick={() => setShowCompose(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSendMessage} className="space-y-4">
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  id="subject"
                  required
                  value={composeForm.subject}
                  onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Subject of your message"
                />
              </div>
              <div>
                <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
                  Message
                </label>
                <textarea
                  id="content"
                  required
                  rows={6}
                  value={composeForm.content}
                  onChange={(e) => setComposeForm({ ...composeForm, content: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  placeholder="Type your message here..."
                />
              </div>
              {composeNotice && (
                <p className={composeNotice === 'sent' ? 'text-green-600' : 'text-red-600'}>
                  {composeNotice === 'sent' ? 'Message sent!' : composeNotice}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={composeSending}
                  className="flex-1 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {composeSending ? 'Sending...' : 'Send Message'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCompose(false)}
                  className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
