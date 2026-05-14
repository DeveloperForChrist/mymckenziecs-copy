'use client'
import { useState } from 'react'
import { Bell, CheckCircle2, XCircle, AlertTriangle, Info, Calendar, User, FileText, MessageSquare, Trash2, CheckCheck, Filter } from 'lucide-react'
import styles from './alerts.module.css'

type AlertType = 'deadline' | 'message' | 'lead' | 'system' | 'document' | 'meeting'
type AlertPriority = 'urgent' | 'high' | 'medium' | 'low'

interface Alert {
  id: string
  type: AlertType
  priority: AlertPriority
  title: string
  body: string
  time: string
  read: boolean
  clientName?: string
  actionLabel?: string
}

const MOCK: Alert[] = [
  { id: '1', type: 'deadline', priority: 'urgent', title: 'ET1 Filing Deadline — 3 Days', body: 'Priya Sharma\'s Employment Tribunal claim must be submitted by 12 July 2026. Do not miss this deadline.', time: '5 min ago', read: false, clientName: 'Priya Sharma', actionLabel: 'Open Matter' },
  { id: '2', type: 'lead', priority: 'high', title: 'New Enquiry Received', body: 'James Okafor submitted a portal enquiry regarding housing disrepair and a Section 21 notice.', time: '12 min ago', read: false, actionLabel: 'View Lead' },
  { id: '3', type: 'meeting', priority: 'high', title: 'Client Meeting in 1 Hour', body: 'Initial Consultation with James Okafor is scheduled for 10:00 today.', time: '30 min ago', read: false, clientName: 'James Okafor', actionLabel: 'Join Room' },
  { id: '4', type: 'document', priority: 'medium', title: 'Document Uploaded', body: 'Angela Mensah uploaded 3 new files: Mediation Certificate, Message Logs, Court Letter.', time: '1 hour ago', read: false, clientName: 'Angela Mensah', actionLabel: 'View Documents' },
  { id: '5', type: 'message', priority: 'medium', title: 'New Message from Client', body: 'David Clarke sent a message: "I have received a response from the contractor..."', time: '2 hours ago', read: false, clientName: 'David Clarke', actionLabel: 'Reply' },
  { id: '6', type: 'deadline', priority: 'high', title: 'Court Date — 5 Days', body: 'James Okafor\'s housing hearing is listed for 15 June 2026 at Lambeth County Court.', time: '3 hours ago', read: true, clientName: 'James Okafor' },
  { id: '7', type: 'system', priority: 'low', title: 'Weekly Summary Ready', body: 'Your weekly case activity summary is ready. 4 active matters, 2 new leads, 1 deadline this week.', time: '1 day ago', read: true },
  { id: '8', type: 'document', priority: 'low', title: 'Note Auto-Saved', body: 'Your case notes for Angela Mensah were automatically saved.', time: '1 day ago', read: true, clientName: 'Angela Mensah' },
]

const TYPE_ICON: Record<AlertType, React.ElementType> = { deadline: AlertTriangle, message: MessageSquare, lead: User, system: Info, document: FileText, meeting: Calendar }
const TYPE_LABEL: Record<AlertType, string> = { deadline: 'Deadline', message: 'Message', lead: 'New Lead', system: 'System', document: 'Document', meeting: 'Meeting' }
const PRIORITY_CLS: Record<AlertPriority, string> = { urgent: 'priorityUrgent', high: 'priorityHigh', medium: 'priorityMedium', low: 'priorityLow' }

