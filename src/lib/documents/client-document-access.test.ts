import { describe, expect, it } from 'vitest'
import { extractAttachmentDocumentIds, isMissingDocumentSharesTable } from './client-document-access'

describe('client document access helpers', () => {
  it('extracts only explicit document attachment identifiers', () => {
    expect(
      extractAttachmentDocumentIds({
        attachments: [
          { documentId: 'doc-1' },
          { id: 'doc-2' },
          { documentId: '  ' },
          null,
        ],
      }),
    ).toEqual(['doc-1', 'doc-2'])
  })

  it('does not infer access from unrelated metadata', () => {
    expect(extractAttachmentDocumentIds({ attachmentIds: ['doc-1'] })).toEqual([])
    expect(extractAttachmentDocumentIds(null)).toEqual([])
  })

  it('recognizes migration drift without hiding unrelated database errors', () => {
    expect(isMissingDocumentSharesTable({ code: 'PGRST205', message: 'missing relation' })).toBe(true)
    expect(isMissingDocumentSharesTable({ code: 'XX000', message: 'document_client_shares unavailable' })).toBe(true)
    expect(isMissingDocumentSharesTable({ code: '42501', message: 'permission denied' })).toBe(false)
  })
})
