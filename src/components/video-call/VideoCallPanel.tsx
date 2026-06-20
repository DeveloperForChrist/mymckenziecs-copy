'use client'
import Link from 'next/link'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { Video, Plus, Calendar, Clock, User, Mail, Copy, CheckCircle2, Play, XCircle, Maximize2, Minimize2 } from 'lucide-react'
import WebRtcMeeting from '@/components/video/WebRtcMeeting'
import styles from './videocall.module.css'
import { getAppMarketFromPathname, getAppRouteForMarket } from '@/lib/markets/app-routes'
import { BUSINESS_MEETINGS_UPDATED_EVENT } from '@/lib/events/business-events'

type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
interface Meeting { id:string; clientId?: string | null; title:string; clientName:string; clientEmail:string; date:string; time:string; duration:number; roomName:string; status:MeetingStatus; agenda?:string; source?: 'database' | 'local' }
interface ClientContact { id: string; name: string; email: string }

function makeRoom(title:string,id:string){return `mymckenziecs-${title.toLowerCase().replace(/[^a-z0-9]/g,'-').slice(0,28)}-${id}`}
function fmtDate(d:string){return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
function formatMeetingStamp(meeting: Meeting) {
  return `${fmtDate(meeting.date)}${meeting.time ? ` at ${meeting.time}` : ''}`
}
function buildMeetingNoteTitle(meeting: Meeting) {
  const clientName = meeting.clientName || 'client'
  return `Meeting with ${clientName} at ${formatMeetingStamp(meeting)} notes`
}
function buildMeetingNoteContent(meeting: Meeting, noteBody: string) {
  return [
    `Meeting: ${meeting.title || 'Client consultation'}`,
    `Client: ${meeting.clientName || 'Client'}`,
    `When: ${formatMeetingStamp(meeting)}`,
    `Room: ${meeting.roomName}`,
    '',
    noteBody.trim(),
  ].join('\n')
}
function meetingLink(roomName:string){
  if (typeof window === 'undefined') return `/video-call?room=${encodeURIComponent(roomName)}`
  const url = new URL('/video-call', window.location.origin)
  url.searchParams.set('room', roomName)
  return url.toString()
}

const LOCAL_MEETINGS_KEY='mymckenzie-business-client-meetings'
const LOCAL_CLIENTS_KEY='mymckenzie-business-meeting-clients'
const LOCAL_MEETING_NOTES_KEY='mymckenzie-business-meeting-notes'
const LEGACY_MOCK_MEETINGS_CACHE_CLEANUP_KEY='mymckenzie-business-meetings-cache-cleanup-v1'
const LEGACY_MOCK_MEETING_IDS = new Set(['1', '2', '3'])

const S_CLS:Record<MeetingStatus,string>={scheduled:styles.statusScheduled,in_progress:styles.statusLive,completed:styles.statusDone,cancelled:styles.statusCancelled,no_show:styles.statusCancelled}
const S_LBL:Record<MeetingStatus,string>={scheduled:'Scheduled',in_progress:'● Live',completed:'Done',cancelled:'Cancelled',no_show:'No show'}

function toTime(value: string) {
  return value ? value.slice(0, 5) : ''
}

function saveLocal(meetings: Meeting[], clients: ClientContact[]) {
  try {
    localStorage.setItem(LOCAL_MEETINGS_KEY, JSON.stringify(meetings))
    localStorage.setItem(LOCAL_CLIENTS_KEY, JSON.stringify(clients))
  } catch {
    // ignore localStorage failures
  }
}

function notifyMeetingsUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(BUSINESS_MEETINGS_UPDATED_EVENT))
}

function looksLikeLegacyMockMeetings(meetings: Meeting[]) {
  if (meetings.length !== 3) return false
  return meetings.every((meeting) => LEGACY_MOCK_MEETING_IDS.has(meeting.id))
}

function cleanupLegacyMockMeetingCache() {
  try {
    if (localStorage.getItem(LEGACY_MOCK_MEETINGS_CACHE_CLEANUP_KEY) === '1') return
    const rawMeetings = localStorage.getItem(LOCAL_MEETINGS_KEY)
    const parsedMeetings = rawMeetings ? JSON.parse(rawMeetings) : null
    if (Array.isArray(parsedMeetings) && looksLikeLegacyMockMeetings(parsedMeetings as Meeting[])) {
      localStorage.setItem(LOCAL_MEETINGS_KEY, JSON.stringify([]))
      localStorage.setItem(LOCAL_CLIENTS_KEY, JSON.stringify([]))
    }
    localStorage.setItem(LEGACY_MOCK_MEETINGS_CACHE_CLEANUP_KEY, '1')
  } catch {
    // ignore localStorage failures
  }
}

