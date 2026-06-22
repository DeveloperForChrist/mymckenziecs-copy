import type { ClientMatter, MatterStage } from '@/lib/business/client-matters'

export const STAGE_LABELS: Record<MatterStage, string> = {
  intake: 'Intake',
  documents: 'Documents',
  advice: 'Advice',
  hearing: 'Hearing',
  closed: 'Closed',
}

export const STAGE_OPTIONS = Object.keys(STAGE_LABELS) as MatterStage[]
export const OWNER_OPTIONS = ['Unassigned', 'You', 'Support assistant', 'External advisor']

export type MatterEditForm = {
  clientName: string
  email: string
  phone: string
  location: string
  issueType: string
  summary: string
  fullDetails: string
  courtDate: string
  opposing: string
  nextAction: string
  nextDeadline: string
  matterNumber: string
}

export type CreateMatterForm = {
  clientName: string
  email: string
  phone: string
  location: string
  issueType: string
  summary: string
}

export type DetailTab = 'overview' | 'documents'
export type StageFilter = 'all' | MatterStage

export const EMPTY_CREATE_MATTER_FORM: CreateMatterForm = {
  clientName: '',
  email: '',
  phone: '',
  location: '',
  issueType: '',
  summary: '',
}

export function createMatterEditForm(matter: ClientMatter): MatterEditForm {
  return {
    clientName: matter.clientName,
    email: matter.email,
    phone: matter.phone,
    location: matter.location,
    issueType: matter.issueType,
    summary: matter.summary,
    fullDetails: matter.fullDetails,
    courtDate: matter.courtDate || '',
    opposing: matter.opposing || '',
    nextAction: matter.nextAction,
    nextDeadline: matter.nextDeadline || '',
    matterNumber: matter.matterNumber,
  }
}

export function formatDate(value?: string) {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatLastActivity(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function filterMatters(
  matters: ClientMatter[],
  query: string,
  showArchived: boolean,
  stageFilter: StageFilter,
) {
  const normalisedQuery = query.trim().toLowerCase()
  return matters.filter((matter) => {
    if (!showArchived && matter.status === 'archived') return false
    if (showArchived && matter.status !== 'archived') return false
    if (stageFilter !== 'all' && matter.stage !== stageFilter) return false
    if (!normalisedQuery) return true
    return [
      matter.clientName,
      matter.matterNumber,
      matter.issueType,
      matter.summary,
      matter.email,
      matter.location,
    ].some((value) => value.toLowerCase().includes(normalisedQuery))
  })
}

export function calculateMatterStats(matters: ClientMatter[]) {
  const active = matters.filter((matter) => matter.status === 'active')
  return {
    clients: new Set(active.map((matter) => matter.email || matter.clientName)).size,
    matters: active.length,
    urgent: active.filter((matter) => matter.urgency === 'high').length,
  }
}

export function buildGlanceItems(matter: ClientMatter | null) {
  if (!matter) return []
  return [
    {
      label: 'Client contact details',
      value: matter.email || matter.phone ? 'Complete' : 'Missing',
    },
    {
      label: 'Next deadline',
      value: matter.nextDeadline ? formatDate(matter.nextDeadline) : 'Not set',
    },
    {
      label: 'Documents linked',
      value: matter.documents.length > 0 ? `${matter.documents.length} file(s)` : 'None',
    },
    { label: 'Responsible person', value: matter.owner },
    { label: 'Last updated', value: formatLastActivity(matter.lastActivity) },
  ]
}