type FilterTab = 'all' | 'unread' | AlertType
const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'deadline', label: 'Deadlines' },
  { id: 'lead', label: 'Leads' },
  { id: 'meeting', label: 'Meetings' },
  { id: 'message', label: 'Messages' },
  { id: 'document', label: 'Documents' },
  { id: 'system', label: 'System' },
]

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>(MOCK)
  const [tab, setTab] = useState<FilterTab>('all')
  const [selected, setSelected] = useState<Alert | null>(MOCK[0])

  const filtered = alerts.filter(a => {
    if (tab === 'all') return true
    if (tab === 'unread') return !a.read
    return a.type === tab
  })

  const unreadCount = alerts.filter(a => !a.read).length

  const markRead = (id: string) => {
    setAlerts(p => p.map(a => a.id === id ? { ...a, read: true } : a))
    if (selected?.id === id) setSelected(p => p ? { ...p, read: true } : p)
  }

  const dismiss = (id: string) => {
    setAlerts(p => p.filter(a => a.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const markAllRead = () => setAlerts(p => p.map(a => ({ ...a, read: true })))

  const selectAlert = (a: Alert) => {
    setSelected(a)
    if (!a.read) markRead(a.id)
  }

  const IconComp = selected ? TYPE_ICON[selected.type] : Bell

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTop}>
            <h2 className={styles.sidebarTitle}>Alerts</h2>
            {unreadCount > 0 && <span className={styles.unreadPill}>{unreadCount}</span>}
          </div>
          <p className={styles.sidebarSub}>Deadlines, messages, and system notifications</p>
          {unreadCount > 0 && (
            <button type="button" className={styles.markAllBtn} onClick={markAllRead}>
              <CheckCheck size={13}/>Mark all as read
            </button>
          )}
        </div>
        <div className={styles.tabRow}>
          {TABS.map(t => (
            <button key={t.id} type="button" className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'unread' && unreadCount > 0 && ` (${unreadCount})`}
            </button>
          ))}
        </div>
        <div className={styles.alertList}>
          {filtered.length === 0 && <div className={styles.emptyList}><Bell size={28}/><p>No alerts</p></div>}
          {filtered.map(a => {
            const Icon = TYPE_ICON[a.type]
            return (
              <div key={a.id} role="button" tabIndex={0} className={`${styles.alertItem} ${selected?.id === a.id ? styles.alertItemActive : ''} ${!a.read ? styles.alertItemUnread : ''}`} onClick={() => selectAlert(a)} onKeyDown={e => { if (e.key === 'Enter') selectAlert(a) }}>
                <div className={`${styles.alertIcon} ${styles[PRIORITY_CLS[a.priority]]}`}><Icon size={14}/></div>
                <div className={styles.alertContent}>
                  <div className={styles.alertItemTop}>
                    <span className={styles.alertTitle}>{a.title}</span>
                    {!a.read && <span className={styles.unreadDot}/>}
                  </div>
                  <p className={styles.alertPreview}>{a.body}</p>
                  <div className={styles.alertMeta}>
                    {a.clientName && <span>{a.clientName}</span>}
                    <span>{a.time}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className={styles.detail}>
        {!selected ? (
          <div className={styles.emptyDetail}><Bell size={48}/><p>Select an alert to view details</p></div>
        ) : (
          <>
            <div className={styles.detailHeader}>
              <div className={styles.detailIconWrap}><IconComp size={20}/></div>
              <div className={styles.detailHeaderText}>
                <h2 className={styles.detailTitle}>{selected.title}</h2>
                <div className={styles.detailMeta}>
                  <span className={`${styles.typeBadge} ${styles[PRIORITY_CLS[selected.priority]]}`}>{selected.priority.toUpperCase()}</span>
                  <span className={styles.detailMetaItem}>{TYPE_LABEL[selected.type]}</span>
                  {selected.clientName && <span className={styles.detailMetaItem}><User size={12}/>{selected.clientName}</span>}
                  <span className={styles.detailMetaItem}>{selected.time}</span>
                </div>
              </div>
              <div className={styles.detailHeaderActions}>
                {!selected.read && <button type="button" className={styles.actionBtn} onClick={() => markRead(selected.id)}><CheckCircle2 size={14}/>Mark Read</button>}
                <button type="button" className={styles.dismissBtn} onClick={() => dismiss(selected.id)}><Trash2 size={14}/>Dismiss</button>
              </div>
            </div>
            <div className={styles.detailBody}>
              <p className={styles.detailBodyText}>{selected.body}</p>
              {selected.actionLabel && (
                <button type="button" className={styles.primaryActionBtn}>{selected.actionLabel} →</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
