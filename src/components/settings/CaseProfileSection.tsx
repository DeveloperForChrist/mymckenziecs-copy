"use client"

import React, { useState } from 'react'
import styles from './settingsPage.module.css'

export default function CaseProfileSection() {
  const [caseTitle, setCaseTitle] = useState('')
  const [caseNumber, setCaseNumber] = useState('')
  const [hearingDate, setHearingDate] = useState('')
  const [caseSummary, setCaseSummary] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      // Placeholder: call API to save case profile
      const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null
      const res = await fetch('/api/user/case-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseNumber || null,
          caseType: hearingDate || null,
          caseTitle: caseTitle || null,
          caseDescription: caseSummary || null,
          userId,
        }),
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
      <p className={styles.desc}>Fill case profile to make MyMcKenzie Assistant more personalised for you.</p>

      <div className={styles.caseProfileLayout}>
        <div className={styles.caseProfileCard}>
          <div className={styles.formGrid}>
            <div className={styles.caseProfileRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>By Case Number</label>
                <input className={styles.textInput} value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} />
                <p className={styles.caseProfileHint}>The case number for the case needs to be entered in the following format.</p>
              </div>
            </div>

            <div className={styles.caseProfileRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>By Title</label>
                <input className={styles.textInput} value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} />
                <p className={styles.caseProfileHint}>For example, in the case of Smith & Co v Jones, either "Smith" or "Jones" as placeholder.</p>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>By Date</label>
                <input
                  className={styles.textInput}
                  placeholder="15-Jan-09"
                  value={hearingDate}
                  onChange={(e) => setHearingDate(e.target.value)}
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
              />
              <p className={styles.caseProfileHint}>Summarise the dispute, key dates, and what outcome you want.</p>
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
