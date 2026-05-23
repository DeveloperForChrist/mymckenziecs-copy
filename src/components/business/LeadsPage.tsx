'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  UserRound,
  XCircle,
} from 'lucide-react'
import {
  BUSINESS_LEADS_UPDATED_EVENT,
  CLIENT_MATTERS_UPDATED_EVENT,
  type BusinessLead,
  type LeadStatus,
  cacheBusinessLeads,
  cacheClientMatters,
  fetchBusinessLeads,
  cleanupLegacyMockBusinessLeadsCache,
  readClientMatters,
  readBusinessLeads,
  syncAcceptedLeadMatters,
  updateBusinessLeadStatus,
  upsertMatterFromLead,
  writeClientMatters,
  writeBusinessLeads,
} from '@/lib/business/client-matters'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import styles from './leads.module.css'

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  accepted: 'Accepted',
  declined: 'Declined',
  pending: 'Reviewing',
}

function formatSubmittedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function extractLeadTraceId(lead: BusinessLead) {
  const fromTag = lead.tags.find((tag) => tag.toLowerCase().startsWith('trace:'))
  if (fromTag) return fromTag.slice('trace:'.length)
  const match = lead.fullDetails.match(/Trace ID:\s*([a-zA-Z0-9-]+)/i)
  return match?.[1] || null
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<BusinessLead[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'new' | 'accepted' | 'declined'>('all')
  const [loading, setLoading] = useState(true)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const [quickLinkNotice, setQuickLinkNotice] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    cleanupLegacyMockBusinessLeadsCache()

    const applyLeads = (nextLeads: BusinessLead[]) => {
      if (!mounted) return
      setLeads(nextLeads)
      setSelectedLeadId((current) => {
        if (current && nextLeads.some((lead) => lead.id === current)) return current
        return nextLeads[0]?.id ?? null
      })
    }

    const loadLocalLeads = () => {
      const storedLeads = readBusinessLeads()
      syncAcceptedLeadMatters(storedLeads)
      applyLeads(storedLeads)
    }

    const loadRemoteLeads = async () => {
      setLoading(true)
      try {
        const remoteLeads = await fetchBusinessLeads()
        cacheBusinessLeads(remoteLeads)
        applyLeads(remoteLeads)
        setSyncNotice(null)
      } catch {
        loadLocalLeads()
        setSyncNotice('Using local leads until the business database is available.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadRemoteLeads()
    window.addEventListener(BUSINESS_LEADS_UPDATED_EVENT, loadLocalLeads)
    window.addEventListener('storage', loadLocalLeads)
    return () => {
      mounted = false
      window.removeEventListener(BUSINESS_LEADS_UPDATED_EVENT, loadLocalLeads)
      window.removeEventListener('storage', loadLocalLeads)
    }
  }, [])

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  )

  useEffect(() => {
    setQuickLinkNotice(null)
  }, [selectedLeadId])

  const filteredLeads = leads.filter((lead) => activeTab === 'all' || lead.status === activeTab)

  const updateStatus = async (id: string, status: LeadStatus) => {
    const next = leads.map((lead) => (lead.id === id ? { ...lead, status } : lead))
    const updatedLead = next.find((lead) => lead.id === id)
    setLeads(next)
    cacheBusinessLeads(next)
    setSyncNotice(null)

    try {
      const result = await updateBusinessLeadStatus(id, status)
      const remoteLeads = next.map((lead) => (lead.id === id ? result.lead : lead))
      setLeads(remoteLeads)
      cacheBusinessLeads(remoteLeads)
      if (result.matters.length > 0) {
        cacheClientMatters(result.matters)
        window.dispatchEvent(new CustomEvent(CLIENT_MATTERS_UPDATED_EVENT))
      }
    } catch {
      writeBusinessLeads(next)
      if (status === 'accepted' && updatedLead) upsertMatterFromLead(updatedLead)
      if (status === 'declined') {
        writeClientMatters(
          readClientMatters().map((matter) => (
            matter.leadId === id
              ? { ...matter, status: 'archived', lastActivity: new Date().toISOString() }
              : matter
          )),
        )
      }
      setSyncNotice('Saved locally. It will sync when the business database is available.')
    }
  }

  const openMessageDraft = (lead: BusinessLead) => {
    if (!lead.email) return
    window.dispatchEvent(new CustomEvent('mymckenzie-inbox-compose', {
      detail: {
        to: lead.email,
        subject: `Regarding your enquiry`,
        body: `Hello ${lead.name},\n\nThank you for your enquiry. I’m getting in touch to discuss next steps.\n\nKind regards,`,
      },
    }))
  }

  const scheduleMeetingForLead = async (lead: BusinessLead) => {
    if (lead.status !== 'accepted') {
      await updateStatus(lead.id, 'accepted')
    }
    window.dispatchEvent(new CustomEvent('mymckenzie-schedule-meeting', {
      detail: {
        clientName: lead.name,
        clientEmail: lead.email,
        context: lead.summary,
      },
    }))
  }

  const sendQuickLink = async (lead: BusinessLead) => {
    if (!lead.email) {
      setQuickLinkNotice('No client email available for invite link.')
      return
    }
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setQuickLinkNotice('Please sign in again to send invite links.')
        return
      }

      const response = await fetch('/api/business/client-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: lead.email,
          name: lead.name,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = typeof payload?.message === 'string' ? payload.message : 'Failed to send client portal invite.'
        setQuickLinkNotice(message)
        return
      }
      setQuickLinkNotice(`Client portal invite sent to ${lead.email}.`)
    } catch {
      setQuickLinkNotice('Failed to send client portal invite. Please try again.')
    }
  }

  const statusCls = (status: LeadStatus) => {
    if (status === 'new') return styles.statusNew
    if (status === 'accepted') return styles.statusAccepted
    if (status === 'declined') return styles.statusDeclined
    return styles.statusPending
  }

  const counts = {
    all: leads.length,
    new: leads.filter((lead) => lead.status === 'new').length,
    accepted: leads.filter((lead) => lead.status === 'accepted').length,
    declined: leads.filter((lead) => lead.status === 'declined').length,
  }

  return (
    <div className={styles.leadsPage}>
      <div className={styles.leadsPanel}>
        <div className={styles.leadsPanelHeader}>
          <h2 className={styles.leadsPanelTitle}>Leads &amp; Enquiries</h2>
          <p className={styles.leadsPanelSub}>Requests submitted via the client portal</p>
          <div className={styles.tabRow}>
            {(['all', 'new', 'accepted'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)} {counts[tab] > 0 && `(${counts[tab]})`}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'declined' ? styles.tabActive : styles.tabSecondary}`}
              onClick={() => setActiveTab((current) => (current === 'declined' ? 'all' : 'declined'))}
              aria-pressed={activeTab === 'declined'}
            >
              Declined {counts.declined > 0 && `(${counts.declined})`}
            </button>
          </div>
          {(loading || syncNotice) && (
            <p className={styles.syncNotice}>{loading ? 'Loading saved leads...' : syncNotice}</p>
          )}
        </div>

        <div className={styles.enquiryList}>
          {filteredLeads.length === 0 && (
            <div className={styles.emptyList}>
              <UserRound size={32} />
              <p>No enquiries here</p>
            </div>
          )}
          {filteredLeads.map((lead) => (
            <div
              key={lead.id}
              role="button"
              tabIndex={0}
              className={`${styles.enquiryCard} ${selectedLead?.id === lead.id ? styles.enquiryCardActive : ''}`}
              onClick={() => setSelectedLeadId(lead.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setSelectedLeadId(lead.id)
              }}
            >
              <div className={styles.enquiryCardTop}>
                <span className={styles.enquiryName}>{lead.name}</span>
                <span className={styles.enquiryTime}>{formatSubmittedAt(lead.submittedAt)}</span>
              </div>
              <p className={styles.enquiryPreview}>{lead.summary}</p>
              <span className={`${styles.statusBadge} ${statusCls(lead.status)}`}>
                {STATUS_LABELS[lead.status]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.detailPanel}>
        {!selectedLead ? (
          <div className={styles.noSelection}>
            <UserRound size={44} />
            <p>Select an enquiry to view details</p>
          </div>
        ) : (
          <>
            <div className={styles.detailHeader}>
              <div className={styles.detailHeaderTop}>
                <div className={styles.detailTitleBlock}>
                  <h2 className={styles.detailName}>{selectedLead.name}</h2>
                  <p className={styles.detailSubtitle}>Client enquiry</p>
                </div>
                <div className={styles.detailActionRow}>
                  <div className={styles.detailActionPrimary}>
                    {selectedLead.status !== 'accepted' && (
                      <button
                        type="button"
                        className={styles.acceptBtn}
                        onClick={() => updateStatus(selectedLead.id, 'accepted')}
                      >
                        <CheckCircle2 size={15} />
                        Accept
                      </button>
                    )}
                    {selectedLead.status !== 'declined' && (
                      <button
                        type="button"
                        className={styles.createMatterBtn}
                        onClick={() => updateStatus(selectedLead.id, 'accepted')}
                      >
                        <CheckCircle2 size={15} />
                        Create work item
                      </button>
                    )}
                    {selectedLead.status !== 'declined' && (
                      <button
                        type="button"
                        className={styles.declineBtn}
                        onClick={() => updateStatus(selectedLead.id, 'declined')}
                      >
                        <XCircle size={15} />
                        Decline
                      </button>
                    )}
                  </div>
                  <div className={styles.detailActionSecondary}>
                    {selectedLead.status !== 'declined' && (
                      <button
                        type="button"
                        className={styles.secondaryActionBtn}
                        onClick={() => void scheduleMeetingForLead(selectedLead)}
                      >
                        Schedule video meeting
                      </button>
                    )}
                    {selectedLead.email && selectedLead.status !== 'declined' && (
                      <button
                        type="button"
                        className={styles.secondaryActionBtn}
                        onClick={() => void sendQuickLink(selectedLead)}
                      >
                      Invite to client portal
                    </button>
                  )}
                    {selectedLead.email && selectedLead.status !== 'declined' && (
                      <button
                        type="button"
                        className={styles.secondaryActionBtn}
                        onClick={() => openMessageDraft(selectedLead)}
                      >
                        Message client
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {quickLinkNotice && <p className={styles.syncNotice}>{quickLinkNotice}</p>}

              <div className={styles.detailMetaRow}>
                <span className={styles.detailMetaItem}>
                  <Mail size={13} />
                  <strong>{selectedLead.email}</strong>
                </span>
                <span className={styles.detailMetaItem}>
                  <Phone size={13} />
                  <strong>{selectedLead.phone}</strong>
                </span>
                <span className={styles.detailMetaItem}>
                  <Clock size={13} />
                  Submitted {formatSubmittedAt(selectedLead.submittedAt)}
                </span>
                {extractLeadTraceId(selectedLead) && (
                  <span className={styles.detailMetaItem}>
                    <strong>Trace:</strong> {extractLeadTraceId(selectedLead)}
                  </span>
                )}
              </div>
            </div>

            <div className={styles.detailBody}>
              <div className={styles.detailSection}>
                <span className={styles.detailSectionLabel}>Status</span>
                <div className={styles.detailTagRow}>
                  <span className={`${styles.statusBadge} ${statusCls(selectedLead.status)}`}>
                    {STATUS_LABELS[selectedLead.status]}
                  </span>
                  <span className={styles.detailTag}>{selectedLead.source === 'portal' ? 'Via Portal' : selectedLead.source === 'referral' ? 'Referral' : 'Direct'}</span>
                </div>
              </div>

              <div className={styles.divider} />

              <div className={`${styles.detailSection} ${styles.detailSectionCard}`}>
                <span className={styles.detailSectionLabel}>Enquiry details</span>
                <p className={styles.detailSectionText}>{selectedLead.fullDetails}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Social feed removed for now. */}
    </div>
  )
}
