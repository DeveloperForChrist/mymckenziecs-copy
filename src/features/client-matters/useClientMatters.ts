'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BUSINESS_LEADS_UPDATED_EVENT,
  CLIENT_MATTERS_UPDATED_EVENT,
  type ClientMatter,
  type MatterStage,
  cacheClientMatters,
  createBlankMatter,
  createClientMatter,
  fetchClientMatters,
  readBusinessLeads,
  readClientMatters,
  syncAcceptedLeadMatters,
  updateClientMatter,
  writeClientMatters,
} from '@/lib/business/client-matters'
import {
  EMPTY_CREATE_MATTER_FORM,
  buildGlanceItems,
  calculateMatterStats,
  createMatterEditForm,
  filterMatters,
  type CreateMatterForm,
  type DetailTab,
  type MatterEditForm,
  type StageFilter,
} from './model'

export function useClientMatters() {
  const [matters, setMatters] = useState<ClientMatter[]>([])
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null)
  const [checkedMatterIds, setCheckedMatterIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<StageFilter>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('overview')
  const [isEditingMatter, setIsEditingMatter] = useState(false)
  const [editForm, setEditForm] = useState<MatterEditForm | null>(null)
  const [createForm, setCreateForm] = useState<CreateMatterForm>(EMPTY_CREATE_MATTER_FORM)

  useEffect(() => {
    let mounted = true

    const applyMatters = (nextMatters: ClientMatter[]) => {
      if (!mounted) return
      setMatters(nextMatters)
      setSelectedMatterId((current) => {
        if (!current || nextMatters.some((matter) => matter.id === current)) return current
        return null
      })
    }

    const loadLocalMatters = () => {
      const synced = syncAcceptedLeadMatters(readBusinessLeads())
      applyMatters(synced.length > 0 ? synced : readClientMatters())
    }

    const loadRemoteMatters = async () => {
      setLoading(true)
      try {
        const remoteMatters = await fetchClientMatters()
        cacheClientMatters(remoteMatters)
        applyMatters(remoteMatters)
        setSyncNotice(null)
      } catch {
        loadLocalMatters()
        setSyncNotice('Using local client work until the business database is available.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadRemoteMatters()
    window.addEventListener(CLIENT_MATTERS_UPDATED_EVENT, loadLocalMatters)
    window.addEventListener(BUSINESS_LEADS_UPDATED_EVENT, loadLocalMatters)
    window.addEventListener('storage', loadLocalMatters)
    return () => {
      mounted = false
      window.removeEventListener(CLIENT_MATTERS_UPDATED_EVENT, loadLocalMatters)
      window.removeEventListener(BUSINESS_LEADS_UPDATED_EVENT, loadLocalMatters)
      window.removeEventListener('storage', loadLocalMatters)
    }
  }, [])

  const visibleMatters = useMemo(
    () => filterMatters(matters, query, showArchived, stageFilter),
    [matters, query, showArchived, stageFilter],
  )
  const selectedMatter = useMemo(
    () => matters.find((matter) => matter.id === selectedMatterId) ?? null,
    [matters, selectedMatterId],
  )
  const stats = useMemo(() => calculateMatterStats(matters), [matters])
  const glanceItems = useMemo(() => buildGlanceItems(selectedMatter), [selectedMatter])

  useEffect(() => {
    if (!selectedMatterId) return
    const next = matters.find((matter) => matter.id === selectedMatterId)
    if (!next) return
    setDetailTab(next.stage === 'documents' ? 'documents' : 'overview')
    setIsEditingMatter(false)
    setEditForm(createMatterEditForm(next))
  }, [matters, selectedMatterId])

  useEffect(() => {
    if (!selectedMatter || isEditingMatter) return
    setEditForm(createMatterEditForm(selectedMatter))
  }, [selectedMatter, isEditingMatter])

  const updateMatter = async (id: string, patch: Partial<ClientMatter>) => {
    const optimistic = matters.map((matter) => (
      matter.id === id ? { ...matter, ...patch, lastActivity: new Date().toISOString() } : matter
    ))
    setMatters(optimistic)
    cacheClientMatters(optimistic)
    setSyncNotice(null)

    try {
      const updated = await updateClientMatter(id, patch)
      const remoteMatters = optimistic.map((matter) => (matter.id === id ? updated : matter))
      setMatters(remoteMatters)
      cacheClientMatters(remoteMatters)
    } catch {
      writeClientMatters(optimistic)
      setSyncNotice('Saved locally. It will sync when the business database is available.')
    }
  }

  const createMatter = async (payload: CreateMatterForm) => {
    const matter = createBlankMatter()
    matter.clientName = payload.clientName.trim() || 'Client'
    matter.email = payload.email.trim()
    matter.phone = payload.phone.trim()
    matter.location = payload.location.trim()
    matter.issueType = payload.issueType.trim() || 'New legal work item'
    matter.summary = payload.summary.trim() || 'Client enquiry received. Add a summary and next steps.'
    const optimistic = [matter, ...matters]
    setMatters(optimistic)
    cacheClientMatters(optimistic)
    setSelectedMatterId(matter.id)
    setCheckedMatterIds([matter.id])
    setShowArchived(false)
    setSyncNotice(null)

    try {
      const created = await createClientMatter(matter)
      const remoteMatters = optimistic.map((item) => (item.id === matter.id ? created : item))
      setMatters(remoteMatters)
      cacheClientMatters(remoteMatters)
      setSelectedMatterId(created.id)
      setCheckedMatterIds([created.id])
    } catch {
      writeClientMatters(optimistic)
      setSyncNotice('Saved locally. It will sync when the business database is available.')
    }
  }

  const archiveMatter = async (matter: ClientMatter, status: ClientMatter['status']) => {
    const patch: Partial<ClientMatter> = { status }
    if (status === 'active' && matter.stage === 'closed') patch.stage = 'advice'
    await updateMatter(matter.id, patch)
    setCheckedMatterIds((current) => current.filter((matterId) => matterId !== matter.id))
  }

  const closeMatter = async (matter: ClientMatter) => {
    if (matter.status === 'archived' && matter.stage === 'closed') return
    if (!window.confirm(`Close ${matter.clientName}'s work item and move it to archived client work?`)) return
    setIsEditingMatter(false)
    setDetailTab('overview')
    await updateMatter(matter.id, { stage: 'closed', status: 'archived' })
    setCheckedMatterIds((current) => current.filter((matterId) => matterId !== matter.id))
  }

  const archiveCheckedMatters = async () => {
    if (checkedMatterIds.length === 0) return
    const nextStatus: ClientMatter['status'] = showArchived ? 'active' : 'archived'
    const ids = checkedMatterIds
    const optimistic = matters.map((matter) => (
      checkedMatterIds.includes(matter.id)
        ? {
            ...matter,
            status: nextStatus,
            stage: showArchived && matter.stage === 'closed' ? 'advice' as MatterStage : matter.stage,
            lastActivity: new Date().toISOString(),
          }
        : matter
    ))
    setMatters(optimistic)
    cacheClientMatters(optimistic)
    setCheckedMatterIds([])
    setSyncNotice(null)

    try {
      const updatedMatters = await Promise.all(ids.map((id) => {
        const matter = matters.find((item) => item.id === id)
        return updateClientMatter(id, {
          status: nextStatus,
          ...(showArchived && matter?.stage === 'closed' ? { stage: 'advice' as MatterStage } : {}),
        })
      }))
      const updatedById = new Map(updatedMatters.map((matter) => [matter.id, matter]))
      const remoteMatters = optimistic.map((matter) => updatedById.get(matter.id) ?? matter)
      setMatters(remoteMatters)
      cacheClientMatters(remoteMatters)
    } catch {
      writeClientMatters(optimistic)
      setSyncNotice('Saved locally. It will sync when the business database is available.')
    }
  }

  const saveMatterEdit = async () => {
    if (!selectedMatter || !editForm) return
    await updateMatter(selectedMatter.id, {
      clientName: editForm.clientName.trim() || selectedMatter.clientName,
      email: editForm.email.trim(),
      phone: editForm.phone.trim(),
      location: editForm.location.trim(),
      issueType: editForm.issueType.trim() || selectedMatter.issueType,
      summary: editForm.summary.trim() || selectedMatter.summary,
      fullDetails: editForm.fullDetails.trim() || selectedMatter.fullDetails,
      courtDate: editForm.courtDate.trim() || undefined,
      opposing: editForm.opposing.trim() || undefined,
      nextAction: editForm.nextAction.trim() || selectedMatter.nextAction,
      nextDeadline: editForm.nextDeadline.trim() || undefined,
      matterNumber: editForm.matterNumber.trim() || selectedMatter.matterNumber,
    })
    setIsEditingMatter(false)
  }

  const beginMatterEdit = () => {
    if (!selectedMatter) return
    setEditForm(createMatterEditForm(selectedMatter))
    setIsEditingMatter(true)
  }
  const cancelMatterEdit = () => {
    if (!selectedMatter) return
    setEditForm(createMatterEditForm(selectedMatter))
    setIsEditingMatter(false)
  }
  const toggleCheckedMatter = (id: string) => {
    setCheckedMatterIds((current) => (
      current.includes(id) ? current.filter((matterId) => matterId !== id) : [...current, id]
    ))
  }
  const resetCreateForm = () => setCreateForm(EMPTY_CREATE_MATTER_FORM)

  return {
    visibleMatters, selectedMatter, checkedMatterIds, query, stageFilter, showArchived,
    loading, syncNotice, createOpen, detailTab, isEditingMatter, editForm, createForm,
    stats, glanceItems, setSelectedMatterId, setQuery, setStageFilter, setShowArchived,
    setCreateOpen, setDetailTab, setEditForm, setCreateForm, updateMatter, createMatter,
    archiveMatter, closeMatter, archiveCheckedMatters, saveMatterEdit, beginMatterEdit,
    cancelMatterEdit, toggleCheckedMatter, resetCreateForm,
  }
}

export type ClientMattersController = ReturnType<typeof useClientMatters>
