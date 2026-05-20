'use client'
import { useState, useCallback, useEffect } from 'react'
import { Video, Plus, Calendar, Clock, User, Mail, Copy, CheckCircle2, Play, XCircle } from 'lucide-react'
import WebRtcMeeting from '@/components/video/WebRtcMeeting'
import styles from './videocall.module.css'

type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
interface Meeting { id:string; title:string; clientName:string; clientEmail:string; date:string; time:string; duration:number; roomName:string; status:MeetingStatus; agenda?:string }

function makeRoom(title:string,id:string){return `mymckenziecs-${title.toLowerCase().replace(/[^a-z0-9]/g,'-').slice(0,28)}-${id}`}
function fmtDate(d:string){return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}

const MOCK:Meeting[]=[
  {id:'1',title:'Initial Consultation',clientName:'James Okafor',clientEmail:'james@email.com',date:'2026-05-12',time:'10:00',duration:60,roomName:'mymckenziecs-initial-consultation-1',status:'scheduled',agenda:'Housing disrepair and Section 21 notice discussion.'},
  {id:'2',title:'Case Review',clientName:'Priya Sharma',clientEmail:'priya@gmail.com',date:'2026-05-10',time:'14:00',duration:45,roomName:'mymckenziecs-case-review-2',status:'in_progress',agenda:'ET1 preparation and whistleblowing detriment claim.'},
  {id:'3',title:'Follow-up',clientName:'David Clarke',clientEmail:'d.clarke@outlook.com',date:'2026-05-08',time:'11:00',duration:30,roomName:'mymckenziecs-follow-up-3',status:'completed'},
]
const S_CLS:Record<MeetingStatus,string>={scheduled:styles.statusScheduled,in_progress:styles.statusLive,completed:styles.statusDone,cancelled:styles.statusCancelled}
const S_LBL:Record<MeetingStatus,string>={scheduled:'Scheduled',in_progress:'● Live',completed:'Done',cancelled:'Cancelled'}

