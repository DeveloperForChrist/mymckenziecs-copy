import { describe, expect, it } from 'vitest'
import {
  decodeMessageHistoryCursor,
  encodeMessageHistoryCursor,
  sliceMessageHistoryPage,
} from '@/lib/chat/history-pagination'

describe('history pagination helpers', () => {
  it('round-trips message cursors', () => {
    const encoded = encodeMessageHistoryCursor({
      timestamp: '2026-03-08T10:15:00.000Z',
      id: 'msg-200',
    })

    expect(encoded).toBe('2026-03-08T10:15:00.000Z|msg-200')
    expect(decodeMessageHistoryCursor(encoded)).toEqual({
      timestamp: '2026-03-08T10:15:00.000Z',
      id: 'msg-200',
    })
  })

  it('ignores invalid cursor input', () => {
    expect(decodeMessageHistoryCursor('')).toBeNull()
    expect(decodeMessageHistoryCursor('not-a-cursor')).toBeNull()
    expect(decodeMessageHistoryCursor('bad-date|msg-1')).toBeNull()
  })

  it('slices descending rows and advances with a stable next cursor', () => {
    const rows = [
      { id: 'msg-300', timestamp: '2026-03-08T12:00:00.000Z' },
      { id: 'msg-250', timestamp: '2026-03-08T11:00:00.000Z' },
      { id: 'msg-240', timestamp: '2026-03-08T11:00:00.000Z' },
      { id: 'msg-100', timestamp: '2026-03-08T09:00:00.000Z' },
    ]

    const firstPage = sliceMessageHistoryPage(rows, 2)
    expect(firstPage.pageRows).toEqual([
      { id: 'msg-300', timestamp: '2026-03-08T12:00:00.000Z' },
      { id: 'msg-250', timestamp: '2026-03-08T11:00:00.000Z' },
    ])
    expect(firstPage.hasMoreOlder).toBe(true)
    expect(firstPage.nextCursor).toBe('2026-03-08T11:00:00.000Z|msg-250')

    const secondPage = sliceMessageHistoryPage(
      rows,
      2,
      decodeMessageHistoryCursor(firstPage.nextCursor)
    )

    expect(secondPage.pageRows).toEqual([
      { id: 'msg-240', timestamp: '2026-03-08T11:00:00.000Z' },
      { id: 'msg-100', timestamp: '2026-03-08T09:00:00.000Z' },
    ])
    expect(secondPage.hasMoreOlder).toBe(false)
    expect(secondPage.nextCursor).toBeNull()
  })

  it('keeps same-timestamp rows in order across cursor pages', () => {
    const rows = [
      { id: 'msg-500', timestamp: '2026-03-08T12:00:00.000Z' },
      { id: 'msg-450', timestamp: '2026-03-08T12:00:00.000Z' },
      { id: 'msg-400', timestamp: '2026-03-08T12:00:00.000Z' },
      { id: 'msg-350', timestamp: '2026-03-08T12:00:00.000Z' },
      { id: 'msg-300', timestamp: '2026-03-08T11:59:59.000Z' },
    ]

    const firstPage = sliceMessageHistoryPage(rows, 2)
    expect(firstPage.pageRows.map((row) => row.id)).toEqual(['msg-500', 'msg-450'])
    expect(firstPage.nextCursor).toBe('2026-03-08T12:00:00.000Z|msg-450')

    const secondPage = sliceMessageHistoryPage(
      rows,
      2,
      decodeMessageHistoryCursor(firstPage.nextCursor)
    )

    expect(secondPage.pageRows.map((row) => row.id)).toEqual(['msg-400', 'msg-350'])
    expect(secondPage.nextCursor).toBe('2026-03-08T12:00:00.000Z|msg-350')
  })
})
