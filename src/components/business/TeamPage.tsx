'use client'
import { useState, useEffect } from 'react'
import { Users, Plus, Mail, Shield, Edit2, Trash2, CheckCircle2, XCircle, UserRound, Crown, Eye, PenLine, Loader2, UserPlus } from 'lucide-react'
import styles from './team.module.css'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'

type Role = 'owner' | 'solicitor' | 'paralegal' | 'admin' | 'viewer'
type Status = 'active' | 'invited' | 'suspended'

interface TeamMember {
  id: string
  name: string
  email: string
  role: Role
  status: Status
  matters: number
  joinedAt: string
  avatarInitials: string
}

function makeInitials(email: string) {
  return email.split('@')[0].replace(/[._-]/g, ' ').split(' ')
    .slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?'
}

const ROLE_ICON: Record<Role, React.ElementType> = { owner: Crown, solicitor: Shield, paralegal: PenLine, admin: Edit2, viewer: Eye }
const ROLE_CLS: Record<Role, string> = { owner: 'roleOwner', solicitor: 'roleSolicitor', paralegal: 'roleParalegal', admin: 'roleAdmin', viewer: 'roleViewer' }
const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', solicitor: 'Solicitor/McKenzie Friend', paralegal: 'Paralegal', admin: 'Admin', viewer: 'Viewer' }
const STATUS_CLS: Record<Status, string> = { active: 'statusActive', invited: 'statusInvited', suspended: 'statusSuspended' }
const STATUS_LABEL: Record<Status, string> = { active: 'Active', invited: 'Invited', suspended: 'Suspended' }

