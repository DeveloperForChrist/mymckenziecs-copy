'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import { hasReminderAccess as planHasReminderAccess } from '@/lib/plans/access'
import styles from './calendar-new.module.css'

const CALENDAR_READ_ONLY_MESSAGE = 'Read-only mode: resume plan to manage calendar events.'

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
type EventStatus = 'done' | 'overdue' | 'today' | 'upcoming' | 'future'
type EventListItem = CalendarEvent & { keyDate: string }

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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function dateKeyFromUnknown(input: any): string | null {
  if (typeof input !== 'string') return null
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

function parseEventDate(value?: string | Date | null) {
  if (!value) return new Date()
  if (value instanceof Date) return value
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    // Calendar treats stored values as date-only labels; avoid timezone day-shifts.
    return new Date(year, month - 1, day)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function getDaysUntil(date: Date) {
  return Math.round((startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / (1000 * 60 * 60 * 24))
}

function resolveDaysUntil(event: CalendarEvent) {
  if (event.dateValue) {
    return getDaysUntil(parseEventDate(event.dateValue))
  }
  return event.daysUntil ?? null
}

function getEventStatus(event: CalendarEvent): EventStatus {
  if (event.completed) return 'done'
  const daysUntil = resolveDaysUntil(event)
  if (daysUntil === null) return 'future'
  if (event.category === 'deadline') {
    if (daysUntil < 0) return 'overdue'
    if (daysUntil === 0) return 'today'
    if (daysUntil <= 7) return 'upcoming'
  }
  if (daysUntil === 0) return 'today'
  if (daysUntil > 0 && daysUntil <= 7) return 'upcoming'
  return 'future'
}

function statusRank(status: EventStatus) {
  if (status === 'overdue') return 0
  if (status === 'today') return 1
  if (status === 'upcoming') return 2
  if (status === 'future') return 3
  return 4
}

function statusLabel(event: CalendarEvent) {
  const status = getEventStatus(event)
  const daysUntil = resolveDaysUntil(event)
  if (status === 'done') return 'Completed'
  if (daysUntil === null) return 'Scheduled'
  if (status === 'overdue') return `Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'}`
  if (status === 'today') return 'Due today'
  if (daysUntil > 0) return `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`
  return 'Scheduled'
}

type EnhancedCalendarClientProps = {
  initialAuthUid?: string | null
  initialHasPaidAccess?: boolean
  initialPlanChecked?: boolean
  initialHasReminderAccess?: boolean
  initialRemindersEnabled?: boolean
  lessRounded?: boolean
}

export default function EnhancedCalendarClient({
  initialAuthUid = null,
  initialHasPaidAccess = false,
  initialPlanChecked = false,
  initialHasReminderAccess = false,
  initialRemindersEnabled = false,
  lessRounded = false,
}: EnhancedCalendarClientProps = {}) {
  const [visibleMonth, setVisibleMonth] = useState(startOfDay(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(startOfDay(new Date()))
  const [eventsByDate, setEventsByDate] = useState<EventsByDate>({})
  const [newTitle, setNewTitle] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newCategory, setNewCategory] = useState<CalendarEvent['category']>('deadline')
  const [newPriority, setNewPriority] = useState<CalendarEvent['priority']>('medium')
  const [uid, setUid] = useState<string | null>(initialAuthUid)
  const [authChecked, setAuthChecked] = useState(Boolean(initialAuthUid))
  const [hasPaidAccess, setHasPaidAccess] = useState(Boolean(initialHasPaidAccess))
  const [planChecked, setPlanChecked] = useState(Boolean(initialPlanChecked))
  const [hasReminderAccess, setHasReminderAccess] = useState(Boolean(initialHasReminderAccess))
  const [remindersEnabled, setRemindersEnabled] = useState(Boolean(initialRemindersEnabled))
  const [prefsLoading, setPrefsLoading] = useState(Boolean(initialAuthUid))
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSavingEvent, setIsSavingEvent] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(true)
  const [calendarLoadError, setCalendarLoadError] = useState<string | null>(null)
  const [eventsPanelMode, setEventsPanelMode] = useState<'view' | 'add'>('view')

  const mapEventsToDateMap = (rows: any[]): EventsByDate => {
    const map: EventsByDate = {}
    ;(rows || []).forEach((ev: any) => {
      const jsDate = parseEventDate(ev.date)
      const key = dateKeyFromUnknown(ev.date) || dateKey(jsDate)
      const event: CalendarEvent = {
        id: ev.id,
        docId: ev.id,
        title: ev.title ?? 'Untitled',
        notes: ev.notes,
        time: ev.time,
        type: ev.type,
        source: ev.source,
        dateValue: jsDate,
        daysUntil: getDaysUntil(jsDate),
        priority: ev.priority || 'medium',
        category: ev.category || 'deadline',
        completed: Boolean(ev.completed),
      }
      if (!map[key]) map[key] = []
      map[key].push(event)
    })
    return map
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => {
      setUid(data?.user?.id || null)
      setAuthChecked(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user?.id || null)
      setAuthChecked(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!authChecked || uid) return
    try {
      const raw = localStorage.getItem('calendarEvents:v2')
      if (raw) {
        setEventsByDate(JSON.parse(raw))
      }
    } catch (_) {}
    setEventsLoading(false)
  }, [authChecked, uid])

  useEffect(() => {
    if (!authChecked || uid) return
    try {
      localStorage.setItem('calendarEvents:v2', JSON.stringify(eventsByDate))
    } catch (_) {}
  }, [authChecked, eventsByDate, uid])

  useEffect(() => {
    if (!authChecked) return
    const fetchEvents = async () => {
      setEventsLoading(true)
      try {
        if (!uid) {
          setCalendarLoadError(null)
          setEventsLoading(false)
          return
        }

        const rangeStart = startOfMonth(addMonths(visibleMonth, -1))
        const rangeEnd = endOfMonth(addMonths(visibleMonth, 2))
        const params = new URLSearchParams({
          startDate: rangeStart.toISOString(),
          endDate: rangeEnd.toISOString(),
        })

        const response = await fetch(`/api/calendar?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!response.ok) {
          setCalendarLoadError('Unable to load calendar events.')
          return
        }
        const payload = await response.json()
        const rows = Array.isArray(payload?.events) ? payload.events : []

        setEventsByDate(mapEventsToDateMap(rows))
        setCalendarLoadError(null)
      } catch (error: any) {
        console.error('Failed to fetch calendar events:', error)
        setCalendarLoadError('Unable to load calendar events. Please refresh and try again.')
      } finally {
        setEventsLoading(false)
      }
    }
    fetchEvents()
  }, [authChecked, uid, visibleMonth])

  useEffect(() => {
    if (!authChecked) return
    if (!uid) {
      setHasPaidAccess(false)
      setPlanChecked(true)
      setHasReminderAccess(false)
      setPrefsLoading(false)
      return
    }
    const loadPlanAndPrefs = async () => {
      setPrefsLoading(true)
      setPrefsError(null)
      try {
        const planRes = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' })
        if (!planRes.ok) throw new Error('Failed to load plan')
        const planData = await planRes.json()
        const platformAccess = Boolean(planData?.platformAccess ?? planData?.paidAccess)
        setHasPaidAccess(platformAccess)
        const canUseReminders = Boolean(planData?.paidAccess) && planHasReminderAccess(planData?.plan || '')
        setHasReminderAccess(canUseReminders)

        if (canUseReminders) {
          const prefRes = await fetch('/api/user/preferences', { credentials: 'include', cache: 'no-store' })
          if (!prefRes.ok) throw new Error('Failed to load preferences')
          const prefData = await prefRes.json()
          setRemindersEnabled(prefData.deadline_reminders === true)
        } else {
          setRemindersEnabled(false)
        }
      } catch (error) {
        console.error('Failed to load plan/preferences', error)
        setHasPaidAccess(false)
        setHasReminderAccess(false)
        setRemindersEnabled(false)
        setPrefsError('Unable to load reminder preferences')
      } finally {
        setPrefsLoading(false)
        setPlanChecked(true)
      }
    }
    loadPlanAndPrefs()
  }, [authChecked, uid])

  const toggleReminderEmails = async () => {
    if (!uid || !hasReminderAccess || !hasPaidAccess) return
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

  const resetForm = () => {
    setNewTitle('')
    setNewTime('')
    setNewNotes('')
    setFormError(null)
  }

  const addEvent = async () => {
    if (!canManageEvents) {
      setFormError(CALENDAR_READ_ONLY_MESSAGE)
      return
    }
    if (!selectedDate) return
    const title = newTitle.trim()
    if (title.length < 2) {
      setFormError('Title must be at least 2 characters.')
      return
    }
    if (title.length > 180) {
      setFormError('Title cannot be more than 180 characters.')
      return
    }
    if (newNotes.trim().length > 2000) {
      setFormError('Notes cannot be more than 2000 characters.')
      return
    }
    setFormError(null)
    setIsSavingEvent(true)

    const normalizedSelected = startOfDay(selectedDate)
    try {
      const response = await fetch('/api/calendar', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          notes: newNotes.trim() || null,
          time: newTime || null,
          date: dateKey(normalizedSelected),
          category: newCategory,
          priority: newPriority,
          type: 'user_created',
        }),
      })
      if (response.status === 402) {
        const payload = await response.json().catch(() => ({} as Record<string, any>))
        setHasPaidAccess(false)
        setFormError(
          typeof payload?.error === 'string' && payload.error.trim() ? payload.error : CALENDAR_READ_ONLY_MESSAGE
        )
        return
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as Record<string, any>))
        setFormError(typeof payload?.error === 'string' ? payload.error : 'Failed to save event.')
        return
      }

      const result = await response.json()
      const insertedEvents = Array.isArray(result?.events) ? result.events : result?.event ? [result.event] : []
      if (insertedEvents.length === 0) {
        setFormError('No events were created.')
        return
      }

      setEventsByDate((prev) => {
        const next = { ...prev }
        insertedEvents.forEach((ev: any) => {
          const jsDate = parseEventDate(ev.date)
          const key = dateKeyFromUnknown(ev.date) || dateKey(jsDate)
          const mappedEvent: CalendarEvent = {
            id: ev.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            docId: ev.id,
            title: ev.title ?? title,
            notes: ev.notes ?? undefined,
            time: ev.time ?? undefined,
            type: ev.type ?? undefined,
            source: ev.source ?? undefined,
            dateValue: jsDate,
            daysUntil: getDaysUntil(jsDate),
            priority: (ev.priority || newPriority || 'medium') as CalendarEvent['priority'],
            category: (ev.category || newCategory || 'deadline') as CalendarEvent['category'],
            completed: Boolean(ev.completed),
          }
          next[key] = [...(next[key] || []), mappedEvent]
        })
        return next
      })

      resetForm()
    } catch (error) {
      console.error('Failed to save event:', error)
      setFormError('Failed to save event. Please try again.')
    } finally {
      setIsSavingEvent(false)
    }
  }

  const deleteEvent = async (key: string, id: string) => {
    if (!canManageEvents) {
      setFormError(CALENDAR_READ_ONLY_MESSAGE)
      return
    }
    const ev = (eventsByDate[key] || []).find((e) => e.docId === id || e.id === id)
    if (!ev?.docId) {
      setFormError('Event not found.')
      return
    }

    try {
      const response = await fetch(`/api/calendar?id=${encodeURIComponent(ev.docId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (response.status === 402) {
        const payload = await response.json().catch(() => ({} as Record<string, any>))
        setHasPaidAccess(false)
        setFormError(
          typeof payload?.error === 'string' && payload.error.trim() ? payload.error : CALENDAR_READ_ONLY_MESSAGE
        )
        return
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as Record<string, any>))
        setFormError(typeof payload?.error === 'string' ? payload.error : 'Failed to delete event.')
        return
      }
    } catch (error) {
      console.error('Failed to delete event:', error)
      setFormError('Failed to delete event.')
      return
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
    if (!canManageEvents) {
      setFormError(CALENDAR_READ_ONLY_MESSAGE)
      return
    }
    const target = (eventsByDate[key] || []).find((e) => e.id === id || e.docId === id)
    if (!target?.docId) return
    const nextCompleted = !target.completed

    setEventsByDate((prev) => ({
      ...prev,
      [key]: (prev[key] || []).map((e) =>
        e.id === id || e.docId === id ? { ...e, completed: nextCompleted } : e
      ),
    }))

    try {
      const response = await fetch('/api/calendar', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.docId, completed: nextCompleted }),
      })
      if (response.status === 402) {
        const payload = await response.json().catch(() => ({} as Record<string, any>))
        setHasPaidAccess(false)
        setFormError(
          typeof payload?.error === 'string' && payload.error.trim() ? payload.error : CALENDAR_READ_ONLY_MESSAGE
        )
        throw new Error('READ_ONLY')
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as Record<string, any>))
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to update event.')
      }
    } catch (error) {
      console.error('Failed to update event:', error)
      if (error instanceof Error && error.message && error.message !== 'READ_ONLY') {
        setFormError(error.message)
      }
      setEventsByDate((prev) => ({
        ...prev,
        [key]: (prev[key] || []).map((e) =>
          e.id === id || e.docId === id ? { ...e, completed: !nextCompleted } : e
        ),
      }))
    }
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

  const allEventsList = useMemo<EventListItem[]>(() => {
    const all: EventListItem[] = []
    Object.entries(eventsByDate).forEach(([key, list]) => {
      list.forEach((event) => {
        all.push({ ...event, keyDate: key })
      })
    })

    return all.sort((a, b) => {
      const aDate = a.dateValue ? parseEventDate(a.dateValue) : parseEventDate(`${a.keyDate}T00:00:00Z`)
      const bDate = b.dateValue ? parseEventDate(b.dateValue) : parseEventDate(`${b.keyDate}T00:00:00Z`)
      const dateDiff = aDate.getTime() - bDate.getTime()
      if (dateDiff !== 0) return dateDiff
      const statusDiff = statusRank(getEventStatus(a)) - statusRank(getEventStatus(b))
      if (statusDiff !== 0) return statusDiff
      const timeDiff = (a.time || '').localeCompare(b.time || '')
      if (timeDiff !== 0) return timeDiff
      return (a.title || '').localeCompare(b.title || '')
    })
  }, [eventsByDate])

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

  const categoryDotClass = (category?: CalendarEvent['category']) => {
    switch (category) {
      case 'deadline':
        return styles.eventDotDeadline
      case 'hearing':
        return styles.eventDotHearing
      case 'meeting':
        return styles.eventDotMeeting
      case 'reminder':
        return styles.eventDotReminder
      default:
        return styles.eventDotOther
    }
  }

  const statusClass = (status: EventStatus) => {
    if (status === 'overdue') return styles.eventStatusOverdue
    if (status === 'today') return styles.eventStatusToday
    if (status === 'upcoming') return styles.eventStatusUpcoming
    if (status === 'done') return styles.eventStatusDone
    return styles.eventStatusFuture
  }

  const readOnlyMode = Boolean(uid) && planChecked && !hasPaidAccess
  const canManageEvents = Boolean(uid) && planChecked && hasPaidAccess

  useEffect(() => {
    if (readOnlyMode && eventsPanelMode === 'add') {
      setEventsPanelMode('view')
    }
  }, [eventsPanelMode, readOnlyMode])

  return (
    <div className={`${styles.calendarPage} ${lessRounded ? styles.lessRounded : ''}`}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>MyCalendar</h1>
          <p>Manage hearings, filing deadlines, client meetings and case milestones.</p>
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
          {calendarLoadError && <div className={styles.formError}>{calendarLoadError}</div>}
          <div className={styles.monthGrid}>
            {dayNames.map((day) => (
              <div key={day} className={styles.dayHeader}>
                {day}
              </div>
            ))}
            {monthCells.map((cell) => {
              const key = dateKey(cell.date)
              const events = eventsByDate[key] || []
              return (
                <div
                  key={cell.date.toISOString()}
                  onClick={() => setSelectedDate(cell.date)}
                  className={`${styles.dayCell} ${cell.inCurrentMonth ? '' : styles.dayCellMuted} ${
                    cell.isToday ? styles.dayCellToday : ''
                  } ${cell.isSelected ? styles.dayCellActive : ''}`}
                >
                  <div className={styles.dayTopRow}>
                    <div className={styles.dayNumber}>{cell.date.getDate()}</div>
                  </div>
                  {events.length > 0 && <div className={styles.dayEventCount}>{events.length}</div>}
                  {events.length > 0 && (
                    <div className={styles.eventDots} aria-label={`${events.length} scheduled event${events.length === 1 ? '' : 's'}`}>
                      {events.slice(0, 3).map((event) => (
                        <span key={`${event.id}-dot`} className={`${styles.eventDot} ${categoryDotClass(event.category)}`} />
                      ))}
                    </div>
                  )}
                  {events.slice(0, 2).map((event) => {
                    const status = getEventStatus(event)
                    return (
                      <div
                        key={event.id}
                        className={`${styles.eventPill} ${categoryClass(event.category)} ${
                          event.completed ? styles.eventPillDone : ''
                        } ${statusClass(status)}`}
                      >
                        {event.title}
                      </div>
                    )
                  })}
                  {events.length > 2 && <div className={styles.eventPill}>+{events.length - 2} more</div>}
                </div>
              )
            })}
          </div>
        </div>

        <div className={styles.sidebarColumn}>
          {planChecked && !prefsLoading && hasReminderAccess ? (
            <div className={`${styles.card} ${styles.preferenceCard}`}>
              <div className={styles.sidebarTitle}>Email Reminders</div>
              <div className={styles.preferenceRow}>
                <div>
                  <div className={styles.preferenceLabel}>Deadline reminder emails</div>
                  <div className={styles.preferenceHint}>Sent by the daily scheduler when this switch is enabled.</div>
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
          ) : null}

          <div className={`${styles.card} ${styles.sidebar} ${eventsPanelMode === 'add' ? styles.sidebarAddMode : ''}`}>
            <div className={styles.eventsPanelHeader}>
              <div className={styles.sidebarTitle}>Upcoming Events</div>
              <div className={styles.eventsModeSwitch}>
                <button
                  type="button"
                  className={`${styles.eventsModeButton} ${styles.eventsAddButton} ${
                    eventsPanelMode === 'add' ? styles.eventsModeButtonActive : ''
                  } ${
                    !canManageEvents ? styles.eventsModeButtonDisabled : ''
                  }`}
                  onClick={() => {
                    if (!canManageEvents) {
                      setFormError(CALENDAR_READ_ONLY_MESSAGE)
                      return
                    }
                    setEventsPanelMode('add')
                  }}
                  disabled={!canManageEvents}
                >
                  Add Event
                </button>
              </div>
            </div>
            {readOnlyMode && <div className={styles.readOnlyBanner}>{CALENDAR_READ_ONLY_MESSAGE}</div>}

            {eventsPanelMode === 'view' ? (
              <>
                <div>
                  <div className={styles.eventsSummary}>
                    {eventsLoading ? 'Loading...' : `${allEventsList.length} scheduled`}
                  </div>
                </div>

                <div>
                  <div className={styles.eventList}>
                    {eventsLoading && (
                      <div className={styles.emptyState}>Loading events...</div>
                    )}
                    {!eventsLoading && allEventsList.length === 0 && (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyStateIcon}>
                          <CalendarPlus size={22} aria-hidden="true" />
                        </div>
                        <strong>No events scheduled</strong>
                        <span>Add hearings, client meetings, filing deadlines and reminders to keep matters on track.</span>
                        <button
                          type="button"
                          className={styles.emptyStateAction}
                          onClick={() => {
                            if (!canManageEvents) {
                              setFormError(CALENDAR_READ_ONLY_MESSAGE)
                              return
                            }
                            setEventsPanelMode('add')
                          }}
                          disabled={!canManageEvents}
                        >
                          Add Event
                        </button>
                      </div>
                    )}
                    {!eventsLoading && allEventsList.map((event) => {
                      const status = getEventStatus(event)
                      const dueDate = event.dateValue
                        ? parseEventDate(event.dateValue)
                        : parseEventDate(`${event.keyDate}T00:00:00Z`)
                      return (
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
                            Due {dueDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                            {event.time ? ` · ${event.time}` : ''}
                            {event.category ? ` · ${event.category}` : ''}
                          </div>
                          <div className={`${styles.eventStatus} ${statusClass(status)}`}>{statusLabel(event)}</div>
                          {event.notes && <div className={styles.eventMeta}>{event.notes}</div>}
                          <div className={styles.eventActions}>
                            <button
                              className={styles.inlineButton}
                              onClick={() => toggleCompleted(event.keyDate, event.id)}
                              disabled={!canManageEvents}
                            >
                              {event.completed ? 'Unmark' : 'Mark done'}
                            </button>
                            <button
                              className={styles.inlineButton}
                              onClick={() => deleteEvent(event.keyDate, event.id)}
                              disabled={!canManageEvents}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className={styles.formGroup}>
                  <label>Title</label>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Event title"
                    disabled={!canManageEvents}
                  />
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
                    disabled={!canManageEvents}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Time</label>
                  <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} disabled={!canManageEvents} />
                </div>
                <div className={styles.formGroup}>
                  <label>Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as CalendarEvent['category'])}
                    disabled={!canManageEvents}
                  >
                    <option value="deadline">Deadline</option>
                    <option value="hearing">Hearing</option>
                    <option value="meeting">Meeting</option>
                    <option value="reminder">Reminder</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as CalendarEvent['priority'])}
                    disabled={!canManageEvents}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Notes</label>
                  <textarea rows={3} value={newNotes} onChange={(e) => setNewNotes(e.target.value)} disabled={!canManageEvents} />
                </div>
                <div className={styles.modalActions}>
                  <button className={styles.navButton} onClick={resetForm} disabled={!canManageEvents}>
                    Clear
                  </button>
                  <button className={styles.primaryButton} onClick={addEvent} disabled={isSavingEvent || !canManageEvents}>
                    {isSavingEvent ? 'Saving...' : 'Save event'}
                  </button>
                </div>
              </>
            )}
            {formError && <div className={styles.formError}>{formError}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
