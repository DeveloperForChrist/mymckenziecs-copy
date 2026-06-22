import { describe, expect, it } from 'vitest'
import type { ClientMatter } from '@/lib/business/client-matters'
import { calculateMatterStats, filterMatters } from './model'

const matter = (patch: Partial<ClientMatter> = {}): ClientMatter => ({
  id: 'matter-1',
  clientName: 'Alex Client',
  email: 'alex@example.com',
  phone: '',
  location: 'London',
  issueType: 'Housing',
  urgency: 'medium',
  summary: 'Deposit dispute',
  fullDetails: 'Details',
  documents: [],
  tags: [],
  matterNumber: 'MC-1',
  stage: 'intake',
  status: 'active',
  owner: 'You',
  nextAction: 'Review papers',
  lastActivity: '2026-06-22T10:00:00.000Z',
  acceptedAt: '2026-06-22T10:00:00.000Z',
  currentBalance: 0,
  ...patch,
})

describe('client matters model', () => {
  it('filters by archive state, stage, and searchable client fields', () => {
    const matters = [
      matter(),
      matter({ id: 'matter-2', clientName: 'Sam Client', email: 'sam@example.com', stage: 'hearing' }),
      matter({ id: 'matter-3', status: 'archived', stage: 'closed' }),
    ]

    expect(filterMatters(matters, 'sam', false, 'all').map((item) => item.id)).toEqual(['matter-2'])
    expect(filterMatters(matters, '', false, 'hearing').map((item) => item.id)).toEqual(['matter-2'])
    expect(filterMatters(matters, '', true, 'all').map((item) => item.id)).toEqual(['matter-3'])
  })

  it('counts only active clients, matters, and urgent work', () => {
    const stats = calculateMatterStats([
      matter({ urgency: 'high' }),
      matter({ id: 'matter-2', matterNumber: 'MC-2' }),
      matter({ id: 'matter-3', email: 'archived@example.com', status: 'archived', urgency: 'high' }),
    ])

    expect(stats).toEqual({ clients: 1, matters: 2, urgent: 1 })
  })
})
