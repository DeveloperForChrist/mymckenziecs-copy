'use client'

import { Archive, ArchiveRestore, ChevronRight, UsersRound } from 'lucide-react'
import type { ClientMatter } from '@/lib/business/client-matters'
import { formatLastActivity, STAGE_LABELS } from '../model'
import styles from '@/components/business/clientMatters.module.css'

type Props = {
  matters: ClientMatter[]
  selectedMatterId: string | null
  checkedMatterIds: string[]
  onSelect: (id: string | null) => void
  onToggleChecked: (id: string) => void
  onArchive: (matter: ClientMatter, status: ClientMatter['status']) => Promise<void>
}

export default function MatterList({ matters, selectedMatterId, checkedMatterIds, onSelect, onToggleChecked, onArchive }: Props) {
  return (
    <section className={styles.tablePanel} aria-label="Client work items">
      <div className={styles.tableHeader}>
        <span /><span>Client</span><span>Number</span><span>Last activity</span><span>Stage</span><span>Actions</span>
      </div>
      <div className={styles.tableBody}>
        {matters.length === 0 && (
          <div className={styles.emptyState}>
            <UsersRound size={36} />
            <h2>No client work yet</h2>
            <p>Accept a lead or create a work item to populate this list.</p>
          </div>
        )}
        {matters.map((matter) => {
          const checked = checkedMatterIds.includes(matter.id)
          const selected = selectedMatterId === matter.id
          return (
            <div
              key={matter.id}
              role="button"
              tabIndex={0}
              className={`${styles.tableRow} ${selected ? styles.tableRowActive : ''}`}
              onClick={() => onSelect(selected ? null : matter.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSelect(selected ? null : matter.id)
              }}
            >
              <label className={styles.checkCell} onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" checked={checked} onChange={() => onToggleChecked(matter.id)} aria-label={`Select ${matter.clientName}`} />
              </label>
              <div className={styles.clientCell}><strong>{matter.clientName}</strong><span>{matter.issueType}</span></div>
              <span className={styles.matterNumber}>{matter.matterNumber}</span>
              <span>{formatLastActivity(matter.lastActivity)}</span>
              <span className={`${styles.stagePill} ${styles[`stage_${matter.stage}`]}`}>{STAGE_LABELS[matter.stage]}</span>
              <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
                <button type="button" title="Open work item" onClick={() => onSelect(matter.id)}><ChevronRight size={15} /></button>
                <button
                  type="button"
                  title={matter.status === 'archived' ? 'Restore work item' : 'Archive work item'}
                  onClick={() => void onArchive(matter, matter.status === 'archived' ? 'active' : 'archived')}
                >
                  {matter.status === 'archived' ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