function loadLocal(): { meetings: Meeting[]; clients: ClientContact[] } {
  try {
    cleanupLegacyMockMeetingCache()
    const meetings = JSON.parse(localStorage.getItem(LOCAL_MEETINGS_KEY) || 'null') as Meeting[] | null
    const clients = JSON.parse(localStorage.getItem(LOCAL_CLIENTS_KEY) || 'null') as ClientContact[] | null
    if (Array.isArray(meetings) && Array.isArray(clients)) return { meetings, clients }
  } catch {
    // ignore parse errors
  }
  return { meetings: [], clients: [] }
}

function loadRecordStore(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [entryKey, value]) => {
      if (typeof entryKey === 'string' && typeof value === 'string') {
        acc[entryKey] = value
      }
      return acc
    }, {})
  } catch {
    return {}
  }
}

function saveRecordStore(key: string, value: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore localStorage failures
  }
}

function mapRowsToMeetings(rows: any[], clients: ClientContact[]): Meeting[] {
  const clientsById = new Map(clients.map((client) => [client.id, client]))
  return rows.map((row) => {
    const client = row.client_id ? clientsById.get(String(row.client_id)) : undefined
    return {
      id: String(row.id),
      clientId: row.client_id ? String(row.client_id) : null,
      title: String(row.title || 'Client consultation'),
      clientName: client?.name || 'Client',
      clientEmail: client?.email || '',
      date: String(row.meeting_date || ''),
      time: toTime(String(row.meeting_time || '')),
      duration: Number(row.duration_minutes || 45),
      roomName: String(row.room_name || ''),
      status: (row.status || 'scheduled') as MeetingStatus,
      agenda: String(row.description || ''),
      source: 'database',
    }
  })
}

