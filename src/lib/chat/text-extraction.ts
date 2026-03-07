import mammoth from 'mammoth'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)

const getExtension = (name?: string) => {
  if (!name) return ''
  const ext = name.split('.').pop()?.toLowerCase()
  return ext || ''
}

export const extractTextFromBuffer = async (buffer: Buffer, name?: string, mimeType?: string | null) => {
  const ext = getExtension(name)
  const typeHint = mimeType?.toLowerCase() || ''

  if (typeHint.includes('pdf') || ext === 'pdf') {
    try {
      const pdfParseModule = nodeRequire('pdf-parse')
      const parse = pdfParseModule?.default ?? pdfParseModule
      const parsed = await parse(buffer)
      return parsed.text || ''
    } catch {
      return ''
    }
  }

  if (typeHint.includes('word') || ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value || ''
  }

  if (typeHint.startsWith('text/') || ['txt', 'md', 'rtf'].includes(ext)) {
    return buffer.toString('utf-8')
  }

  return ''
}
