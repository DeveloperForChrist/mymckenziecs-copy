'use client';

import { useEffect, useState } from 'react';
import styles from './settingsPage.module.css';

const REMINDER_OPTIONS = [
  { label: '15 minutes before', value: 15 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '3 hours before', value: 180 },
  { label: '24 hours before', value: 1440 },
];

function formatLeadTime(minutes: number) {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440
    return `${days} day${days === 1 ? '' : 's'} before`
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'} before`
  }
  return `${minutes} minutes before`
}

export default function MeetingReminderSection() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [allowed, setAllowed] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [leadMinutes, setLeadMinutes] = useState(1440)

  useEffect(() => {
    let mounted = true

    const loadPreferences = async () => {
      setLoading(true)
      setNotice(null)
      try {
        const response = await fetch('/api/user/preferences', { credentials: 'include' })
        const payload = await response.json().catch(() => ({}))

        if (!mounted) return

        if (!response.ok) {
          if (response.status === 403) {
            setAllowed(false)
            setNotice('Meeting reminders are available on plans with reminder access.')
            return
          }
          setNotice(payload?.error || 'Unable to load reminder settings.')
          return
        }

        setAllowed(true)
        const parsed = Number(payload?.meeting_reminder_minutes)
        const nextMinutes = REMINDER_OPTIONS.some((option) => option.value === parsed) ? parsed : 1440
        setLeadMinutes(nextMinutes)
      } catch (error) {
        if (!mounted) return
        setNotice(error instanceof Error ? error.message : 'Unable to load reminder settings.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadPreferences()
    return () => {
      mounted = false
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ meeting_reminder_minutes: leadMinutes }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice(payload?.error || 'Unable to save reminder settings.')
        return
      }
      setNotice(`Reminder emails will go out ${formatLeadTime(leadMinutes)} before each meeting.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to save reminder settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={styles.settingsSection}>
      <h2 className={styles.sectionHeading}>Meeting reminder timing</h2>
      <p className={styles.desc}>
        Choose how far in advance reminder emails should be sent to you and your client.
        Both sides receive the same reminder window, and the client still gets a secure join link.
      </p>

      {!allowed ? (
        <div className={styles.readOnlyNotice}>
          Meeting reminders are available on plans with reminder access.
        </div>
      ) : null}

      <div className={styles.formGrid}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel} htmlFor="meeting-reminder-minutes">
            Reminder window
          </label>
          <select
            id="meeting-reminder-minutes"
            className={styles.selectInput}
            value={leadMinutes}
            onChange={(event) => setLeadMinutes(Number(event.target.value))}
            disabled={loading || saving || !allowed}
          >
            {REMINDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className={styles.helpText}>
            This controls when the system sends the reminder email before the meeting starts.
          </p>
        </div>
      </div>

      <div className={styles.actionsRow}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => void handleSave()}
          disabled={loading || saving || !allowed}
        >
          {saving ? 'Saving…' : 'Save reminder timing'}
        </button>
      </div>

      {notice ? <p className={styles.helpText}>{notice}</p> : null}
    </section>
  )
}
