"use client"

import React, { useState } from 'react'
import styles from './settingsPage.module.css'

export default function CaseProfileSection() {
  const [caseName, setCaseName] = useState('')
  const [caseType, setCaseType] = useState('')
  const [caseNumber, setCaseNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      // Placeholder: call API to save case profile
      const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null
      const res = await fetch('/api/user/case-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: caseNumber || null, caseType, caseTitle: caseName, caseDescription: notes, userId }),
      })
      const data = await res.json()
      if (res.ok && data.case?.id) {
        // Do not persist case id to localStorage; feature disabled
        alert('Case profile saved')
      } else {
        console.error('save failed', data)
        alert('Failed to save case profile')
      }
    } catch (err) {
      console.error(err)
      alert('Failed to save case profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={styles.settingsSection}>
      <h2 className={styles.sectionHeading}>Case Profile</h2>
      <p className={styles.desc}>Store basic information about a representative case to prefill forms and link tools.</p>

      <div className={styles.caseProfileLayout}>
        <div className={styles.caseProfileCard}>
          <div className={styles.formGrid}>
            <div className={styles.caseProfileRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Case Name</label>
                <input className={styles.textInput} value={caseName} onChange={(e) => setCaseName(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Case Type</label>
                <input className={styles.textInput} value={caseType} onChange={(e) => setCaseType(e.target.value)} />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Case Number / ID</label>
              <input className={styles.textInput} value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} />
            </div>

            <div className={styles.formGroupFull}>
              <label className={styles.formLabel}>Overview of Case</label>
              <textarea className={styles.textArea} rows={7} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <p className={styles.caseProfileHint}>Summarise the dispute, key dates, and what you want to achieve.</p>
            </div>

            <div className={styles.caseProfileActions}>
              <button className={styles.primaryBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Case Profile'}
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
    </section>
  )
}
