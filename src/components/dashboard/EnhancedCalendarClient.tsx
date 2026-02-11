'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import styles from './calendar-new.module.css'

type CalendarEvent = {
  id: string
  title: string
  notes?: string
  time?: string
  docId?: string
  type?: string
  source?: string
  dateValue?: Date | string
  daysUntil?: number | null
  isDemo?: boolean
  priority?: 'low' | 'medium' | 'high'
  category?: 'deadline' | 'hearing' | 'meeting' | 'reminder' | 'other'
  completed?: boolean
}

type EventsByDate = Record<string, CalendarEvent[]>

type DayCell = {
  date: Date
  inCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function addMonths(date: Date, months: number) {
  const d = new Date(date)
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  return d
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function parseEventDate(value?: string | Date | null) {
  if (!value) return new Date()
  if (value instanceof Date) return value
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (!value.includes('T') || /T00:00:00(\.000)?Z$/.test(value)) {
      return new Date(year, month - 1, day)
    }
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export default function EnhancedCalendarClient() {
  const [visibleMonth, setVisibleMonth] = useState(startOfDay(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(startOfDay(new Date()))
  const [eventsByDate, setEventsByDate] = useState<EventsByDate>({})
  const [newTitle, setNewTitle] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newCategory, setNewCategory] = useState<CalendarEvent['category']>('deadline')
  const [newPriority, setNewPriority] = useState<CalendarEvent['priority']>('medium')
  const [uid, setUid] = useState<string | null>(null)
  const [isPaidPlan, setIsPaidPlan] = useState(false)
  const [remindersEnabled, setRemindersEnabled] = useState(true)
  const [prefsLoading, setPrefsLoading] = useState(false)
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsError, setPrefsError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => {
      setUid(data?.user?.id || null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user?.id || null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (uid) return
    try {
      const raw = localStorage.getItem('calendarEvents:v2')
      if (raw) {
        setEventsByDate(JSON.parse(raw))
      }
    } catch (_) {}
  }, [uid])

  useEffect(() => {
    if (uid) return
    try {
      localStorage.setItem('calendarEvents:v2', JSON.stringify(eventsByDate))
    } catch (_) {}
  }, [eventsByDate, uid])

  useEffect(() => {
    if (!uid) return
    const controller = new AbortController()
    const fetchEvents = async () => {
      try {
        const response = await fetch('/api/calendar', { credentials: 'include', signal: controller.signal })
        if (response.ok) {
          const data = await response.json()
          const map: EventsByDate = {}
          ;(data.events || []).forEach((ev: any) => {
            const jsDate = parseEventDate(ev.date)
            const key = dateKey(jsDate)
            const daysUntil = Math.round((startOfDay(jsDate).getTime() - startOfDay(new Date()).getTime()) / (1000 * 60 * 60 * 24))
            const event: CalendarEvent = {
              id: ev.id,
              docId: ev.id,
              title: ev.title ?? 'Untitled',
              notes: ev.notes,
              time: ev.time,
              type: ev.type,
              source: ev.source,
              dateValue: jsDate,
              daysUntil,
              priority: ev.priority || 'medium',
              category: ev.category || 'deadline',
              completed: Boolean(ev.completed),
            }
            if (!map[key]) map[key] = []
            map[key].push(event)
          })
          setEventsByDate(map)
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') return
        console.error('Failed to fetch calendar events:', error)
      }
    }
    fetchEvents()
    return () => controller.abort()
  }, [uid])

  useEffect(() => {
    if (!uid) {
      setIsPaidPlan(false)
      return
    }
    const loadPlanAndPrefs = async () => {
      setPrefsLoading(true)
      setPrefsError(null)
      try {
        const planRes = await fetch('/api/user/plan', { credentials: 'include' })
        if (!planRes.ok) throw new Error('Failed to load plan')
        const planData = await planRes.json()
        const planLabel = String(planData?.plan || '').toLowerCase()
        const paid =
          planLabel.includes('standard') ||
          planLabel.includes('essential') ||
          planLabel.includes('plus') ||
          planLabel.includes('premium') ||
          planLabel.includes('pro')
        setIsPaidPlan(paid)

        if (paid) {
          const prefRes = await fetch('/api/user/preferences', { credentials: 'include' })
          if (!prefRes.ok) throw new Error('Failed to load preferences')
          const prefData = await prefRes.json()
          setRemindersEnabled(prefData.deadline_reminders !== false)
        }
      } catch (error) {
        console.error('Failed to load plan/preferences', error)
        setPrefsError('Unable to load reminder preferences')
      } finally {
        setPrefsLoading(false)
      }
    }
    loadPlanAndPrefs()
  }, [uid])

  const toggleReminderEmails = async () => {
    if (!uid || !isPaidPlan) return
    const nextValue = !remindersEnabled
    setRemindersEnabled(nextValue)
    setPrefsSaving(true)
    setPrefsError(null)
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deadline_reminders: nextValue }),
      })
      if (!res.ok) {
        throw new Error('Failed to update preferences')
      }
    } catch (error) {
      console.error('Failed to update reminder preference', error)
      setRemindersEnabled(!nextValue)
      setPrefsError('Unable to save. Please try again.')
    } finally {
      setPrefsSaving(false)
    }
  }

  const addEvent = async () => {
    if (!selectedDate) return
    const title = newTitle.trim()
    if (!title) return
    const key = dateKey(selectedDate)
    const normalizedSelected = startOfDay(selectedDate)
    const dayDiff = Math.round((normalizedSelected.getTime() - startOfDay(new Date()).getTime()) / (1000 * 60 * 60 * 24))

    if (uid) {
      try {
        const response = await fetch('/api/calendar', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            notes: newNotes || null,
            time: newTime || null,
            date: normalizedSelected.toISOString(),
            dateKey: key,
            category: newCategory,
            priority: newPriority,
            completed: false,
          })
        })
        if (response.ok) {
          const data = await response.json()
          const ev: CalendarEvent = {
            id: data.event?.id || `${Date.now()}`,
            docId: data.event?.id,
            title,
            time: newTime || undefined,
            notes: newNotes || undefined,
            dateValue: normalizedSelected,
            daysUntil: dayDiff,
            category: newCategory,
            priority: newPriority,
            completed: false,
          }
          setEventsByDate((prev) => ({
            ...prev,
            [key]: [...(prev[key] || []), ev],
          }))
        }
      } catch (error) {
        console.error('Failed to add event:', error)
      }
    } else {
      const ev: CalendarEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        time: newTime || undefined,
        notes: newNotes || undefined,
        dateValue: normalizedSelected,
        daysUntil: dayDiff,
        category: newCategory,
        priority: newPriority,
        completed: false,
      }
      setEventsByDate((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []), ev],
      }))
    }

    setNewTitle('')
    setNewTime('')
    setNewNotes('')
  }

  const deleteEvent = async (key: string, id: string) => {
    if (uid) {
      const ev = (eventsByDate[key] || []).find((e) => e.docId === id || e.id === id)
      if (ev?.docId) {
        try {
          await fetch(`/api/calendar?id=${ev.docId}`, { method: 'DELETE', credentials: 'include' })
        } catch (error) {
          console.error('Failed to delete event:', error)
        }
      }
    }
    setEventsByDate((prev) => {
      const list = prev[key] || []
      const nextList = list.filter((e) => e.id !== id && e.docId !== id)
      const next = { ...prev }
      if (nextList.length) next[key] = nextList
      else delete next[key]
      return next
    })
  }

  const toggleCompleted = async (key: string, id: string) => {
    const target = (eventsByDate[key] || []).find((e) => e.id === id || e.docId === id)
    if (!target) return
    const nextCompleted = !target.completed

    if (uid && target.docId) {
      try {
        await fetch('/api/calendar', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: target.docId, completed: nextCompleted })
        })
      } catch (error) {
        console.error('Failed to update event:', error)
      }
    }

    setEventsByDate((prev) => ({
      ...prev,
      [key]: (prev[key] || []).map((e) =>
        e.id === id || e.docId === id ? { ...e, completed: nextCompleted } : e
      ),
    }))
  }

  const monthName = visibleMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })
  const today = startOfDay(new Date())

  const monthCells = useMemo(() => {
    const firstOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
    const startWeekday = firstOfMonth.getDay()
    const startDate = new Date(firstOfMonth)
    startDate.setDate(firstOfMonth.getDate() - startWeekday)

    const cells: DayCell[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate)
      d.setDate(startDate.getDate() + i)
      cells.push({
        date: d,
        inCurrentMonth: d.getMonth() === visibleMonth.getMonth(),
        isToday: isSameDay(startOfDay(d), today),
        isSelected: selectedDate ? isSameDay(startOfDay(d), startOfDay(selectedDate)) : false,
      })
    }
    return cells
  }, [visibleMonth, selectedDate, today])

  const selectedKey = selectedDate ? dateKey(selectedDate) : dateKey(today)
  const selectedEvents = (eventsByDate[selectedKey] || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''))

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const categoryClass = (category?: CalendarEvent['category']) => {
    switch (category) {
      case 'deadline':
        return styles.eventPillDeadline
      case 'hearing':
        return styles.eventPillHearing
      case 'meeting':
        return styles.eventPillMeeting
      case 'reminder':
        return styles.eventPillReminder
      default:
        return styles.eventPillOther
    }
  }

  const categoryItemClass = (category?: CalendarEvent['category']) => {
    switch (category) {
      case 'deadline':
        return styles.eventItemDeadline
      case 'hearing':
        return styles.eventItemHearing
      case 'meeting':
        return styles.eventItemMeeting
      case 'reminder':
        return styles.eventItemReminder
      default:
        return styles.eventItemOther
    }
  }

  return (
    <div className={styles.calendarPage}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>MyCalendar</h1>
          <p>Track deadlines, hearings, and case milestones in one place.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.navButton} onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}>
            Prev
          </button>
          <button className={styles.navButton} onClick={() => setVisibleMonth(today)}>
            Today
          </button>
          <button className={styles.navButton} onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}>
            Next
          </button>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={`${styles.card} ${styles.calendarCard}`}>
          <div className={styles.monthHeader}>
            <div className={styles.monthTitle}>{monthName}</div>
          </div>
          <div className={styles.monthGrid}>
            {dayNames.map((day) => (
              <div key={day} className={styles.dayHeader}>{day}</div>
            ))}
            {monthCells.map((cell) => {
              const key = dateKey(cell.date)
              const events = eventsByDate[key] || []
              return (
                <div
                  key={cell.date.toISOString()}
                  onClick={() => setSelectedDate(cell.date)}
                  className={`${styles.dayCell} ${cell.inCurrentMonth ? '' : styles.dayCellMuted} ${cell.isToday ? styles.dayCellToday : ''} ${cell.isSelected ? styles.dayCellActive : ''}`}
                >
                  <div className={styles.dayNumber}>{cell.date.getDate()}</div>
                  {events.slice(0, 2).map((event) => (
                    <div
                      key={event.id}
                      className={`${styles.eventPill} ${categoryClass(event.category)} ${event.completed ? styles.eventPillDone : ''}`}
                    >
                      {event.title}
                    </div>
                  ))}
                  {events.length > 2 && (
                    <div className={styles.eventPill}>+{events.length - 2} more</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className={styles.sidebarColumn}>
          <div className={`${styles.card} ${styles.sidebar}`}>
            <div>
              <div className={styles.sidebarTitle}>Selected Date</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 6 }}>
                {selectedDate?.toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>

            <div>
              <div className={styles.sidebarTitle}>Events</div>
              <div className={styles.eventList}>
                {selectedEvents.length === 0 && (
                  <div className={styles.emptyState}>No events for this date. Add a deadline to get started.</div>
                )}
                {selectedEvents.map((event) => (
                  <div key={event.id} className={`${styles.eventItem} ${categoryItemClass(event.category)}`}>
                    <div className={styles.eventItemHeader}>
                      <div className={styles.eventTitle} style={{ textDecoration: event.completed ? 'line-through' : 'none' }}>
                        {event.title}
                      </div>
                      <span className={`${styles.badge} ${event.priority === 'high' ? styles.badgeHigh : ''}`}>
                        {event.priority}
                      </span>
                    </div>
                    <div className={styles.eventMeta}>
                      {event.time ? `${event.time} · ` : ''}{event.category}
                    </div>
                    {event.notes && <div className={styles.eventMeta}>{event.notes}</div>}
                    <div className={styles.eventActions}>
                      <button
                        className={styles.inlineButton}
                        onClick={() => toggleCompleted(selectedKey, event.id)}
                      >
                        {event.completed ? 'Unmark' : 'Mark done'}
                      </button>
                      <button
                        className={styles.inlineButton}
                        onClick={() => deleteEvent(selectedKey, event.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {isPaidPlan && (
            <div className={`${styles.card} ${styles.preferenceCard}`}>
              <div className={styles.sidebarTitle}>Email Reminders</div>
              <div className={styles.preferenceRow}>
                <div>
                  <div className={styles.preferenceLabel}>Deadline reminder emails</div>
                  <div className={styles.preferenceHint}>Get email alerts for upcoming deadlines.</div>
                </div>
                <button
                  className={`${styles.toggleButton} ${remindersEnabled ? styles.toggleOn : ''}`}
                  onClick={toggleReminderEmails}
                  disabled={prefsLoading || prefsSaving}
                  aria-pressed={remindersEnabled}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
              {prefsError && <div className={styles.preferenceError}>{prefsError}</div>}
            </div>
          )}

          <div className={`${styles.card} ${styles.addCard}`}>
            <div className={styles.sidebarTitle}>Add Deadline</div>
            <div className={styles.formGroup}>
              <label>Title</label>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Deadline title" />
            </div>
            <div className={styles.formGroup}>
              <label>Date</label>
              <input
                type="date"
                value={selectedDate ? dateKey(selectedDate) : dateKey(today)}
                onChange={(e) => {
                  const [year, month, day] = e.target.value.split('-').map(Number)
                  if (!year || !month || !day) return
                  setSelectedDate(new Date(year, month - 1, day))
                }}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Time</label>
              <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label>Category</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as any)}>
                <option value="deadline">Deadline</option>
                <option value="hearing">Hearing</option>
                <option value="meeting">Meeting</option>
                <option value="reminder">Reminder</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Priority</label>
              <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as any)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Notes</label>
              <textarea rows={3} value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.navButton} onClick={() => {
                setNewTitle('')
                setNewTime('')
                setNewNotes('')
              }}>
                Clear
              </button>
              <button className={styles.primaryButton} onClick={addEvent}>
                Save deadline
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