export function VideoCallPanel({
  userId,
  meetingPreset,
  onMeetingPresetConsumed,
}: {
  userId: string
  meetingPreset?: { clientName?: string; clientEmail?: string; context?: string } | null
  onMeetingPresetConsumed?: () => void
}){
  const [meetings,setMeetings]=useState<Meeting[]>([])
  const [clients,setClients]=useState<ClientContact[]>([])
  const [selected,setSelected]=useState<Meeting|null>(null)
  const [tab,setTab]=useState<'upcoming'|'past'>('upcoming')
  const [showForm,setShowForm]=useState(false)
  const [inCall,setInCall]=useState(false)
  const [session,setSession]=useState(0)
  const [callExpanded,setCallExpanded]=useState(true)
  const [copied,setCopied]=useState(false)
  const [notice,setNotice]=useState('')
  const [err,setErr]=useState('')
  const [loading,setLoading]=useState(true)
  const [dataMode,setDataMode]=useState<'database'|'local'>('database')
  const [form,setForm]=useState({title:'',clientName:'',clientEmail:'',date:'',time:'',duration:'60',agenda:'',inviteMessage:''})
  const [meetingNotes, setMeetingNotes] = useState<Record<string, string>>({})
  const [meetingNoteStatus, setMeetingNoteStatus] = useState<string | null>(null)
  const [savingMeetingNote, setSavingMeetingNote] = useState(false)
  const [noteSavedPopup, setNoteSavedPopup] = useState<string | null>(null)
  const pathname = usePathname()
  const notesPageHref = useMemo(
    () => getAppRouteForMarket('/dashboard/MyNotes', getAppMarketFromPathname(pathname)),
    [pathname]
  )

  useEffect(() => {
    if (!inCall || !callExpanded) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [inCall, callExpanded])

  useEffect(() => {
    setMeetingNotes(loadRecordStore(LOCAL_MEETING_NOTES_KEY))
  }, [])

  const activeMeetingId = selected?.id || ''
  const activeNotes = activeMeetingId ? meetingNotes[activeMeetingId] || '' : ''

  const updateMeetingNotes = useCallback((value: string) => {
    if (!activeMeetingId) return
    setMeetingNotes((current) => {
      const next = { ...current, [activeMeetingId]: value }
      saveRecordStore(LOCAL_MEETING_NOTES_KEY, next)
      return next
    })
  }, [activeMeetingId])

  const saveMeetingNotesToNotesPage = useCallback(async () => {
    if (!selected) return
    const noteBody = activeNotes.trim()
    if (!noteBody) {
      setMeetingNoteStatus('Add some notes before saving.')
      return
    }

    setSavingMeetingNote(true)
    setMeetingNoteStatus(null)

    const title = buildMeetingNoteTitle(selected)
    const content = buildMeetingNoteContent(selected, noteBody)
    const now = new Date().toISOString()
    const newPage = {
      id: `meeting-${Date.now()}`,
      title,
      content,
      createdAt: now,
      updatedAt: now,
    }

    try {
      const response = await fetch('/api/notes', { cache: 'no-store', credentials: 'include' })
      const payload = await response.json().catch(() => ({} as Record<string, any>))
      const existingPages = Array.isArray(payload?.notesPages) ? payload.notesPages : []
      const normalizedPages = existingPages
        .filter((page: any) => page && typeof page === 'object')
        .map((page: any) => ({
          id: String(page.id || `note-${Date.now()}`),
          title: String(page.title || 'Untitled note'),
          content: String(page.content || ''),
          createdAt: String(page.createdAt || now),
          updatedAt: String(page.updatedAt || now),
        }))
      const nextPages = [newPage, ...normalizedPages]

      const saveResponse = await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          notesPages: nextPages,
          activePageId: newPage.id,
        }),
      })
      const savePayload = await saveResponse.json().catch(() => ({} as Record<string, any>))
      if (saveResponse.status === 402) {
        const message = typeof savePayload.error === 'string' ? savePayload.error : 'Notes are read-only for this account.'
        setMeetingNoteStatus(message)
        return
      }
      if (!saveResponse.ok) {
        throw new Error(typeof savePayload.error === 'string' ? savePayload.error : 'Failed to save note.')
      }

      setMeetingNoteStatus(null)
      setNoteSavedPopup(`Meeting notes saved. You can view them in the Notes page as "${title}".`)
      window.setTimeout(() => setNoteSavedPopup(null), 4500)
    } catch (error) {
      console.error('Failed to save meeting note', error)
      setMeetingNoteStatus('Could not save this note right now.')
    } finally {
      setSavingMeetingNote(false)
    }
  }, [activeNotes, selected])

  const loadMeetings = useCallback(async () => {
    let mounted = true
    const run = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/business/meetings', { credentials: 'include', cache: 'no-store' })
        if (!response.ok) throw new Error('Failed')
        const data = await response.json()
        const nextClients: ClientContact[] = Array.isArray(data.clients)
          ? data.clients.map((row: any) => ({ id: String(row.id), name: String(row.name || 'Client'), email: String(row.email || '') }))
          : []
        const nextMeetings = Array.isArray(data.meetings) ? mapRowsToMeetings(data.meetings, nextClients) : []
        if (!mounted) return
        setClients(nextClients)
        setMeetings(nextMeetings)
        setDataMode('database')
        setSelected((current) => {
          if (current && nextMeetings.some((meeting) => meeting.id === current.id)) return nextMeetings.find((meeting) => meeting.id === current.id) || null
          return nextMeetings[0] || null
        })
        saveLocal(nextMeetings, nextClients)
      } catch {
        const local = loadLocal()
        if (!mounted) return
        setClients(local.clients)
        setMeetings(local.meetings)
        setSelected(local.meetings[0] || null)
        setDataMode('local')
        setNotice('Using local meetings until the database is available.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    await run()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const cleanupPromise = loadMeetings()
    return () => {
      void cleanupPromise.then((cleanup) => {
        if (typeof cleanup === 'function') cleanup()
      })
    }
  }, [loadMeetings])

  const retryDatabaseSync = useCallback(async () => {
    setNotice('')
    await loadMeetings()
  }, [loadMeetings])

  useEffect(() => {
    if (!meetingPreset) return
    const suggestedTitle = 'Initial consultation'
    const agenda = meetingPreset.context ? `Lead context:\n${meetingPreset.context}` : ''
    setForm((current) => ({
      ...current,
      title: current.title || suggestedTitle,
      clientName: meetingPreset.clientName || current.clientName,
      clientEmail: meetingPreset.clientEmail || current.clientEmail,
      agenda: current.agenda || agenda,
    }))
    setShowForm(true)
    if (typeof onMeetingPresetConsumed === 'function') onMeetingPresetConsumed()
  }, [meetingPreset, onMeetingPresetConsumed])

  const upcomingList=meetings.filter(m=>m.status==='scheduled'||m.status==='in_progress')
  const pastList=meetings.filter(m=>m.status==='completed'||m.status==='cancelled'||m.status==='no_show')
  const listed=tab==='upcoming'?upcomingList:pastList

  const upd=(k:string,v:string)=>setForm(f=>({...f,[k]:v}))

  const handleSchedule=useCallback(async (e:React.FormEvent)=>{
    e.preventDefault()
    if(!form.title||!form.clientName||!form.date||!form.time){setErr('Fill in all required fields.');return}
    setErr('')
    const id=String(Date.now())
    const localMeeting:Meeting={id,title:form.title,clientName:form.clientName,clientEmail:form.clientEmail,date:form.date,time:form.time,duration:Number(form.duration),roomName:makeRoom(form.title,id),status:'scheduled',agenda:form.agenda,source:'local'}

    try {
      const response = await fetch('/api/business/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientName: form.clientName,
          clientEmail: form.clientEmail,
          title: form.title,
          meetingDate: form.date,
          meetingTime: form.time,
          durationMinutes: Number(form.duration),
          description: form.agenda,
          roomName: localMeeting.roomName,
          status: 'scheduled',
        }),
      })

      if (!response.ok) throw new Error('Failed to save')
      const payload = await response.json()
      const meetingRow = payload.meeting
      const clientKey = `${form.clientName.toLowerCase()}|${form.clientEmail.toLowerCase()}`
      let client = clients.find((entry) => `${entry.name.toLowerCase()}|${entry.email.toLowerCase()}` === clientKey)
      let nextClients = clients
      if (!client) {
        client = { id: String(meetingRow.client_id || `local-${Date.now()}`), name: form.clientName, email: form.clientEmail }
        nextClients = [client, ...clients]
        setClients(nextClients)
      }
      const persisted: Meeting = {
        id: String(meetingRow.id),
        clientId: meetingRow.client_id ? String(meetingRow.client_id) : null,
        title: String(meetingRow.title || form.title),
        clientName: client.name,
        clientEmail: client.email,
        date: String(meetingRow.meeting_date || form.date),
        time: toTime(String(meetingRow.meeting_time || form.time)),
        duration: Number(meetingRow.duration_minutes || Number(form.duration)),
        roomName: String(meetingRow.room_name || localMeeting.roomName),
        status: (meetingRow.status || 'scheduled') as MeetingStatus,
        agenda: String(meetingRow.description || form.agenda),
        source: 'database',
      }

      setMeetings((current) => {
        const next = [persisted, ...current]
        saveLocal(next, nextClients)
        return next
      })
      notifyMeetingsUpdated()
      setSelected(persisted)
    } catch {
      setMeetings((current) => {
        const next = [localMeeting, ...current]
        saveLocal(next, clients)
        return next
      })
      setSelected(localMeeting)
      setNotice('Meeting saved locally. It will sync when the database is available.')
    }

    if (form.clientEmail) {
      const meetingDateTime = `${fmtDate(form.date)}${form.time ? ` at ${form.time}` : ''}`
      const link = meetingLink(localMeeting.roomName)
      const customMessage = form.inviteMessage.trim()
      const body = [
        `Hello ${form.clientName || 'there'},`,
        '',
        customMessage || 'Your video consultation has been scheduled.',
        '',
        `Meeting: ${form.title}`,
        `When: ${meetingDateTime}`,
        `Join link: ${link}`,
        '',
        'You can join the video room directly from this link. A MyMcKenzieCS account is not required for the call.',
      ].join('\n')
      window.dispatchEvent(new CustomEvent('mymckenzie-inbox-compose', {
        detail: {
          to: form.clientEmail,
          subject: `Video meeting invite: ${form.title}`,
          body,
        },
      }))
      setNotice('Meeting scheduled and invite drafted in Inbox.')
    } else {
      setNotice('Meeting scheduled.')
    }

    setForm({title:'',clientName:'',clientEmail:'',date:'',time:'',duration:'60',agenda:'',inviteMessage:''})
    setShowForm(false)
    setTimeout(()=>setNotice(''),3000)
  },[clients,form])

  const updateStatus = useCallback(async (meeting: Meeting, status: MeetingStatus) => {
    setMeetings((current) => {
      const next = current.map((entry) => entry.id === meeting.id ? { ...entry, status } : entry)
      saveLocal(next, clients)
      return next
    })
    setSelected((current) => current?.id === meeting.id ? { ...current, status } : current)

    if (meeting.source === 'local') return
    try {
      await fetch('/api/business/meetings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: meeting.id, status }),
      })
      notifyMeetingsUpdated()
    } catch {
      setNotice('Status updated locally. Database sync failed.')
      setTimeout(() => setNotice(''), 3000)
    }
  }, [clients])

  const join=(m:Meeting)=>{
    void updateStatus(m, 'in_progress')
    setInCall(true)
    setCallExpanded(true)
  }
  const leave=()=>{setInCall(false);setSession(s=>s+1)}
  const endMeeting=(m:Meeting)=>{
    setInCall(false);setSession(s=>s+1)
    void updateStatus(m, 'completed')
  }
  const copyLink=async(m:Meeting)=>{
    const link=meetingLink(m.roomName)
    try{await navigator.clipboard.writeText(link)}catch{void 0}
    setCopied(true);setTimeout(()=>setCopied(false),2000)
  }

  return (
    <div className={`${styles.page} ${inCall && callExpanded ? styles.pageFullscreen : ''}`}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Client Meetings</h2>
          <p className={styles.sidebarSub}>Schedule and host client video consultations</p>
          <p className={`${styles.dataModePill} ${dataMode === 'database' ? styles.dataModeDatabase : styles.dataModeLocal}`}>
            {dataMode === 'database' ? 'Database connected' : 'Local fallback mode'}
          </p>
          {dataMode === 'local' && (
            <button type="button" className={styles.retrySyncBtn} onClick={() => void retryDatabaseSync()}>
              Retry database sync
            </button>
          )}
          <button type="button" className={styles.newMeetingBtn} onClick={()=>setShowForm(s=>!s)}>
            <Plus size={15}/>{showForm?'Cancel':'New Meeting'}
          </button>
        </div>

        {showForm&&(
          <form className={styles.formPanel} onSubmit={handleSchedule}>
            <p className={styles.formTitle}>Schedule a meeting</p>
            <div className={styles.formField}><label className={styles.formLabel}>Client Name *</label><input className={styles.formInput} value={form.clientName} onChange={e=>upd('clientName',e.target.value)} placeholder="Full name"/></div>
            <div className={styles.formField}><label className={styles.formLabel}>Client Email</label><input className={styles.formInput} type="email" value={form.clientEmail} onChange={e=>upd('clientEmail',e.target.value)} placeholder="client@email.com"/></div>
            <div className={styles.formField}><label className={styles.formLabel}>Meeting Title *</label><input className={styles.formInput} value={form.title} onChange={e=>upd('title',e.target.value)} placeholder="e.g. Initial Consultation"/></div>
            <div className={styles.formRow}>
              <div className={styles.formField}><label className={styles.formLabel}>Date *</label><input className={styles.formInput} type="date" value={form.date} onChange={e=>upd('date',e.target.value)}/></div>
              <div className={styles.formField}><label className={styles.formLabel}>Time *</label><input className={styles.formInput} type="time" value={form.time} onChange={e=>upd('time',e.target.value)}/></div>
            </div>
            <div className={styles.formField}><label className={styles.formLabel}>Duration</label>
              <select className={styles.formSelect} value={form.duration} onChange={e=>upd('duration',e.target.value)}>
                <option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option><option value="90">90 min</option>
              </select>
            </div>
            <div className={styles.formField}><label className={styles.formLabel}>Agenda</label><textarea className={styles.formTextarea} value={form.agenda} onChange={e=>upd('agenda',e.target.value)} placeholder="Topics to cover…"/></div>
            <div className={styles.formField}><label className={styles.formLabel}>Invite message (optional)</label><textarea className={styles.formTextarea} value={form.inviteMessage} onChange={e=>upd('inviteMessage',e.target.value)} placeholder="Add a short personal note for the invite email…"/></div>
            {err&&<p className={styles.formAlert}>{err}</p>}
            {notice&&<p className={styles.formNotice}>{notice}</p>}
            <button type="submit" className={styles.formSubmitBtn}><Plus size={14}/>Schedule Meeting</button>
          </form>
        )}

        {!showForm&&(
          <>
            <div className={styles.sidebarTabs}>
              <button type="button" className={`${styles.sidebarTab} ${tab==='upcoming'?styles.sidebarTabActive:''}`} onClick={()=>setTab('upcoming')}>Upcoming ({upcomingList.length})</button>
              <button type="button" className={`${styles.sidebarTab} ${tab==='past'?styles.sidebarTabActive:''}`} onClick={()=>setTab('past')}>Past ({pastList.length})</button>
            </div>
            <div className={styles.meetingList}>
              {loading&&<div className={styles.emptyList}><p>Loading meetings...</p></div>}
              {!loading&&listed.length===0&&<div className={styles.emptyList}><Video size={28}/><p>No meetings</p></div>}
              {listed.map(m=>(
                <div key={m.id} role="button" tabIndex={0} className={`${styles.meetingItem} ${selected?.id===m.id?styles.meetingItemActive:''}`} onClick={()=>{setSelected(m);setInCall(false)}} onKeyDown={e=>{if(e.key==='Enter'){setSelected(m);setInCall(false)}}}>
                  <div className={styles.meetingItemTop}><span className={styles.meetingItemClient}>{m.clientName}</span><span className={`${styles.statusBadge} ${S_CLS[m.status]}`}>{S_LBL[m.status]}</span></div>
                  <p className={styles.meetingItemTitle}>{m.title}</p>
                  <div className={styles.meetingItemMeta}><span>{fmtDate(m.date)}</span><span>{m.time}</span><span>{m.duration}min</span></div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={styles.main}>
        {!selected?(
          <div className={styles.emptyRoom}><Video size={52}/><p className={styles.emptyRoomTitle}>No meeting selected</p><p className={styles.emptyRoomSub}>Select a meeting or schedule a new one</p></div>
        ):(
          <>
          <div className={styles.meetingDetail}>
            <div className={styles.detailHeader}>
              <div>
                <h2 className={styles.detailTitle}>{selected.title}</h2>
                <div className={styles.detailMetaRow}>
                  <span className={styles.detailMetaItem}><User size={13}/><strong>{selected.clientName}</strong></span>
                  {selected.clientEmail&&<span className={styles.detailMetaItem}><Mail size={13}/>{selected.clientEmail}</span>}
                  <span className={styles.detailMetaItem}><Calendar size={13}/>{fmtDate(selected.date)}</span>
                  <span className={styles.detailMetaItem}><Clock size={13}/>{selected.time} · {selected.duration}min</span>
                  <span className={`${styles.statusBadge} ${S_CLS[selected.status]}`}>{S_LBL[selected.status]}</span>
                </div>
              </div>
              <div className={styles.detailActions}>
                {(selected.status==='scheduled'||selected.status==='in_progress')&&(
                  <button type="button" className={styles.joinBtn} onClick={()=>join(selected)}><Play size={15}/>Join Room</button>
                )}
                <button type="button" className={styles.copyBtn} onClick={()=>copyLink(selected)}>
                  {copied?<CheckCircle2 size={14}/>:<Copy size={14}/>}{copied?'Copied':'Copy Link'}
                </button>
                {selected.status==='scheduled'&&<button type="button" className={styles.ghostBtn} onClick={()=>void updateStatus(selected, 'cancelled')}><XCircle size={14}/>Cancel</button>}
                {selected.status==='in_progress'&&<button type="button" className={styles.ghostBtn} onClick={()=>endMeeting(selected)}><CheckCircle2 size={14}/>Mark Done</button>}
              </div>
            </div>
            <div className={styles.detailBody}>
              {selected.agenda&&<div className={styles.detailSection}><span className={styles.detailSectionLabel}>Agenda</span><p className={styles.detailSectionText}>{selected.agenda}</p></div>}
              <div className={styles.detailSection}>
                <span className={styles.detailSectionLabel}>Room Link</span>
                <div className={styles.inviteStrip}><span>{meetingLink(selected.roomName)}</span></div>
              </div>
              <div className={styles.detailSection}>
                <span className={styles.detailSectionLabel}>Room Name</span>
                <div className={styles.tagRow}><span className={styles.tag}>{selected.roomName}</span></div>
              </div>
              {notice&&<p className={styles.formNotice}>{notice}</p>}
            </div>
          </div>

          </>
        )}
      </div>
      {inCall&&selected&&(
        <div
          className={`${styles.callModalBackdrop} ${callExpanded ? styles.callModalBackdropExpanded : styles.callModalBackdropCompact}`}
          onClick={(e)=>{if(e.target===e.currentTarget)leave()}}
        >
          <div className={`${styles.callModal} ${callExpanded ? styles.callModalExpanded : styles.callModalCompact}`}>
            <div className={styles.callModalHeader}>
              <div>
                <p className={styles.callModalTitle}>{selected.title}</p>
                <span className={styles.callModalMeta}>{selected.clientName} · {selected.roomName}</span>
              </div>
              <div className={styles.callModalActions}>
                <button
                  type="button"
                  className={styles.callModalToggleBtn}
                  onClick={()=>setCallExpanded((current)=>!current)}
                  aria-label={callExpanded ? 'Collapse call window' : 'Expand call window'}
                  title={callExpanded ? 'Collapse' : 'Expand'}
                >
                  {callExpanded ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}
                  {callExpanded ? 'Collapse' : 'Expand'}
                </button>
                <button type="button" className={styles.callModalCloseBtn} onClick={leave}><XCircle size={14}/>Leave</button>
              </div>
            </div>
            <div className={styles.callModalBody}>
              <div className={styles.callModalWorkspace}>
                <WebRtcMeeting
                  key={`${selected.id}-${session}`}
                  className={styles.callModalMeetingShell}
                  roomName={selected.roomName}
                  displayName="Business User"
                  onLeave={leave}
                  videoGridClassName={styles.callModalJitsiWrap}
                  primaryButtonClassName={styles.callModalGhostBtn}
                  secondaryButtonClassName={styles.callModalGhostBtn}
                  footerAction={(
                    <button type="button" className={styles.callModalEndBtn} onClick={() => endMeeting(selected)}>
                      <CheckCircle2 size={14} />
                      End &amp; Mark Done
                    </button>
                  )}
                />

                <aside className={styles.callNotesPanel} aria-label="Meeting notes">
                  <div className={styles.callNotesHeader}>
                    <div>
                      <h3>Meeting Notes</h3>
                      <p>Save running notes straight into My Notes.</p>
                    </div>
                  </div>

                  <label className={styles.callNotesField}>
                    <span className={styles.callNotesLabel}>Notes</span>
                    <textarea
                      className={styles.callNotesTextarea}
                      value={activeNotes}
                      onChange={(event) => updateMeetingNotes(event.target.value)}
                      placeholder="Capture action items, key points, or follow-up tasks..."
                    />
                  </label>

                  <div className={styles.callNotesFooter}>
                    <div className={styles.callNotesMeta}>
                      <span className={styles.callNotesLabel}>Will save as</span>
                      <p>{buildMeetingNoteTitle(selected)}</p>
                    </div>
                    <button
                      type="button"
                      className={styles.callTranscriptButton}
                      onClick={() => void saveMeetingNotesToNotesPage()}
                      disabled={savingMeetingNote || !activeNotes.trim()}
                    >
                      {savingMeetingNote ? 'Saving...' : 'Save notes'}
                    </button>
                  </div>
                  {meetingNoteStatus && <p className={styles.callNotesStatus}>{meetingNoteStatus}</p>}
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}
      {noteSavedPopup && (
        <div className={styles.callNotePopupBackdrop} role="status" aria-live="polite">
          <div className={styles.callNotePopup}>
            <p className={styles.callNotePopupTitle}>Notes saved</p>
            <p className={styles.callNotePopupBody}>{noteSavedPopup}</p>
            <div className={styles.callNotePopupActions}>
              <Link href={notesPageHref} className={styles.callNotePopupButton} onClick={() => setNoteSavedPopup(null)}>
                Open Notes Page
              </Link>
              <button type="button" className={styles.callNotePopupSecondaryButton} onClick={() => setNoteSavedPopup(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
