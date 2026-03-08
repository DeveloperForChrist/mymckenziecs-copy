export type MessageHistoryCursor = {
  timestamp: string
  id: string
}

export type CursorComparableRow = {
  id?: string | null
  timestamp?: string | null
}

export const encodeMessageHistoryCursor = (cursor: MessageHistoryCursor): string =>
  `${cursor.timestamp}|${cursor.id}`

export const decodeMessageHistoryCursor = (value?: string | null): MessageHistoryCursor | null => {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return null
  const separatorIndex = raw.lastIndexOf('|')
  if (separatorIndex <= 0 || separatorIndex >= raw.length - 1) return null
  const timestamp = raw.slice(0, separatorIndex)
  const id = raw.slice(separatorIndex + 1)
  if (!timestamp || !id) return null
  const parsedTimestamp = new Date(timestamp)
  if (Number.isNaN(parsedTimestamp.getTime())) return null
  return { timestamp: parsedTimestamp.toISOString(), id }
}

export const isRowBeforeMessageCursor = (
  row: CursorComparableRow,
  cursor: MessageHistoryCursor
): boolean => {
  const rowTimestamp = typeof row.timestamp === 'string' ? row.timestamp : ''
  const rowId = typeof row.id === 'string' ? row.id : ''
  if (!rowTimestamp || !rowId) return false
  if (rowTimestamp < cursor.timestamp) return true
  if (rowTimestamp > cursor.timestamp) return false
  return rowId < cursor.id
}

export const buildNextMessageHistoryCursor = (rows: CursorComparableRow[]): string | null => {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (typeof row.timestamp === 'string' && typeof row.id === 'string' && row.timestamp && row.id) {
      return encodeMessageHistoryCursor({ timestamp: row.timestamp, id: row.id })
    }
  }
  return null
}

export const sliceMessageHistoryPage = <T extends CursorComparableRow>(
  rows: T[],
  limit: number,
  cursor?: MessageHistoryCursor | null
) => {
  const eligibleRows = cursor ? rows.filter((row) => isRowBeforeMessageCursor(row, cursor)) : rows
  const pageRows = eligibleRows.slice(0, limit)
  const hasMoreOlder = eligibleRows.length > limit
  const nextCursor = hasMoreOlder ? buildNextMessageHistoryCursor(pageRows) : null
  return {
    pageRows,
    hasMoreOlder,
    nextCursor,
  }
}