export function VideoCallPanel({
  userId,
  meetingPreset,
  onMeetingPresetConsumed,
}: {
  userId: string
  meetingPreset?: { clientName?: string; clientEmail?: string; context?: string } | null
  onMeetingPresetConsumed?: () => void
}){
  const [meetings,setMeetings]=useState<Meeting[]>(MOCK)
  const [selected,setSelected]=useState<Meeting|null>(MOCK[0])
  const [tab,setTab]=useState<'upcoming'|'past'>('upcoming')
  const [showForm,setShowForm]=useState(false)
  const [inCall,setInCall]=useState(false)
  const [session,setSession]=useState(0)
  const [copied,setCopied]=useState(false)
  const [notice,setNotice]=useState('')
  const [err,setErr]=useState('')
  const [form,setForm]=useState({title:'',clientName:'',clientEmail:'',date:'',time:'',duration:'60',agenda:'',inviteMessage:''})

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
  const pastList=meetings.filter(m=>m.status==='completed'||m.status==='cancelled')
  const listed=tab==='upcoming'?upcomingList:pastList

  const upd=(k:string,v:string)=>setForm(f=>({...f,[k]:v}))

  const handleSchedule=useCallback((e:React.FormEvent)=>{
    e.preventDefault()
    if(!form.title||!form.clientName||!form.date||!form.time){setErr('Fill in all required fields.');return}
    setErr('')
    const id=String(Date.now())
    const m:Meeting={id,title:form.title,clientName:form.clientName,clientEmail:form.clientEmail,date:form.date,time:form.time,duration:Number(form.duration),roomName:makeRoom(form.title,id),status:'scheduled',agenda:form.agenda}
    setMeetings(p=>[m,...p])
    setSelected(m)
    if (form.clientEmail) {
      const meetingDateTime = `${fmtDate(form.date)}${form.time ? ` at ${form.time}` : ''}`
      const link = `${window.location.origin}/join/${m.roomName}`
      const customMessage = form.inviteMessage.trim()
      const body = [
        `Hello ${form.clientName || 'there'},`,
        '',
        customMessage || 'Your video consultation has been scheduled.',
        '',
        `Meeting: ${form.title}`,
        `When: ${meetingDateTime}`,
        `Join link: ${link}`,
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
  },[form])

  const join=(m:Meeting)=>{
    setMeetings(p=>p.map(x=>x.id===m.id?{...x,status:'in_progress'}:x))
    setSelected(p=>p?.id===m.id?{...p,status:'in_progress'}:p)
    setInCall(true)
  }
  const leave=()=>{setInCall(false);setSession(s=>s+1)}
  const endMeeting=(m:Meeting)=>{
    setInCall(false);setSession(s=>s+1)
    setMeetings(p=>p.map(x=>x.id===m.id?{...x,status:'completed'}:x))
    setSelected(p=>p?.id===m.id?{...p,status:'completed'}:p)
  }
  const copyLink=async(m:Meeting)=>{
    const link=`${window.location.origin}/join/${m.roomName}`
    try{await navigator.clipboard.writeText(link)}catch{void 0}
    setCopied(true);setTimeout(()=>setCopied(false),2000)
  }

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Client Meetings</h2>
          <p className={styles.sidebarSub}>Schedule and host client video consultations</p>
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
              {listed.length===0&&<div className={styles.emptyList}><Video size={28}/><p>No meetings</p></div>}
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
                {selected.status==='scheduled'&&<button type="button" className={styles.ghostBtn} onClick={()=>{setMeetings(p=>p.map(x=>x.id===selected.id?{...x,status:'cancelled'}:x));setSelected(p=>p?{...p,status:'cancelled'}:p)}}><XCircle size={14}/>Cancel</button>}
                {selected.status==='in_progress'&&<button type="button" className={styles.ghostBtn} onClick={()=>endMeeting(selected)}><CheckCircle2 size={14}/>Mark Done</button>}
              </div>
            </div>
            <div className={styles.detailBody}>
              {selected.agenda&&<div className={styles.detailSection}><span className={styles.detailSectionLabel}>Agenda</span><p className={styles.detailSectionText}>{selected.agenda}</p></div>}
              <div className={styles.detailSection}>
                <span className={styles.detailSectionLabel}>Room Link</span>
                <div className={styles.inviteStrip}><span>{typeof window!=='undefined'?`${window.location.origin}/join/${selected.roomName}`:selected.roomName}</span></div>
              </div>
              <div className={styles.detailSection}>
                <span className={styles.detailSectionLabel}>Room Name</span>
                <div className={styles.tagRow}><span className={styles.tag}>{selected.roomName}</span></div>
              </div>
              {notice&&<p className={styles.formNotice}>{notice}</p>}
            </div>
          </div>

          {/* Call modal */}
          {inCall&&selected&&(
            <div className={styles.callModalBackdrop} onClick={(e)=>{if(e.target===e.currentTarget)leave()}}>
              <div className={styles.callModal}>
                <div className={styles.callModalHeader}>
                  <div>
                    <p className={styles.callModalTitle}>{selected.title}</p>
                    <span className={styles.callModalMeta}>{selected.clientName} · {selected.roomName}</span>
                  </div>
                  <button type="button" className={styles.callModalCloseBtn} onClick={leave}><XCircle size={14}/>Leave</button>
                </div>
                <div className={styles.callModalBody}>
                  <WebRtcMeeting key={`${selected.id}-${session}`} roomName={selected.roomName} displayName="Business User" onLeave={leave} videoGridClassName={styles.callModalJitsiWrap} primaryButtonClassName={styles.callModalGhostBtn} secondaryButtonClassName={styles.callModalGhostBtn}/>
                </div>
                <div className={styles.callModalFooter}>
                  <button type="button" className={styles.callModalGhostBtn} onClick={leave}><XCircle size={14}/>Leave call</button>
                  <button type="button" className={styles.callModalEndBtn} onClick={()=>endMeeting(selected)}><CheckCircle2 size={14}/>End &amp; Mark Done</button>
                </div>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}
