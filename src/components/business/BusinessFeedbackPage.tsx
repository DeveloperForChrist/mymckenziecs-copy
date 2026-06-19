'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, Lightbulb, Loader2, Send, Sparkles, Target, XCircle } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import styles from './businessFeedback.module.css'

type FeedbackArea = 'dashboard' | 'client-work' | 'documents' | 'inbox' | 'portal' | 'billing' | 'other'

const AREA_OPTIONS: Array<{ value: FeedbackArea; label: string; description: string }> = [
  { value: 'dashboard', label: 'Dashboard', description: 'Home screen, navigation, summaries, and widgets.' },
  { value: 'client-work', label: 'Client work', description: 'Matter records, editing, stages, and workflow.' },
  { value: 'documents', label: 'Documents', description: 'Uploads, sharing, previews, and folders.' },
  { value: 'inbox', label: 'Inbox', description: 'Messages, attachments, and portal invitations.' },
  { value: 'portal', label: 'Client portal', description: 'Client-facing access, shared documents, and messages.' },
  { value: 'billing', label: 'Billing', description: 'Plans, invoices, and access levels.' },
  { value: 'other', label: 'Other', description: 'Anything else that would improve the platform.' },
]

export default function BusinessFeedbackPage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [area, setArea] = useState<FeedbackArea>('client-work')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [impact, setImpact] = useState('')
  const [contactOk, setContactOk] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setEmail(user.email || '')
        setName(String(user.user_metadata?.full_name || user.user_metadata?.display_name || '').trim())
      } catch {
        // Best effort only.
      }
    }

    void loadProfile()
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus(null)

    const trimmedTitle = title.trim()
    const trimmedDetails = details.trim()
    if (!trimmedTitle || !trimmedDetails) {
      setStatus({ type: 'error', message: 'Please add both a short title and the detail of your suggestion.' })
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/business/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          area,
          title: trimmedTitle,
          details: trimmedDetails,
          impact: impact.trim(),
          contactOk,
          contactEmail: email,
          contactName: name,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Unable to submit suggestion.')
      }

      setStatus({ type: 'success', message: 'Suggestion sent. Thank you for helping improve the platform.' })
      setTitle('')
      setDetails('')
      setImpact('')
      setContactOk(true)
      setArea('client-work')
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to submit suggestion.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}><Lightbulb size={14} /> Professional feedback</span>
          <h1>Suggest platform improvements</h1>
          <p>
            Share ideas that would make the workspace better for client work, documents, inbox handling, or the client portal.
          </p>
        </div>
        <div className={styles.heroPanel}>
          <div className={styles.heroStat}>
            <Sparkles size={18} />
            <div>
              <strong>Product ideas</strong>
              <span>Captured in one place for review</span>
            </div>
          </div>
          <div className={styles.heroStat}>
            <Target size={18} />
            <div>
              <strong>Workflow issues</strong>
              <span>Tell us where things slow down</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="feedback-area">Area</label>
            <select id="feedback-area" value={area} onChange={(event) => setArea(event.target.value as FeedbackArea)}>
              {AREA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className={styles.fieldHint}>
              {AREA_OPTIONS.find((option) => option.value === area)?.description}
            </p>
          </div>

          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label htmlFor="feedback-name">Your name</label>
              <input
                id="feedback-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="feedback-email">Email</label>
              <input
                id="feedback-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@firm.com"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="feedback-title">Short title</label>
            <input
              id="feedback-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Example: Better document tagging on the matter screen"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="feedback-details">What would help?</label>
            <textarea
              id="feedback-details"
              rows={7}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Describe the problem or improvement in plain language."
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="feedback-impact">Why it matters</label>
            <textarea
              id="feedback-impact"
              rows={4}
              value={impact}
              onChange={(event) => setImpact(event.target.value)}
              placeholder="How would this help your workflow or your clients?"
            />
          </div>

          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={contactOk} onChange={(event) => setContactOk(event.target.checked)} />
            <span>It is okay to contact me if you want more detail.</span>
          </label>

          {status && (
            <div className={status.type === 'success' ? styles.successNotice : styles.errorNotice}>
              {status.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              <span>{status.message}</span>
            </div>
          )}

          <div className={styles.actions}>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? <Loader2 size={15} className={styles.spin} /> : <Send size={15} />}
              {submitting ? 'Sending…' : 'Send suggestion'}
            </button>
          </div>
        </form>

        <aside className={styles.sideCard}>
          <h2>What to send here</h2>
          <ul>
            <li>Things that feel clunky in client work or document handling</li>
            <li>Missing workflow steps, buttons, or shortcuts</li>
            <li>Ideas that would save time for professionals and clients</li>
            <li>Small fixes that would make the dashboard feel more complete</li>
          </ul>
          <p>
            For account or billing issues, use the normal support contact page instead.
          </p>
        </aside>
      </div>
    </div>
  )
}
