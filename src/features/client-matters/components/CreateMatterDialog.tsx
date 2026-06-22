'use client'

import type { Dispatch, SetStateAction } from 'react'
import { X } from 'lucide-react'
import type { CreateMatterForm } from '../model'
import styles from '@/components/business/clientMatters.module.css'

type Props = {
  form: CreateMatterForm
  setForm: Dispatch<SetStateAction<CreateMatterForm>>
  onClose: () => void
  onCreate: (form: CreateMatterForm) => Promise<void>
  onReset: () => void
}

export default function CreateMatterDialog({ form, setForm, onClose, onCreate, onReset }: Props) {
  const update = (patch: Partial<CreateMatterForm>) => setForm((current) => ({ ...current, ...patch }))

  return (
    <div
      className={styles.createOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Create work item"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={styles.createModal}>
        <div className={styles.createHeader}>
          <h2>Create work item</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <form
          className={styles.createForm}
          onSubmit={(event) => {
            event.preventDefault()
            void onCreate(form).then(() => {
              onClose()
              onReset()
            })
          }}
        >
          <div className={styles.createGrid}>
            <label>
              <span>Client name</span>
              <input value={form.clientName} onChange={(event) => update({ clientName: event.target.value })} placeholder="Client name" required />
            </label>
            <label>
              <span>Email</span>
              <input type="email" value={form.email} onChange={(event) => update({ email: event.target.value })} placeholder="client@email.com" />
            </label>
            <label>
              <span>Phone</span>
              <input value={form.phone} onChange={(event) => update({ phone: event.target.value })} placeholder="07..." />
            </label>
            <label>
              <span>Location</span>
              <input value={form.location} onChange={(event) => update({ location: event.target.value })} placeholder="City / Postcode" />
            </label>
          </div>
          <label>
            <span>Issue type</span>
            <input value={form.issueType} onChange={(event) => update({ issueType: event.target.value })} placeholder="e.g. Housing disrepair" />
          </label>
          <label>
            <span>Summary</span>
            <textarea value={form.summary} onChange={(event) => update({ summary: event.target.value })} rows={4} placeholder="Short summary of the issue and immediate next steps..." />
          </label>
          <div className={styles.createActions}>
            <button type="button" className={styles.secondaryBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.primaryBtn}>Create work item</button>
          </div>
        </form>
      </div>
    </div>
  )
}
