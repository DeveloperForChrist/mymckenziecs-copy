'use client'

import { useState, useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import { Mail, FileText, Calendar, User, LogOut, MessageSquare } from 'lucide-react'

interface BusinessLink {
  id: string
  business_id: string
  client_name: string
  status: string
  business_name?: string
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

export default function ClientPortalPage() {
  const [businessLinks, setBusinessLinks] = useState<BusinessLink[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTab, setSelectedTab] = useState<'messages' | 'documents' | 'profile'>('messages')
  const [showCompose, setShowCompose] = useState(false)
  const [composeForm, setComposeForm] = useState({ subject: '', content: '' })
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeNotice, setComposeNotice] = useState('')

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
        setBusinessLinks(links.map((link: any) => ({
          id: link.id,
          business_id: link.business_id,
          client_name: link.client_name,
          status: link.status,
          business_name: link.businesses?.name,
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
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const handleCompose = (businessId: string) => {
    setSelectedBusinessId(businessId)
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
              <h1 className="text-xl font-bold text-gray-900">Client Portal</h1>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                      <p className="text-sm text-gray-500">Active client</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCompose(link.business_id)}
                    className="mt-3 w-full py-2 px-4 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                  >
                    Send Message
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
              <div className="text-center py-12 text-gray-500">
                <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                <p>No documents shared yet</p>
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
