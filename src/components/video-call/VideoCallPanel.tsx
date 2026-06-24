'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Video, Plus, Calendar, Clock, User, Mail, Copy, CheckCircle2, Play, XCircle } from 'lucide-react'
import WebRtcMeeting from '@/components/video/WebRtcMeeting'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import styles from './videocall.module.css'
import { BUSINESS_MEETINGS_UPDATED_EVENT } from '@/lib/events/business-events'
import WorkspaceLoadingState from '@/components/business/WorkspaceLoadingState'

type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
interface Meeting { id:string; clientId?: string | null; title:string; clientName:string; clientEmail:string; date:string; time:string; duration:number; roomName:string; status:MeetingStatus; agenda?:string; source?: 'database' | 'local' }
interface ClientContact { id: string; name: string; email: string }
interface MeetingRow {
  id: unknown
  client_id?: unknown
  title?: unknown
  client_name?: unknown
  client_email?: unknown
  meeting_date?: unknown
  meeting_time?: unknown
  duration_minutes?: unknown
  room_name?: unknown
  status?: unknown
  description?: unknown
}
interface ClientRow {
  id: unknown
  name?: unknown
  email?: unknown
}

function makeRoom(title:string,id:string){return `mymckenziecs-${title.toLowerCase().replace(/[^a-z0-9]/g,'-').slice(0,28)}-${id}`}
function fmtDate(d:string){return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
function meetingLink(roomName:string){
  if (typeof window === 'undefined') return `/video-call?room=${encodeURIComponent(roomName)}`
  const url = new URL('/video-call', window.location.origin)
  url.searchParams.set('room', roomName)
  return url.toString()
}

const LOCAL_MEETINGS_KEY='mymckenzie-business-client-meetings'
const LOCAL_CLIENTS_KEY='mymckenzie-business-meeting-clients'
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

function sendMeetingStatusBeacon(meeting: Meeting, status: MeetingStatus) {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false
  try {
    const payload = new Blob([JSON.stringify({ id: meeting.id, status, skipAlert: true })], {
      type: 'application/json',
    })
    return navigator.sendBeacon('/api/business/meetings', payload)
  } catch {
    return false
  }
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

function mapRowsToMeetings(rows: MeetingRow[], clients: ClientContact[]): Meeting[] {
  const clientsById = new Map(clients.map((client) => [client.id, client]))
  return rows.map((row) => {
    const client = row.client_id ? clientsById.get(String(row.client_id)) : undefined
    return {
      id: String(row.id),
      clientId: row.client_id ? String(row.client_id) : null,
      title: String(row.title || 'Client consultation'),
      clientName: String(row.client_name || client?.name || 'Client'),
      clientEmail: String(row.client_email || client?.email || ''),
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
  userId: _userId,
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
  const [copied,setCopied]=useState(false)
  const [notice,setNotice]=useState('')
  const [err,setErr]=useState('')
  const [loading,setLoading]=useState(true)
  const [dataMode,setDataMode]=useState<'database'|'local'>('database')
  const [form,setForm]=useState({title:'',clientName:'',clientEmail:'',date:'',time:'',duration:'60',agenda:'',inviteMessage:''})
  const selectedRef = useRef<Meeting | null>(null)
  const inCallRef = useRef(false)
  const exitCallRef = useRef(false)
  const statusUpdateAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  useEffect(() => {
    inCallRef.current = inCall
  }, [inCall])

  useEffect(() => {
    if (!inCall) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [inCall])

  const loadMeetings = useCallback(async () => {
    let mounted = true
    const run = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/business/meetings', { credentials: 'include', cache: 'no-store' })
        if (!response.ok) throw new Error('Failed')
        const data = await response.json()
        const nextClients: ClientContact[] = Array.isArray(data.clients)
          ? (data.clients as ClientRow[]).map((row) => ({ id: String(row.id), name: String(row.name || 'Client'), email: String(row.email || '') }))
          : []
        const nextMeetings = Array.isArray(data.meetings) ? mapRowsToMeetings(data.meetings as MeetingRow[], nextClients) : []
        if (!mounted) return
        setClients(nextClients)
        setMeetings(nextMeetings)
        setDataMode('database')
        setSelected((current) => {
          if (!current) return null
          return nextMeetings.find((meeting) => meeting.id === current.id) || null
        })
        saveLocal(nextMeetings, nextClients)
      } catch {
        const local = loadLocal()
        if (!mounted) return
        setClients(local.clients)
        setMeetings(local.meetings)
        setSelected((current) => {
          if (!current) return null
          return local.meetings.find((meeting) => meeting.id === current.id) || null
        })
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
        clientName: String(meetingRow.client_name || client.name),
        clientEmail: String(meetingRow.client_email || client.email),
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

  const updateStatus = useCallback(async (meeting: Meeting, status: MeetingStatus, options?: { keepalive?: boolean; quiet?: boolean; signal?: AbortSignal }) => {
    setMeetings((current) => {
      const next = current.map((entry) => entry.id === meeting.id ? { ...entry, status } : entry)
      saveLocal(next, clients)
      return next
    })
    setSelected((current) => current?.id === meeting.id ? { ...current, status } : current)

    if (meeting.source === 'local') return
    if (options?.keepalive && sendMeetingStatusBeacon(meeting, status)) {
      notifyMeetingsUpdated()
      return
    }
    try {
      await fetch('/api/business/meetings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        keepalive: Boolean(options?.keepalive),
        signal: options?.signal,
        body: JSON.stringify({ id: meeting.id, status, skipAlert: Boolean(options?.keepalive) }),
      })
      notifyMeetingsUpdated()
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return
      if (!options?.quiet) {
        setNotice('Status updated locally. Database sync failed.')
        setTimeout(() => setNotice(''), 3000)
      }
    }
  }, [clients])

  const join=(m:Meeting)=>{
    exitCallRef.current = false
    statusUpdateAbortRef.current?.abort()
    const controller = new AbortController()
    statusUpdateAbortRef.current = controller
    void updateStatus(m, 'in_progress', { signal: controller.signal }).finally(() => {
      if (statusUpdateAbortRef.current === controller) {
        statusUpdateAbortRef.current = null
      }
    })
    selectedRef.current = { ...m, status: 'in_progress' }
    setInCall(true)
  }
  const closeCall = useCallback(async (options?: { keepalive?: boolean }) => {
    if (exitCallRef.current) return
    exitCallRef.current = true
    statusUpdateAbortRef.current?.abort()
    statusUpdateAbortRef.current = null
    const meeting = selectedRef.current
    setInCall(false)
    setSession((s) => s + 1)
    if (!meeting || meeting.status !== 'in_progress') return
    await updateStatus(meeting, 'completed', { keepalive: Boolean(options?.keepalive), quiet: true })
  }, [updateStatus])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_OUT' || !session) && inCallRef.current && selectedRef.current?.status === 'in_progress' && !exitCallRef.current) {
        void closeCall({ keepalive: true })
      }
    })
    return () => subscription.unsubscribe()
  }, [closeCall])

  const endMeeting=(m:Meeting)=>{
    if (inCallRef.current && selectedRef.current?.id === m.id) {
      void closeCall()
      return
    }
    void updateStatus(m, 'completed')
  }
  const copyLink=async(m:Meeting)=>{
    const link=meetingLink(m.roomName)
    try{await navigator.clipboard.writeText(link)}catch{void 0}
    setCopied(true);setTimeout(()=>setCopied(false),2000)
  }

  useEffect(() => {
    const handlePageExit = () => {
      if (!inCallRef.current || exitCallRef.current) return
      void closeCall({ keepalive: true })
    }
    window.addEventListener('pagehide', handlePageExit)
    window.addEventListener('beforeunload', handlePageExit)
    return () => {
      window.removeEventListener('pagehide', handlePageExit)
      window.removeEventListener('beforeunload', handlePageExit)
    }
  }, [closeCall])

  useEffect(() => {
    return () => {
      const meeting = selectedRef.current
      if (!inCallRef.current || exitCallRef.current || !meeting || meeting.status !== 'in_progress') return
      statusUpdateAbortRef.current?.abort()
      statusUpdateAbortRef.current = null
      void updateStatus(meeting, 'completed', { keepalive: true, quiet: true })
    }
  }, [updateStatus])

  return (
    <div className={`${styles.page} ${inCall ? styles.pageFullscreen : ''}`}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Client Meetings</h2>
          <p className={styles.sidebarSub}>Schedule and host client video consultations</p>
          <p className={`${styles.dataModePill} ${dataMode === 'database' ? styles.dataModeDatabase : styles.dataModeLocal}`}>
            {dataMode === 'database' ? 'Database connected' : 'Local fallback mode'}
          </p>
        </div>

        <div className={styles.sidebarActions}>
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
              <button type="button" className={`${styles.sidebarTab} ${tab==='upcoming'?styles.sidebarTabActive:''}`} onClick={()=>{setTab('upcoming');setSelected(null);setInCall(false)}}>Upcoming ({upcomingList.length})</button>
              <button type="button" className={`${styles.sidebarTab} ${tab==='past'?styles.sidebarTabActive:''}`} onClick={()=>{setTab('past');setSelected(null);setInCall(false)}}>Past ({pastList.length})</button>
            </div>
            <div className={styles.meetingList}>
              {loading&&<WorkspaceLoadingState variant="panel" label="Loading meetings..." className={styles.emptyList} />}
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
        <div className={styles.callModalBackdrop}>
          <div className={styles.callModal}>
            <div className={styles.callModalHeader}>
              <div className={styles.callModalBrandBlock}>
                <span className={styles.callModalBrandMark}>M</span>
                <div>
                  <p className={styles.callModalEyebrow}>Professional video room</p>
                  <p className={styles.callModalTitle}>{selected.title}</p>
                  <span className={styles.callModalMeta}>{selected.clientName} · {selected.roomName}</span>
                </div>
              </div>
              <div className={styles.callModalActions}>
                <button type="button" className={styles.callModalCloseBtn} onClick={() => void closeCall()}><XCircle size={14}/>Leave</button>
              </div>
            </div>
            <div className={styles.callModalBody}>
              <section className={styles.callMeetingStage}>
                <WebRtcMeeting
                  key={`${selected.id}-${session}`}
                  className={styles.callModalMeetingShell}
                  roomName={selected.roomName}
                  displayName="Business User"
                  onLeave={() => void closeCall()}
                  videoGridClassName={styles.callModalJitsiWrap}
                  primaryButtonClassName={styles.callModalGhostBtn}
                  secondaryButtonClassName={styles.callModalGhostBtn}
                  footerAction={(
                    <button type="button" className={styles.callModalEndBtn} onClick={() => void closeCall()}>
                      <CheckCircle2 size={14} />
                      End &amp; Mark Done
                    </button>
                  )}
                />
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
