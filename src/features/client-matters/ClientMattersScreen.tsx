'use client'

import { Archive, ArchiveRestore, Plus, Search } from 'lucide-react'
import WorkspaceLoadingState from '@/components/business/WorkspaceLoadingState'
import CreateMatterDialog from './components/CreateMatterDialog'
import MatterDetails from './components/MatterDetails'
import MatterList from './components/MatterList'
import { STAGE_LABELS, STAGE_OPTIONS, type StageFilter } from './model'
import { useClientMatters } from './useClientMatters'
import styles from '@/components/business/clientMatters.module.css'

export default function ClientMattersScreen() {
  const controller = useClientMatters()
  const {
    visibleMatters, selectedMatter, checkedMatterIds, query, stageFilter, showArchived,
    loading, syncNotice, createOpen, detailTab, isEditingMatter, editForm, createForm,
    stats, glanceItems, setSelectedMatterId, setQuery, setStageFilter, setShowArchived,
    setCreateOpen, setDetailTab, setEditForm, setCreateForm, updateMatter, createMatter,
    archiveMatter, closeMatter, archiveCheckedMatters, saveMatterEdit, beginMatterEdit,
    cancelMatterEdit, toggleCheckedMatter, resetCreateForm,
  } = controller

  return (
    <div className={styles.page}>
      {createOpen && (
        <CreateMatterDialog
          form={createForm}
          setForm={setCreateForm}
          onClose={() => setCreateOpen(false)}
          onCreate={createMatter}
          onReset={resetCreateForm}
        />
      )}

      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.kicker}>Case books</span>
          <h1>Client Work</h1>
          <p>A simple solo workspace for client issues, deadlines, documents and next actions.</p>
          {loading ? (
            <WorkspaceLoadingState variant="inline" label="Loading saved client work..." className={styles.syncNotice} />
          ) : syncNotice ? (
            <p className={styles.syncNotice}>{syncNotice}</p>
          ) : null}
        </div>
        <div className={styles.stats}>
          <Stat value={stats.clients} label="Clients" />
          <Stat value={stats.matters} label="Work items" />
          <Stat value={stats.urgent} label="Urgent" />
        </div>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.searchBox}>
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients, work items, issue types..." />
        </label>
        <select
          className={styles.select}
          value={stageFilter}
          onChange={(event) => setStageFilter(event.target.value as StageFilter)}
          aria-label="Filter by work stage"
        >
          <option value="all">All stages</option>
          {STAGE_OPTIONS.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
        </select>
        <button type="button" className={styles.secondaryBtn} onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          {showArchived ? 'Active client work' : 'Archived clients'}
        </button>
        <button type="button" className={styles.secondaryBtn} disabled={checkedMatterIds.length === 0} onClick={() => void archiveCheckedMatters()}>
          {showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          {showArchived ? 'Restore selected' : 'Archive selected'}
        </button>
        <button type="button" className={styles.primaryBtn} onClick={() => setCreateOpen(true)}><Plus size={15} />Create work item</button>
      </div>

      <div className={`${styles.body} ${selectedMatter ? styles.bodyDetailOpen : styles.bodyListOnly}`}>
        <MatterList
          matters={visibleMatters}
          selectedMatterId={selectedMatter?.id || null}
          checkedMatterIds={checkedMatterIds}
          onSelect={setSelectedMatterId}
          onToggleChecked={toggleCheckedMatter}
          onArchive={archiveMatter}
        />
        {selectedMatter && (
          <MatterDetails
            matter={selectedMatter}
            detailTab={detailTab}
            isEditing={isEditingMatter}
            editForm={editForm}
            glanceItems={glanceItems}
            setDetailTab={setDetailTab}
            setEditForm={setEditForm}
            onClosePanel={() => setSelectedMatterId(null)}
            onBeginEdit={beginMatterEdit}
            onCancelEdit={cancelMatterEdit}
            onSaveEdit={saveMatterEdit}
            onUpdate={updateMatter}
            onArchive={archiveMatter}
            onCloseMatter={closeMatter}
          />
        )}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div className={styles.stat}><span>{value}</span><p>{label}</p></div>
}