const PERMISSIONS: Record<Role, string[]> = {
  owner: ['Full access', 'Billing', 'Team management', 'All client matters', 'All documents', 'Settings'],
  solicitor: ['All client matters', 'Documents', 'Notes', 'Calendar', 'Video calls', 'Leads'],
  paralegal: ['Assigned client matters', 'Documents (assigned)', 'Notes', 'Calendar'],
  admin: ['Billing', 'Settings', 'Team management', 'View all matters'],
  viewer: ['View assigned matters', 'View documents (read-only)'],
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [selected, setSelected] = useState<TeamMember | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'viewer' as Role })
  const [notice, setNotice] = useState('')
  const [noticeError, setNoticeError] = useState(false)
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => { loadTeam() }, [])

  async function loadTeam() {
    setLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const self: TeamMember = {
        id: user.id, name: user.email?.split('@')[0] || 'You', email: user.email || '',
        role: 'owner', status: 'active', matters: 0,
        joinedAt: new Date(user.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
        avatarInitials: makeInitials(user.email || ''),
      }
      const { data } = await supabase.from('team_invitations').select('*')
        .eq('inviter_id', user.id).order('created_at', { ascending: false })
      const mapped: TeamMember[] = (data || []).map((row: Record<string, unknown>) => ({
        id: String(row.id), name: String(row.invited_email).split('@')[0],
        email: String(row.invited_email), role: row.role as Role,
        status: (row.status === 'accepted' ? 'active' : row.status === 'pending' ? 'invited' : 'suspended') as Status,
        matters: 0,
        joinedAt: new Date(String(row.created_at)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
        avatarInitials: makeInitials(String(row.invited_email)),
      }))
      const all = [self, ...mapped]
      setMembers(all)
      setSelected(all[0])
    } catch { setMembers([]) } finally { setLoading(false) }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteForm.email) return
    setSending(true); setNotice(''); setNoticeError(false)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data: inv, error: invErr } = await supabase.from('team_invitations')
        .insert({ inviter_id: user.id, inviter_email: user.email,
          invited_email: inviteForm.email, role: inviteForm.role, status: 'pending' })
        .select().single()
      if (invErr) throw invErr
      await supabase.from('inbox_messages').insert({
        sender_id: user.id, sender_email: user.email,
        sender_name: user.email?.split('@')[0] || 'McKenzie Friend',
        recipient_email: inviteForm.email,
        subject: `Team invitation from ${user.email}`,
        content: `You have been invited to join a team as ${ROLE_LABEL[inviteForm.role]}. Log in to your MyMcKenzieCS dashboard to accept or decline this invitation.`,
        type: 'invitation',
        metadata: { invitation_id: (inv as Record<string, unknown>)?.id, role: inviteForm.role, inviter_email: user.email },
      })
      const newMember: TeamMember = {
        id: String((inv as Record<string, unknown>)?.id || Date.now()),
        name: inviteForm.email.split('@')[0], email: inviteForm.email,
        role: inviteForm.role, status: 'invited', matters: 0, joinedAt: '—',
        avatarInitials: makeInitials(inviteForm.email),
      }
      setMembers(p => [...p, newMember])
      setSelected(newMember)
      setInviteForm({ email: '', role: 'viewer' })
      setShowInvite(false)
      setNotice('Invitation sent to ' + inviteForm.email)
      setTimeout(() => setNotice(''), 4000)
    } catch (err: unknown) {
      setNoticeError(true)
      const msg = err instanceof Error ? err.message : 'Failed to send'
      setNotice(msg.includes('does not exist') ? 'DB table not set up yet — see code comments for SQL.' : msg)
      setTimeout(() => { setNotice(''); setNoticeError(false) }, 5000)
    } finally { setSending(false) }
  }

  const listed = members.filter(m => filter === 'all' || m.status === filter)

  const removeMember = (id: string) => {
    setMembers(p => p.filter(m => m.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const toggleSuspend = (m: TeamMember) => {
    const next: Status = m.status === 'suspended' ? 'active' : 'suspended'
    setMembers(p => p.map(x => x.id === m.id ? { ...x, status: next } : x))
    setSelected(p => p?.id === m.id ? { ...p, status: next } : p)
  }

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Team</h2>
          <p className={styles.sidebarSub}>{members.filter(m=>m.status!=='suspended').length} members · manage roles and access</p>
          <button type="button" className={styles.inviteBtn} onClick={() => setShowInvite(s => !s)}>
            <Plus size={14}/>{showInvite ? 'Cancel' : 'Invite by Email'}
          </button>
        </div>

        {showInvite && (
          <form className={styles.formPanel} onSubmit={handleInvite}>
            <p className={styles.formTitle}>Invite a team member</p>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Email Address *</label>
              <input className={styles.formInput} type="email" required value={inviteForm.email} onChange={e => setInviteForm(f=>({...f,email:e.target.value}))} placeholder="colleague@email.com"/>
            </div>
            <div className={styles.formField}><label className={styles.formLabel}>Role</label>
              <select className={styles.formSelect} value={inviteForm.role} onChange={e => setInviteForm(f=>({...f,role:e.target.value as Role}))}>
                {(Object.keys(ROLE_LABEL) as Role[]).filter(r=>r!=='owner').map(r=><option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            {notice && <p className={noticeError ? styles.formNoticeError : styles.formNotice}>{notice}</p>}
            <button type="submit" className={styles.formSubmitBtn} disabled={sending}>
              {sending ? <Loader2 size={13} className={styles.spin}/> : <Mail size={13}/>}
              {sending ? 'Sending…' : 'Send Invitation'}
            </button>
          </form>
        )}

        {!showInvite && (
          <>
            <div className={styles.filterRow}>
              {(['all','active','invited','suspended'] as const).map(f=>(
                <button key={f} type="button" className={`${styles.filterTab} ${filter===f?styles.filterTabActive:''}`} onClick={()=>setFilter(f)}>
                  {f.charAt(0).toUpperCase()+f.slice(1)}
                </button>
              ))}
            </div>
            <div className={styles.memberList}>
              {loading && (
                <div className={styles.loadingState}><Loader2 size={20} className={styles.spin}/><span>Loading team…</span></div>
              )}
              {!loading && listed.length === 0 && (
                <div className={styles.emptyMemberList}><UserPlus size={28}/><p>No members yet.<br/>Invite your first team member.</p></div>
              )}
              {listed.map(m => {
                const RoleIcon = ROLE_ICON[m.role]
                return (
                  <div key={m.id} role="button" tabIndex={0} className={`${styles.memberItem} ${selected?.id===m.id?styles.memberItemActive:''}`} onClick={()=>setSelected(m)} onKeyDown={e=>{if(e.key==='Enter')setSelected(m)}}>
                    <div className={`${styles.avatar} ${styles[ROLE_CLS[m.role]]}`}>{m.avatarInitials}</div>
                    <div className={styles.memberInfo}>
                      <div className={styles.memberTop}><span className={styles.memberName}>{m.name}</span><span className={`${styles.statusDot} ${styles[STATUS_CLS[m.status]]}`}/></div>
                      <div className={styles.memberRole}><RoleIcon size={11}/>{ROLE_LABEL[m.role]}</div>
                      <div className={styles.memberMeta}>{m.email}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className={styles.detail}>
        {!selected ? (
          <div className={styles.emptyDetail}><Users size={48}/><p>Select a team member</p></div>
        ) : (
          <>
            <div className={styles.detailHeader}>
              <div className={`${styles.detailAvatar} ${styles[ROLE_CLS[selected.role]]}`}>{selected.avatarInitials}</div>
              <div className={styles.detailHeaderText}>
                <h2 className={styles.detailName}>{selected.name}</h2>
                <div className={styles.detailMetaRow}>
                  <span className={`${styles.roleBadge} ${styles[ROLE_CLS[selected.role]]}`}>{ROLE_LABEL[selected.role]}</span>
                  <span className={`${styles.statusBadge} ${styles[STATUS_CLS[selected.status]]}`}>{STATUS_LABEL[selected.status]}</span>
                  <span className={styles.metaItem}><Mail size={12}/>{selected.email}</span>
                  <span className={styles.metaItem}>Joined {selected.joinedAt}</span>
                  <span className={styles.metaItem}><UserRound size={12}/>{selected.matters} active matters</span>
                </div>
              </div>
              {selected.role !== 'owner' && (
                <div className={styles.detailActions}>
                  <button type="button" className={selected.status==='suspended'?styles.activateBtn:styles.suspendBtn} onClick={()=>toggleSuspend(selected)}>
                    {selected.status==='suspended'?<><CheckCircle2 size={13}/>Reactivate</>:<><XCircle size={13}/>Suspend</>}
                  </button>
                  <button type="button" className={styles.removeBtn} onClick={()=>removeMember(selected.id)}><Trash2 size={13}/>Remove</button>
                </div>
              )}
            </div>
            <div className={styles.detailBody}>
              <div className={styles.detailSection}>
                <span className={styles.detailSectionLabel}>Role Permissions</span>
                <div className={styles.permissionList}>
                  {PERMISSIONS[selected.role].map(p=>(
                    <div key={p} className={styles.permissionItem}><CheckCircle2 size={13} className={styles.permCheck}/>{p}</div>
                  ))}
                </div>
              </div>
              <div className={styles.detailSection}>
                <span className={styles.detailSectionLabel}>About this Role</span>
                <p className={styles.detailText}>
                  {selected.role === 'owner' && 'The owner has full unrestricted access to all areas of the platform including billing, team management, and all client matters.'}
                  {selected.role === 'solicitor' && 'Solicitors and McKenzie Friends have full case-working access. They can manage all client matters, documents, notes, calendar events, video calls, and leads.'}
                  {selected.role === 'paralegal' && 'Paralegals can access and work on matters they are assigned to. They can view and edit documents, notes, and calendar events for assigned matters.'}
                  {selected.role === 'admin' && 'Admins manage the platform but do not handle legal casework. They can access billing, settings, and team management, and view all matters.'}
                  {selected.role === 'viewer' && 'Viewers have read-only access to matters they have been explicitly assigned to. Suitable for observers, auditors, or clients with portal access.'}
                </p>
              </div>
              {notice && !showInvite && <p className={noticeError ? styles.formNoticeError : styles.formNotice}>{notice}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
