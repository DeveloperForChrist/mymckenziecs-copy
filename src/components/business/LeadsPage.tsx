'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Phone,
  Rss,
  Tag,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react'
import {
  BUSINESS_LEADS_UPDATED_EVENT,
  CLIENT_MATTERS_UPDATED_EVENT,
  DEFAULT_BUSINESS_LEADS,
  type BusinessLead,
  type LeadStatus,
  type Urgency,
  cacheBusinessLeads,
  cacheClientMatters,
  fetchBusinessLeads,
  readClientMatters,
  readBusinessLeads,
  syncAcceptedLeadMatters,
  updateBusinessLeadStatus,
  upsertMatterFromLead,
  writeClientMatters,
  writeBusinessLeads,
} from '@/lib/business/client-matters'
import styles from './leads.module.css'

const socialFeedItems = [
  { source: 'Twitter / X', text: '"Anyone dealt with a retaliatory Section 21 in London? Landlord served notice 2 weeks after I reported disrepair to council. #TenantRights"', time: '15 min ago' },
  { source: 'Reddit r/LegalAdviceUK', text: 'Thread: "ET1 deadline panic - dismissed after whistleblowing, can I still file?" - 47 comments', time: '1 hour ago' },
  { source: 'Facebook Groups', text: 'Post in "UK Housing Help": "Mould and damp ignored for 6 months - landlord threatening eviction if I complain again"', time: '3 hours ago' },
]

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  accepted: 'Accepted',
  declined: 'Declined',
  pending: 'Reviewing',
}

const URGENCY_LABELS: Record<Urgency, string> = {
  high: 'High Urgency',
  medium: 'Medium',
  low: 'Low',
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

export default function LeadsPage() {
  const [leads, setLeads] = useState<BusinessLead[]>(DEFAULT_BUSINESS_LEADS)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(DEFAULT_BUSINESS_LEADS[0]?.id ?? null)
  const [activeTab, setActiveTab] = useState<'all' | 'new' | 'accepted' | 'declined'>('all')
  const [loading, setLoading] = useState(true)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

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

  const statusCls = (status: LeadStatus) => {
    if (status === 'new') return styles.statusNew
    if (status === 'accepted') return styles.statusAccepted
    if (status === 'declined') return styles.statusDeclined
    return styles.statusPending
  }

  const urgencyCls = (urgency: Urgency) => {
    if (urgency === 'high') return styles.urgencyHigh
    if (urgency === 'medium') return styles.urgencyMedium
    return styles.urgencyLow
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
            {(['all', 'new', 'accepted', 'declined'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)} {counts[tab] > 0 && `(${counts[tab]})`}
              </button>
            ))}
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
              <p className={styles.enquiryIssueType}>{lead.issueType}</p>
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
                <h2 className={styles.detailName}>{selectedLead.name}</h2>
                <div className={styles.detailActionRow}>
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
                      className={styles.declineBtn}
                      onClick={() => updateStatus(selectedLead.id, 'declined')}
                    >
                      <XCircle size={15} />
                      Decline
                    </button>
                  )}
                </div>
              </div>

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
                  <MapPin size={13} />
                  <strong>{selectedLead.location}</strong>
                </span>
                <span className={styles.detailMetaItem}>
                  <Clock size={13} />
                  Submitted {formatSubmittedAt(selectedLead.submittedAt)}
                </span>
                {selectedLead.courtDate && (
                  <span className={styles.detailMetaItem}>
                    <AlertTriangle size={13} />
                    Court / deadline: <strong>{selectedLead.courtDate}</strong>
                  </span>
                )}
              </div>
            </div>

            <div className={styles.detailBody}>
              <div className={styles.detailSection}>
                <span className={styles.detailSectionLabel}>Status &amp; Urgency</span>
                <div className={styles.detailTagRow}>
                  <span className={`${styles.statusBadge} ${statusCls(selectedLead.status)}`}>
                    {STATUS_LABELS[selectedLead.status]}
                  </span>
                  <span className={`${styles.detailTag} ${urgencyCls(selectedLead.urgency)}`}>
                    {URGENCY_LABELS[selectedLead.urgency]}
                  </span>
                  <span className={styles.detailTag}>{selectedLead.source === 'portal' ? 'Via Portal' : selectedLead.source === 'referral' ? 'Referral' : 'Direct'}</span>
                </div>
              </div>

              <div className={styles.divider} />

              <div className={styles.detailSection}>
                <span className={styles.detailSectionLabel}>Area of Law</span>
                <p className={styles.detailSectionText}>{selectedLead.issueType}</p>
              </div>

              <div className={styles.detailSection}>
                <span className={styles.detailSectionLabel}>Full Description</span>
                <p className={styles.detailSectionText}>{selectedLead.fullDetails}</p>
              </div>

              {selectedLead.opposing && (
                <div className={styles.detailSection}>
                  <span className={styles.detailSectionLabel}>Opposing Party</span>
                  <p className={styles.detailSectionText}>{selectedLead.opposing}</p>
                </div>
              )}

              {selectedLead.documents.length > 0 && (
                <div className={styles.detailSection}>
                  <span className={styles.detailSectionLabel}>Documents Available</span>
                  <div className={styles.detailTagRow}>
                    {selectedLead.documents.map((documentName) => (
                      <span key={documentName} className={styles.detailTag}>{documentName}</span>
                    ))}
                  </div>
                </div>
              )}

              {selectedLead.tags.length > 0 && (
                <div className={styles.detailSection}>
                  <span className={styles.detailSectionLabel}><Tag size={11} style={{ display: 'inline', marginRight: 4 }} />Tags</span>
                  <div className={styles.detailTagRow}>
                    {selectedLead.tags.map((tag) => (
                      <span key={tag} className={styles.detailTag}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className={styles.socialPanel}>
        <div className={styles.socialPanelHeader}>
          <p className={styles.socialPanelTitle}>
            <Rss size={13} style={{ display: 'inline', marginRight: 6 }} />
            Legal Updates Feed
          </p>
          <p className={styles.socialPanelSub}>Public posts about legal issues - potential leads</p>
        </div>
        <div className={styles.socialFeed}>
          {socialFeedItems.map((item) => (
            <div key={`${item.source}-${item.time}`} className={styles.socialFeedItem}>
              <div className={styles.socialFeedSource}>
                <span className={styles.socialFeedSourceDot} />
                {item.source}
              </div>
              <p className={styles.socialFeedText}>{item.text}</p>
              <span className={styles.socialFeedMeta}>{item.time}</span>
            </div>
          ))}
          <div className={styles.socialComingSoon}>
            <Users size={28} style={{ opacity: 0.3 }} />
            <p>Full social media integration coming soon. Live feeds from Twitter/X, Reddit, Facebook Groups and more.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
