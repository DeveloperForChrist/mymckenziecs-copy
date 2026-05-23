'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  ChevronRight,
  X,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import {
  BUSINESS_LEADS_UPDATED_EVENT,
  CLIENT_MATTERS_UPDATED_EVENT,
  type ClientMatter,
  type MatterStage,
  cacheClientMatters,
  createBlankMatter,
  createClientMatter,
  fetchClientMatters,
  readBusinessLeads,
  readClientMatters,
  syncAcceptedLeadMatters,
  updateClientMatter,
  writeClientMatters,
} from '@/lib/business/client-matters'
import MatterDocumentsPanel from '@/components/business/MatterDocumentsPanel'
import styles from './clientMatters.module.css'

const STAGE_LABELS: Record<MatterStage, string> = {
  intake: 'Intake',
  documents: 'Documents',
  advice: 'Advice',
  hearing: 'Hearing',
  closed: 'Closed',
}

const stageOptions = Object.keys(STAGE_LABELS) as MatterStage[]
const ownerOptions = ['Unassigned', 'You', 'Support assistant', 'External advisor']

function formatDate(value?: string) {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatLastActivity(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function ClientMattersPage() {
  const [matters, setMatters] = useState<ClientMatter[]>([])
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null)
  const [checkedMatterIds, setCheckedMatterIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<'all' | MatterStage>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<'overview' | 'documents'>('overview')
  const [createForm, setCreateForm] = useState({
    clientName: '',
    email: '',
    phone: '',
    location: '',
    issueType: '',
    summary: '',
  })

  const applyMatters = (nextMatters: ClientMatter[]) => {
    setMatters(nextMatters)
    setSelectedMatterId((current) => {
      if (!current) return null
      if (nextMatters.some((matter) => matter.id === current)) return current
      return null
    })
  }

  useEffect(() => {
    let mounted = true

    const applyIfMounted = (nextMatters: ClientMatter[]) => {
      if (!mounted) return
      applyMatters(nextMatters)
    }

    const loadLocalMatters = () => {
      const synced = syncAcceptedLeadMatters(readBusinessLeads())
      const nextMatters = synced.length > 0 ? synced : readClientMatters()
      applyIfMounted(nextMatters)
    }

    const loadRemoteMatters = async () => {
      setLoading(true)
      try {
        const remoteMatters = await fetchClientMatters()
        cacheClientMatters(remoteMatters)
        applyIfMounted(remoteMatters)
        setSyncNotice(null)
      } catch {
        loadLocalMatters()
        setSyncNotice('Using local client work until the business database is available.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadRemoteMatters()
    window.addEventListener(CLIENT_MATTERS_UPDATED_EVENT, loadLocalMatters)
    window.addEventListener(BUSINESS_LEADS_UPDATED_EVENT, loadLocalMatters)
    window.addEventListener('storage', loadLocalMatters)
    return () => {
      mounted = false
      window.removeEventListener(CLIENT_MATTERS_UPDATED_EVENT, loadLocalMatters)
      window.removeEventListener(BUSINESS_LEADS_UPDATED_EVENT, loadLocalMatters)
      window.removeEventListener('storage', loadLocalMatters)
    }
  }, [])

  const visibleMatters = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase()
    return matters.filter((matter) => {
      if (!showArchived && matter.status === 'archived') return false
      if (showArchived && matter.status !== 'archived') return false
      if (stageFilter !== 'all' && matter.stage !== stageFilter) return false
      if (!normalisedQuery) return true
      return [
        matter.clientName,
        matter.matterNumber,
        matter.issueType,
        matter.summary,
        matter.email,
        matter.location,
      ].some((value) => value.toLowerCase().includes(normalisedQuery))
    })
  }, [matters, query, showArchived, stageFilter])

  const selectedMatter = useMemo(
    () => matters.find((matter) => matter.id === selectedMatterId) ?? null,
    [matters, selectedMatterId],
  )
  const glanceItems = useMemo(() => {
    if (!selectedMatter) return []
    return [
      {
        label: 'Client contact details',
        value: selectedMatter.email || selectedMatter.phone ? 'Complete' : 'Missing',
      },
      {
        label: 'Next deadline',
        value: selectedMatter.nextDeadline ? formatDate(selectedMatter.nextDeadline) : 'Not set',
      },
      {
        label: 'Documents linked',
        value: selectedMatter.documents.length > 0 ? `${selectedMatter.documents.length} file(s)` : 'None',
      },
      {
        label: 'Responsible person',
        value: selectedMatter.owner,
      },
      {
        label: 'Last updated',
        value: formatLastActivity(selectedMatter.lastActivity),
      },
    ]
  }, [selectedMatter])

  useEffect(() => {
    if (!selectedMatterId) return
    const next = matters.find((matter) => matter.id === selectedMatterId)
    if (!next) return
    setDetailTab(next.stage === 'documents' ? 'documents' : 'overview')
  }, [matters, selectedMatterId])

  const stats = useMemo(() => {
    const active = matters.filter((matter) => matter.status === 'active')
    return {
      clients: new Set(active.map((matter) => matter.email || matter.clientName)).size,
      matters: active.length,
      urgent: active.filter((matter) => matter.urgency === 'high').length,
    }
  }, [matters])

  const updateMatter = async (id: string, patch: Partial<ClientMatter>) => {
    const optimistic = matters.map((matter) => (
        matter.id === id
          ? { ...matter, ...patch, lastActivity: new Date().toISOString() }
          : matter
      ))
    setMatters(optimistic)
    cacheClientMatters(optimistic)
    setSyncNotice(null)

    try {
      const updated = await updateClientMatter(id, patch)
      const remoteMatters = optimistic.map((matter) => (matter.id === id ? updated : matter))
      setMatters(remoteMatters)
      cacheClientMatters(remoteMatters)
    } catch {
      writeClientMatters(optimistic)
      setSyncNotice('Saved locally. It will sync when the business database is available.')
    }
  }

  const createMatter = async (payload: typeof createForm) => {
    const matter = createBlankMatter()
    matter.clientName = payload.clientName.trim() || 'Client'
    matter.email = payload.email.trim()
    matter.phone = payload.phone.trim()
    matter.location = payload.location.trim()
    matter.issueType = payload.issueType.trim() || 'New legal work item'
    matter.summary = payload.summary.trim() || 'Client enquiry received. Add a summary and next steps.'
    const optimistic = [matter, ...matters]
    setMatters(optimistic)
    cacheClientMatters(optimistic)
    setSelectedMatterId(matter.id)
    setCheckedMatterIds([matter.id])
    setShowArchived(false)
    setSyncNotice(null)

    try {
      const created = await createClientMatter(matter)
      const remoteMatters = optimistic.map((item) => (item.id === matter.id ? created : item))
      setMatters(remoteMatters)
      cacheClientMatters(remoteMatters)
      setSelectedMatterId(created.id)
      setCheckedMatterIds([created.id])
    } catch {
      writeClientMatters(optimistic)
      setSyncNotice('Saved locally. It will sync when the business database is available.')
    }
  }

  const archiveMatter = async (id: string, status: ClientMatter['status']) => {
    await updateMatter(id, { status })
    setCheckedMatterIds((current) => current.filter((matterId) => matterId !== id))
  }

  const archiveCheckedMatters = async () => {
    if (checkedMatterIds.length === 0) return
    const nextStatus: ClientMatter['status'] = showArchived ? 'active' : 'archived'
    const ids = checkedMatterIds
    const optimistic = matters.map((matter) => (
        checkedMatterIds.includes(matter.id)
          ? { ...matter, status: nextStatus, lastActivity: new Date().toISOString() }
          : matter
      ))
    setMatters(optimistic)
    cacheClientMatters(optimistic)
    setCheckedMatterIds([])
    setSyncNotice(null)

    try {
      const updatedMatters = await Promise.all(ids.map((id) => updateClientMatter(id, { status: nextStatus })))
      const updatedById = new Map(updatedMatters.map((matter) => [matter.id, matter]))
      const remoteMatters = optimistic.map((matter) => updatedById.get(matter.id) ?? matter)
      setMatters(remoteMatters)
      cacheClientMatters(remoteMatters)
    } catch {
      writeClientMatters(optimistic)
      setSyncNotice('Saved locally. It will sync when the business database is available.')
    }
  }

  const toggleCheckedMatter = (id: string) => {
    setCheckedMatterIds((current) => (
      current.includes(id)
        ? current.filter((matterId) => matterId !== id)
        : [...current, id]
    ))
  }

  return (
    <div className={styles.page}>
      {createOpen && (
        <div
          className={styles.createOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Create work item"
          onClick={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false)
          }}
        >
          <div className={styles.createModal}>
            <div className={styles.createHeader}>
              <h2>Create work item</h2>
              <button type="button" onClick={() => setCreateOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <form
              className={styles.createForm}
              onSubmit={(event) => {
                event.preventDefault()
                void createMatter(createForm).then(() => {
                  setCreateOpen(false)
                  setCreateForm({ clientName: '', email: '', phone: '', location: '', issueType: '', summary: '' })
                })
              }}
            >
              <div className={styles.createGrid}>
                <label>
                  <span>Client name</span>
                  <input
                    value={createForm.clientName}
                    onChange={(e) => setCreateForm((p) => ({ ...p, clientName: e.target.value }))}
                    placeholder="Client name"
                    required
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="client@email.com"
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <input
                    value={createForm.phone}
                    onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="07..."
                  />
                </label>
                <label>
                  <span>Location</span>
                  <input
                    value={createForm.location}
                    onChange={(e) => setCreateForm((p) => ({ ...p, location: e.target.value }))}
                    placeholder="City / Postcode"
                  />
                </label>
              </div>
              <label>
                <span>Issue type</span>
                <input
                  value={createForm.issueType}
                  onChange={(e) => setCreateForm((p) => ({ ...p, issueType: e.target.value }))}
                  placeholder="e.g. Housing disrepair"
                />
              </label>
              <label>
                <span>Summary</span>
                <textarea
                  value={createForm.summary}
                  onChange={(e) => setCreateForm((p) => ({ ...p, summary: e.target.value }))}
                  rows={4}
                  placeholder="Short summary of the issue and immediate next steps…"
                />
              </label>
              <div className={styles.createActions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Create work item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.kicker}>Case books</span>
          <h1>Client Work</h1>
          <p>A simple solo workspace for client issues, deadlines, documents and next actions.</p>
          {(loading || syncNotice) && (
            <p className={styles.syncNotice}>{loading ? 'Loading saved client work...' : syncNotice}</p>
          )}
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span>{stats.clients}</span>
            <p>Clients</p>
          </div>
          <div className={styles.stat}>
            <span>{stats.matters}</span>
            <p>Work items</p>
          </div>
          <div className={styles.stat}>
            <span>{stats.urgent}</span>
            <p>Urgent</p>
          </div>
        </div>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.searchBox}>
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clients, work items, issue types..."
          />
        </label>

        <select
          className={styles.select}
          value={stageFilter}
          onChange={(event) => setStageFilter(event.target.value as 'all' | MatterStage)}
          aria-label="Filter by work stage"
        >
          <option value="all">All stages</option>
          {stageOptions.map((stage) => (
            <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
          ))}
        </select>

        <button type="button" className={styles.secondaryBtn} onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          {showArchived ? 'Active client work' : 'Archived clients'}
        </button>
        <button type="button" className={styles.secondaryBtn} disabled={checkedMatterIds.length === 0} onClick={archiveCheckedMatters}>
          {showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          {showArchived ? 'Restore selected' : 'Archive selected'}
        </button>
        <button type="button" className={styles.primaryBtn} onClick={() => setCreateOpen(true)}>
          <Plus size={15} />
          Create work item
        </button>
      </div>

      <div className={`${styles.body} ${selectedMatter ? styles.bodyDetailOpen : styles.bodyListOnly}`}>
        <section className={styles.tablePanel} aria-label="Client work items">
          <div className={styles.tableHeader}>
            <span />
            <span>Client</span>
            <span>Number</span>
            <span>Last activity</span>
            <span>Stage</span>
            <span>Actions</span>
          </div>

          <div className={styles.tableBody}>
            {visibleMatters.length === 0 && (
              <div className={styles.emptyState}>
                <UsersRound size={36} />
                <h2>No client work yet</h2>
                <p>Accept a lead or create a work item to populate this list.</p>
              </div>
            )}

            {visibleMatters.map((matter) => {
              const checked = checkedMatterIds.includes(matter.id)
              const selected = selectedMatter?.id === matter.id
              return (
                <div
                  key={matter.id}
                  role="button"
                  tabIndex={0}
                  className={`${styles.tableRow} ${selected ? styles.tableRowActive : ''}`}
                  onClick={() => setSelectedMatterId((current) => (current === matter.id ? null : matter.id))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') setSelectedMatterId((current) => (current === matter.id ? null : matter.id))
                  }}
                >
                  <label className={styles.checkCell} onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCheckedMatter(matter.id)}
                      aria-label={`Select ${matter.clientName}`}
                    />
                  </label>
                  <div className={styles.clientCell}>
                    <strong>{matter.clientName}</strong>
                    <span>{matter.issueType}</span>
                  </div>
                  <span className={styles.matterNumber}>{matter.matterNumber}</span>
                  <span>{formatLastActivity(matter.lastActivity)}</span>
                  <span className={`${styles.stagePill} ${styles[`stage_${matter.stage}`]}`}>
                    {STAGE_LABELS[matter.stage]}
                  </span>
                  <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
                    <button type="button" title="Open work item" onClick={() => setSelectedMatterId(matter.id)}>
                      <ChevronRight size={15} />
                    </button>
                    <button
                      type="button"
                      title={matter.status === 'archived' ? 'Restore work item' : 'Archive work item'}
                      onClick={() => archiveMatter(matter.id, matter.status === 'archived' ? 'active' : 'archived')}
                    >
                      {matter.status === 'archived' ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {selectedMatter && (
          <aside className={styles.detailPanel}>
            <>
              <div className={styles.detailHeader}>
                <span className={`${styles.riskBadge} ${styles[`risk_${selectedMatter.urgency}`]}`}>
                  <ShieldAlert size={13} />
                  {selectedMatter.urgency} priority
                </span>
                <button type="button" className={styles.closeDetail} onClick={() => setSelectedMatterId(null)} aria-label="Close work panel">
                  <X size={16} />
                </button>
                <h2>{selectedMatter.clientName}</h2>
                <p>{selectedMatter.issueType}</p>
              </div>

              <div className={styles.detailTabs} role="tablist" aria-label="Client work workspace">
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === 'overview'}
                  className={`${styles.detailTab} ${detailTab === 'overview' ? styles.detailTabActive : ''}`}
                  onClick={() => setDetailTab('overview')}
                >
                  Overview
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === 'documents'}
                  className={`${styles.detailTab} ${detailTab === 'documents' ? styles.detailTabActive : ''}`}
                  onClick={() => setDetailTab('documents')}
                >
                  Documents
                </button>
              </div>

              <div className={styles.detailBody}>
                <div className={styles.quickFacts}>
                  <span><Mail size={14} /> {selectedMatter.email || 'No email'}</span>
                  <span><Phone size={14} /> {selectedMatter.phone || 'No phone'}</span>
                  <span><CalendarClock size={14} /> {formatDate(selectedMatter.nextDeadline)}</span>
                </div>

                <label className={styles.controlGroup}>
                  <span>Stage</span>
                  <select
                    value={selectedMatter.stage}
                    onChange={(event) => updateMatter(selectedMatter.id, { stage: event.target.value as MatterStage })}
                  >
                    {stageOptions.map((stage) => (
                      <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.controlGroup}>
                  <span>Responsible person</span>
                  <select
                    value={selectedMatter.owner}
                    onChange={(event) => updateMatter(selectedMatter.id, { owner: event.target.value })}
                  >
                    {ownerOptions.map((owner) => (
                      <option key={owner} value={owner}>{owner}</option>
                    ))}
                  </select>
                </label>

                {detailTab === 'overview' ? (
                  <>
                    <section className={styles.detailSection}>
                      <h3>Next action</h3>
                      <p>{selectedMatter.nextAction}</p>
                    </section>

                    <section className={styles.detailSection}>
                      <h3>Issue summary</h3>
                      <p>{selectedMatter.summary}</p>
                    </section>

                    <section className={styles.detailSection}>
                      <h3>Documents</h3>
                      <div className={styles.documentsSummaryRow}>
                        <div className={styles.tagRow}>
                          {selectedMatter.documents.length > 0 ? (
                            selectedMatter.documents.slice(0, 4).map((documentName) => (
                              <span key={documentName}>{documentName}</span>
                            ))
                          ) : (
                            <span>No documents yet</span>
                          )}
                          {selectedMatter.documents.length > 4 && (
                            <span>+{selectedMatter.documents.length - 4} more</span>
                          )}
                        </div>
                        <button type="button" className={styles.linkBtn} onClick={() => setDetailTab('documents')}>
                          Open documents
                        </button>
                      </div>
                    </section>

                    <section className={styles.detailSection}>
                      <h3>Tags</h3>
                      <div className={styles.tagRow}>
                        {selectedMatter.tags.map((tag) => <span key={tag}>{tag}</span>)}
                      </div>
                    </section>

                    <section className={styles.detailSection}>
                      <h3>At a glance</h3>
                      <div className={styles.simpleList}>
                        {glanceItems.map((item) => (
                          <div key={item.label} className={styles.simpleListItem}>
                            <strong>{item.label}</strong>
                            <span>{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                ) : (
                  <MatterDocumentsPanel matter={selectedMatter} />
                )}

                {selectedMatter.status === 'active' && (
                  <button
                    type="button"
                    className={styles.contactBtn}
                    disabled={!selectedMatter.email}
                    onClick={() => {
                      if (!selectedMatter.email) return
                      window.dispatchEvent(new CustomEvent('mymckenzie-inbox-compose', {
                        detail: {
                          to: selectedMatter.email,
                          subject: `Regarding your client work ${selectedMatter.matterNumber}`,
                        },
                      }))
                    }}
                    title={selectedMatter.email ? 'Message client' : 'No email address on file'}
                  >
                    <UserPlus size={15} />
                    Message client
                  </button>
                )}
              </div>
            </>
          </aside>
        )}
      </div>
    </div>
  )
}
