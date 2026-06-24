export const MAX_UPLOAD_BATCH_BYTES = 3.5 * 1024 * 1024
export const MAX_UPLOAD_BATCH_FILES = 8

export function createUploadBatches(
  files: File[],
  options: {
    maxBytes?: number
    maxFiles?: number
  } = {},
) {
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BATCH_BYTES
  const maxFiles = options.maxFiles ?? MAX_UPLOAD_BATCH_FILES

  const batches: File[][] = []
  let currentBatch: File[] = []
  let currentBytes = 0

  for (const file of files) {
    const fileSize = Math.max(Number(file.size || 0), 0)
    const wouldExceedBytes = currentBatch.length > 0 && currentBytes + fileSize > maxBytes
    const wouldExceedCount = currentBatch.length >= maxFiles

    if (wouldExceedBytes || wouldExceedCount) {
      batches.push(currentBatch)
      currentBatch = []
      currentBytes = 0
    }

    currentBatch.push(file)
    currentBytes += fileSize
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}
