"use client"

import React, { useEffect, useState } from 'react'
import styles from './settingsPage.module.css'
import { hasCaseProfileAccess } from '@/lib/plans/access'

type CaseProfileSectionProps = {
  enforceReadOnlyOnPlanPause?: boolean
}

const READ_ONLY_MESSAGE = 'Read-only mode: resume plan to edit case profile.'

export default function CaseProfileSection({ enforceReadOnlyOnPlanPause = false }: CaseProfileSectionProps) {
  const [caseId, setCaseId] = useState<string | null>(null)
  const [caseTitle, setCaseTitle] = useState('')
  const [caseNumber, setCaseNumber] = useState('')
  const [hearingDate, setHearingDate] = useState('')
  const [caseSummary, setCaseSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmed, setDeleteConfirmed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [readOnlyMode, setReadOnlyMode] = useState(false)
  const [readOnlyMessage, setReadOnlyMessage] = useState<string | null>(null)
  const [statusModal, setStatusModal] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadCaseProfile = async () => {
      try {
        if (enforceReadOnlyOnPlanPause) {
          const planResponse = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' })
          const planData = await planResponse.json().catch(() => ({} as Record<string, unknown>))
          if (!cancelled) {
            const hasCaseProfileFeature = hasCaseProfileAccess(planData?.plan || '')
            const isReadOnly = hasCaseProfileFeature && planData?.paidAccess === false
            setReadOnlyMode(isReadOnly)
            setReadOnlyMessage(isReadOnly ? READ_ONLY_MESSAGE : null)
          }
        }

        const response = await fetch('/api/user/case-details', { credentials: 'include' })
        const data = await response.json()
        if (cancelled) return
        if (!response.ok) {
          if (response.status === 402) {
            const message = typeof data?.error === 'string' ? data.error : READ_ONLY_MESSAGE
            setReadOnlyMode(true)
            setReadOnlyMessage(message)
          }
          return
        }
        const item = data?.case
        if (!item) return

        setCaseId(item.id || null)
        setCaseTitle(item.title === 'Untitled case' ? '' : (item.title || ''))
        setCaseNumber(item.external_id || '')
        setHearingDate(item.case_type || '')
        setCaseSummary(item.description || '')
      } catch {
        // no-op
      } finally {
        if (!cancelled) setLoadingProfile(false)
      }
    }

    loadCaseProfile()
    return () => {
      cancelled = true
    }
  }, [enforceReadOnlyOnPlanPause])

  const handleSave = async () => {
    if (readOnlyMode) {
      setStatusModal({ title: 'Read-only mode', message: readOnlyMessage || READ_ONLY_MESSAGE })
      return
    }
    setSaving(true)
    try {
      const hasAnyInput = Boolean(caseNumber.trim() || hearingDate.trim() || caseTitle.trim() || caseSummary.trim())
      if (!hasAnyInput) {
        setStatusModal({ title: 'Save failed', message: 'Fill at least one case profile field before saving.' })
        return
      }

      const res = await fetch('/api/user/case-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          caseId: caseNumber || null,
          caseType: hearingDate || null,
          caseTitle: caseTitle || null,
          caseDescription: caseSummary || null,
        }),
      })
      const raw = await res.text()
      let data: any = {}
      try {
        data = raw ? JSON.parse(raw) : {}
      } catch {
        data = {}
      }

      if (res.ok && data.case?.id) {
        setCaseId(data.case.id)
        setStatusModal({ title: 'Case profile saved', message: 'Your case profile details were saved successfully.' })
      } else if (res.status === 402) {
        const message = (typeof data?.error === 'string' && data.error.trim()) || READ_ONLY_MESSAGE
        setReadOnlyMode(true)
        setReadOnlyMessage(message)
        setStatusModal({ title: 'Read-only mode', message })
      } else {
        const errorMessage =
          (typeof data?.error === 'string' && data.error.trim()) ||
          (typeof data?.message === 'string' && data.message.trim()) ||
          (res.status === 401 ? 'Please sign in again and retry.' : '') ||
          'Failed to save case profile.'
        setStatusModal({ title: 'Save failed', message: errorMessage })
      }
    } catch (err) {
      console.error(err)
      setStatusModal({ title: 'Save failed', message: 'Failed to save case profile.' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProfile = async () => {
    if (!deleteConfirmed || deleting) return
    if (readOnlyMode) {
      setStatusModal({ title: 'Read-only mode', message: readOnlyMessage || READ_ONLY_MESSAGE })
      return
    }

    setDeleting(true)
    try {
      const res = await fetch('/api/user/case-details', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId }),
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok && data?.ok) {
        setCaseTitle('')
        setCaseNumber('')
        setHearingDate('')
        setCaseSummary('')
        setShowDeleteModal(false)
        setDeleteConfirmed(false)
        setStatusModal({ title: 'Case profile cleared', message: 'Your case profile has been removed. Your chatbot conversation history was preserved.' })
      } else if (res.status === 402) {
        const message = (typeof data?.error === 'string' && data.error.trim()) || READ_ONLY_MESSAGE
        setReadOnlyMode(true)
        setReadOnlyMessage(message)
        setStatusModal({ title: 'Read-only mode', message })
      } else {
        setStatusModal({ title: 'Delete failed', message: data?.error || 'Failed to clear case profile' })
      }
    } catch {
      setStatusModal({ title: 'Delete failed', message: 'Failed to clear case profile' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className={styles.settingsSection}>
      <h2 className={styles.sectionHeading}>Case Profile</h2>
      <p className={styles.desc}>Fill case profile to make MyMcKenzieCS Assistant more personalised for you.</p>
      {readOnlyMode && <div className={styles.readOnlyNotice}>{readOnlyMessage || READ_ONLY_MESSAGE}</div>}

      <div className={styles.caseProfileLayout}>
        <div className={styles.caseProfileCard}>
          <div className={styles.formGrid}>
            <div className={styles.caseProfileRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>By Case Number</label>
                <input
                  className={styles.textInput}
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  disabled={readOnlyMode}
                />
                <p className={styles.caseProfileHint}>The case number for the case needs to be entered in the following format.</p>
              </div>
            </div>

            <div className={styles.caseProfileRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>By Title</label>
                <input
                  className={styles.textInput}
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  disabled={readOnlyMode}
                />
                <p className={styles.caseProfileHint}>For example, in the case of Smith & Co v Jones, either &quot;Smith&quot; or &quot;Jones&quot; as placeholder.</p>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>By Date</label>
                <input
                  className={styles.textInput}
                  placeholder="15-Jan-09"
                  value={hearingDate}
                  onChange={(e) => setHearingDate(e.target.value)}
                  disabled={readOnlyMode}
                />
                <p className={styles.caseProfileHint}>A date of hearing can be entered in the following format DD-MMM-YY, e.g. 15-Jan-09.</p>
              </div>
            </div>

            <div className={styles.formGroupFull}>
              <label className={styles.formLabel}>Case Description/Summary</label>
              <textarea
                className={styles.textArea}
                rows={7}
                value={caseSummary}
                onChange={(e) => setCaseSummary(e.target.value)}
                disabled={readOnlyMode}
              />
              <p className={styles.caseProfileHint}>Summarise the dispute, key dates, and what outcome you want.</p>
            </div>

            <div className={styles.caseProfileActions}>
              <button className={styles.primaryBtn} onClick={handleSave} disabled={saving || readOnlyMode}>
                {saving ? 'Saving…' : 'Save Case Profile'}
              </button>
              <button
                className={styles.dangerOutlineBtn}
                onClick={() => setShowDeleteModal(true)}
                disabled={loadingProfile || deleting || readOnlyMode}
              >
                Delete Case Profile
              </button>
            </div>
          </div>
        </div>

        <aside className={styles.caseProfileSidebar}>
          <div className={styles.caseProfileSidebarCard}>
            <p className={styles.caseProfileSidebarTitle}>Used across your workspace</p>
            <div className={styles.caseProfilePillRow}>
              <span className={styles.caseProfilePill}>Chatbot context</span>
              <span className={styles.caseProfilePill}>Case summaries</span>
              <span className={styles.caseProfilePill}>Draft templates</span>
              <span className={styles.caseProfilePill}>Deadlines</span>
            </div>
          </div>
          <div className={styles.caseProfileSidebarCard}>
            <p className={styles.caseProfileSidebarTitle}>What to include</p>
            <ul className={styles.caseProfileList}>
              <li>Who is involved and their roles.</li>
              <li>The issue in one or two sentences.</li>
              <li>Key dates, payments, or court steps.</li>
              <li>Your desired outcome.</li>
            </ul>
          </div>
        </aside>
      </div>

      {showDeleteModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>Delete case profile?</h3>
            <p className={styles.modalBody}>
              This will clear your case title, case number, hearing date, and case summary used to personalise MyMcKenzieCS Assistant.
              Your chatbot responses may become less tailored until you fill in a new case profile, but your chatbot conversations will be kept.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(e) => setDeleteConfirmed(e.target.checked)}
              />
              I understand and want to clear my case profile.
            </label>
            <div className={styles.modalActions}>
              <button
                className={styles.secondaryBtn}
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteConfirmed(false)
                }}
              >
                Cancel
              </button>
              <button
                className={styles.dangerBtn}
                onClick={handleDeleteProfile}
                disabled={!deleteConfirmed || deleting}
              >
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {statusModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>{statusModal.title}</h3>
            <p className={styles.modalBody}>{statusModal.message}</p>
            <div className={styles.modalActions}>
              <button className={styles.primaryBtn} onClick={() => setStatusModal(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
