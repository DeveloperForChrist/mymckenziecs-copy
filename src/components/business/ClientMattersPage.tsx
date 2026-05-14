'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  ChevronRight,
  FileText,
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
import styles from './clientMatters.module.css'

const STAGE_LABELS: Record<MatterStage, string> = {
  intake: 'Intake',
  documents: 'Documents',
  advice: 'Advice',
  hearing: 'Hearing',
  closed: 'Closed',
}

const stageOptions = Object.keys(STAGE_LABELS) as MatterStage[]
const ownerOptions = ['Unassigned', 'You', 'Paralegal team', 'External counsel']

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

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

  const applyMatters = (nextMatters: ClientMatter[]) => {
    setMatters(nextMatters)
    setSelectedMatterId((current) => {
      if (current && nextMatters.some((matter) => matter.id === current)) return current
      return nextMatters.find((matter) => matter.status === 'active')?.id ?? nextMatters[0]?.id ?? null
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
        setSyncNotice('Using local matters until the business database is available.')
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

  const stats = useMemo(() => {
    const active = matters.filter((matter) => matter.status === 'active')
    return {
      clients: new Set(active.map((matter) => matter.email || matter.clientName)).size,
      matters: active.length,
      urgent: active.filter((matter) => matter.urgency === 'high').length,
      balance: active.reduce((sum, matter) => sum + matter.currentBalance, 0),
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

  const createMatter = async () => {
    const matter = createBlankMatter()
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
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.kicker}>Case books</span>
          <h1>Clients and Matters List</h1>
          <p>Client roster, legal issues, deadlines, balance, ownership and next actions.</p>
          {(loading || syncNotice) && (
            <p className={styles.syncNotice}>{loading ? 'Loading saved matters...' : syncNotice}</p>
          )}
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span>{stats.clients}</span>
            <p>Clients</p>
          </div>
          <div className={styles.stat}>
            <span>{stats.matters}</span>
            <p>Matters</p>
          </div>
          <div className={styles.stat}>
            <span>{stats.urgent}</span>
            <p>Urgent</p>
          </div>
          <div className={styles.stat}>
            <span>{formatMoney(stats.balance)}</span>
            <p>Balance</p>
          </div>
        </div>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.searchBox}>
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clients, matters, issue types..."
          />
        </label>

        <select
          className={styles.select}
          value={stageFilter}
          onChange={(event) => setStageFilter(event.target.value as 'all' | MatterStage)}
          aria-label="Filter by matter stage"
        >
          <option value="all">All stages</option>
          {stageOptions.map((stage) => (
            <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
          ))}
        </select>

        <button type="button" className={styles.secondaryBtn} onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          {showArchived ? 'Active matters' : 'Archived clients'}
        </button>
        <button type="button" className={styles.secondaryBtn} disabled={checkedMatterIds.length === 0} onClick={archiveCheckedMatters}>
          {showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          {showArchived ? 'Restore selected' : 'Archive selected'}
        </button>
        <button type="button" className={styles.primaryBtn} onClick={createMatter}>
          <Plus size={15} />
          Create matter
        </button>
      </div>

      <div className={styles.body}>
        <section className={styles.tablePanel} aria-label="Client matters">
          <div className={styles.tableHeader}>
            <span />
            <span>Client</span>
            <span>Number</span>
            <span>Last activity</span>
            <span>Stage</span>
            <span>Current balance</span>
            <span>Actions</span>
          </div>

          <div className={styles.tableBody}>
            {visibleMatters.length === 0 && (
              <div className={styles.emptyState}>
                <UsersRound size={36} />
                <h2>No client matters</h2>
                <p>Accept a lead or create a matter to populate this list.</p>
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
                  onClick={() => setSelectedMatterId(matter.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') setSelectedMatterId(matter.id)
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
                  <span className={styles.balance}>{formatMoney(matter.currentBalance)}</span>
                  <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
                    <button type="button" title="Open matter" onClick={() => setSelectedMatterId(matter.id)}>
                      <ChevronRight size={15} />
                    </button>
                    <button
                      type="button"
                      title={matter.status === 'archived' ? 'Restore matter' : 'Archive matter'}
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

        <aside className={styles.detailPanel}>
          {!selectedMatter ? (
            <div className={styles.emptyDetail}>
              <FileText size={38} />
              <p>Select a matter</p>
            </div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <span className={`${styles.riskBadge} ${styles[`risk_${selectedMatter.urgency}`]}`}>
                  <ShieldAlert size={13} />
                  {selectedMatter.urgency} priority
                </span>
                <h2>{selectedMatter.clientName}</h2>
                <p>{selectedMatter.issueType}</p>
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
                  <span>Owner</span>
                  <select
                    value={selectedMatter.owner}
                    onChange={(event) => updateMatter(selectedMatter.id, { owner: event.target.value })}
                  >
                    {ownerOptions.map((owner) => (
                      <option key={owner} value={owner}>{owner}</option>
                    ))}
                  </select>
                </label>

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
                  <div className={styles.tagRow}>
                    {selectedMatter.documents.length > 0 ? (
                      selectedMatter.documents.map((documentName) => (
                        <span key={documentName}>{documentName}</span>
                      ))
                    ) : (
                      <span>No documents yet</span>
                    )}
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Tags</h3>
                  <div className={styles.tagRow}>
                    {selectedMatter.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                </section>

                {selectedMatter.status === 'active' && (
                  <button type="button" className={styles.contactBtn}>
                    <UserPlus size={15} />
                    Contact client
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
