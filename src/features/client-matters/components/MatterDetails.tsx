'use client'

import type { Dispatch, SetStateAction } from 'react'
import {
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  Edit3,
  Mail,
  Phone,
  Save,
  ShieldAlert,
  UserPlus,
  X,
} from 'lucide-react'
import MatterDocumentsPanel from '@/components/business/MatterDocumentsPanel'
import type { ClientMatter, MatterStage } from '@/lib/business/client-matters'
import {
  formatDate,
  OWNER_OPTIONS,
  STAGE_LABELS,
  STAGE_OPTIONS,
  type DetailTab,
  type MatterEditForm,
} from '../model'
import styles from '@/components/business/clientMatters.module.css'

type GlanceItem = { label: string; value: string }

type Props = {
  matter: ClientMatter
  detailTab: DetailTab
  isEditing: boolean
  editForm: MatterEditForm | null
  glanceItems: GlanceItem[]
  setDetailTab: (tab: DetailTab) => void
  setEditForm: Dispatch<SetStateAction<MatterEditForm | null>>
  onClosePanel: () => void
  onBeginEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => Promise<void>
  onUpdate: (id: string, patch: Partial<ClientMatter>) => Promise<void>
  onArchive: (matter: ClientMatter, status: ClientMatter['status']) => Promise<void>
  onCloseMatter: (matter: ClientMatter) => Promise<void>
}

export default function MatterDetails(props: Props) {
  const {
    matter, detailTab, isEditing, editForm, glanceItems, setDetailTab, setEditForm,
    onClosePanel, onBeginEdit, onCancelEdit, onSaveEdit, onUpdate, onArchive, onCloseMatter,
  } = props
  const updateForm = (patch: Partial<MatterEditForm>) => {
    setEditForm((current) => current ? { ...current, ...patch } : current)
  }

  return (
    <aside className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderMeta}>
          <span className={`${styles.riskBadge} ${styles[`risk_${matter.urgency}`]}`}>
            <ShieldAlert size={13} />{matter.urgency} priority
          </span>
          {matter.status === 'archived' && (
            <span className={styles.stateBadge}>{matter.stage === 'closed' ? 'Closed and archived' : 'Archived'}</span>
          )}
        </div>
        <div className={styles.detailHeaderActions}>
          {matter.status === 'active' ? (
            <button type="button" className={styles.closeMatterBtn} onClick={() => void onCloseMatter(matter)}>
              <CheckCircle2 size={15} />Close case
            </button>
          ) : (
            <button type="button" className={styles.editMatterBtn} onClick={() => void onArchive(matter, 'active')}>
              <ArchiveRestore size={15} />Reopen case
            </button>
          )}
          <button type="button" className={styles.editMatterBtn} onClick={isEditing ? onCancelEdit : onBeginEdit}>
            {isEditing ? <X size={15} /> : <Edit3 size={15} />}{isEditing ? 'Cancel edit' : 'Edit details'}
          </button>
        </div>
        <button type="button" className={styles.closeDetail} onClick={onClosePanel} aria-label="Close work panel"><X size={16} /></button>
        <h2>{matter.clientName}</h2>
        <p>{matter.issueType}</p>
        {matter.status === 'archived' && (
          <span className={styles.detailSubtext}>Closed work stays in the portal history and can be reopened later if the client returns.</span>
        )}
      </div>

      <div className={styles.detailTabs} role="tablist" aria-label="Client work workspace">
        {(['overview', 'documents'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={detailTab === tab}
            className={`${styles.detailTab} ${detailTab === tab ? styles.detailTabActive : ''}`}
            onClick={() => setDetailTab(tab)}
          >
            {tab === 'overview' ? 'Overview' : 'Documents'}
          </button>
        ))}
      </div>

      <div className={styles.detailBody}>
        {isEditing && editForm ? (
          <section className={styles.editPanel}>
            <div className={styles.editGrid}>
              <EditInput label="Client name" value={editForm.clientName} onChange={(value) => updateForm({ clientName: value })} />
              <EditInput label="Email" type="email" value={editForm.email} onChange={(value) => updateForm({ email: value })} />
              <EditInput label="Phone" value={editForm.phone} onChange={(value) => updateForm({ phone: value })} />
              <EditInput label="Location" value={editForm.location} onChange={(value) => updateForm({ location: value })} />
              <EditInput label="Issue type" value={editForm.issueType} onChange={(value) => updateForm({ issueType: value })} />
              <EditInput label="Matter number" value={editForm.matterNumber} onChange={(value) => updateForm({ matterNumber: value })} />
              <EditInput label="Court date" type="date" value={editForm.courtDate} onChange={(value) => updateForm({ courtDate: value })} />
              <EditInput label="Next deadline" type="date" value={editForm.nextDeadline} onChange={(value) => updateForm({ nextDeadline: value })} />
            </div>
            <EditInput label="Opposing party" value={editForm.opposing} onChange={(value) => updateForm({ opposing: value })} />
            <EditInput label="Next action" value={editForm.nextAction} onChange={(value) => updateForm({ nextAction: value })} />
            <EditTextarea label="Summary" rows={4} value={editForm.summary} onChange={(value) => updateForm({ summary: value })} />
            <EditTextarea label="Full details" rows={6} value={editForm.fullDetails} onChange={(value) => updateForm({ fullDetails: value })} />
            <div className={styles.editActions}>
              <button type="button" className={styles.secondaryBtn} onClick={onCancelEdit}>Cancel</button>
              <button type="button" className={styles.primaryBtn} onClick={() => void onSaveEdit()}><Save size={15} />Save changes</button>
            </div>
          </section>
        ) : (
          <>
            <div className={styles.quickFacts}>
              <span><Mail size={14} /> {matter.email || 'No email'}</span>
              <span><Phone size={14} /> {matter.phone || 'No phone'}</span>
              <span><CalendarClock size={14} /> {formatDate(matter.nextDeadline)}</span>
            </div>
            <label className={styles.controlGroup}>
              <span>Stage</span>
              <select value={matter.stage} onChange={(event) => void onUpdate(matter.id, { stage: event.target.value as MatterStage })}>
                {STAGE_OPTIONS.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
              </select>
            </label>
            <label className={styles.controlGroup}>
              <span>Responsible person</span>
              <select value={matter.owner} onChange={(event) => void onUpdate(matter.id, { owner: event.target.value })}>
                {OWNER_OPTIONS.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
              </select>
            </label>
          </>
        )}

        {detailTab === 'overview' ? (
          <MatterOverview matter={matter} glanceItems={glanceItems} onOpenDocuments={() => setDetailTab('documents')} />
        ) : (
          <MatterDocumentsPanel matter={matter} />
        )}

        {matter.status === 'active' && (
          <button
            type="button"
            className={styles.contactBtn}
            disabled={!matter.email}
            onClick={() => openMessageComposer(matter)}
            title={matter.email ? 'Message client' : 'No email address on file'}
          >
            <UserPlus size={15} />Message client
          </button>
        )}
      </div>
    </aside>
  )
}

function EditInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className={styles.controlGroup}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function EditTextarea({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return <label className={styles.controlGroup}><span>{label}</span><textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function MatterOverview({ matter, glanceItems, onOpenDocuments }: { matter: ClientMatter; glanceItems: GlanceItem[]; onOpenDocuments: () => void }) {
  return (
    <>
      <section className={styles.detailSection}><h3>Next action</h3><p>{matter.nextAction}</p></section>
      <section className={styles.detailSection}><h3>Issue summary</h3><p>{matter.summary}</p></section>
      <section className={styles.detailSection}>
        <h3>Documents</h3>
        <div className={styles.documentsSummaryRow}>
          <div className={styles.tagRow}>
            {matter.documents.length > 0 ? matter.documents.slice(0, 4).map((name) => <span key={name}>{name}</span>) : <span>No documents yet</span>}
            {matter.documents.length > 4 && <span>+{matter.documents.length - 4} more</span>}
          </div>
          <button type="button" className={styles.linkBtn} onClick={onOpenDocuments}>Open documents</button>
        </div>
      </section>
      <section className={styles.detailSection}><h3>Tags</h3><div className={styles.tagRow}>{matter.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section>
      <section className={styles.detailSection}>
        <h3>At a glance</h3>
        <div className={styles.simpleList}>{glanceItems.map((item) => <div key={item.label} className={styles.simpleListItem}><strong>{item.label}</strong><span>{item.value}</span></div>)}</div>
      </section>
    </>
  )
}

function openMessageComposer(matter: ClientMatter) {
  if (!matter.email) return
  window.dispatchEvent(new CustomEvent('mymckenzie-inbox-compose', {
    detail: {
      to: matter.email,
      subject: `Regarding your client work ${matter.matterNumber}`,
      caseId: matter.caseId || '',
      matterLabel: matter.matterNumber || matter.clientName,
    },
  }))
}
