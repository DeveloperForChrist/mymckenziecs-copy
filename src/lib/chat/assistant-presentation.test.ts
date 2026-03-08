import { describe, expect, it } from 'vitest'
import {
  attachAssistantPresentationMetadata,
  buildAssistantResponsePayload,
} from '@/lib/chat/assistant-presentation'

describe('assistant presentation helpers', () => {
  it('adds presentation metadata to assistant response payloads', () => {
    const payload = buildAssistantResponsePayload('Next steps\n\n1. File the claim', {
      sources: [{ number: 1, title: 'CPR', url: 'https://www.justice.gov.uk/courts/procedure-rules/civil' }],
    })

    expect(payload.response).toBe('Next steps\n\n1. File the claim')
    expect(payload.metadata?.sources).toHaveLength(1)
    expect(payload.metadata?.presentation).toEqual({
      version: 1,
      sections: [
        {
          heading: 'Next steps',
          lines: [{ kind: 'ordered', text: 'File the claim' }],
        },
      ],
    })
  })

  it('can reuse existing presentation metadata when the caller trusts the server copy', () => {
    const existingPresentation = {
      version: 1 as const,
      sections: [
        {
          heading: 'Existing heading',
          lines: [{ kind: 'paragraph' as const, text: 'Existing line' }],
        },
      ],
    }

    const metadata = attachAssistantPresentationMetadata(
      'Different text that should not be reparsed here.',
      { presentation: existingPresentation, sources: [] },
      { reuseExistingPresentation: true }
    )

    expect(metadata?.presentation).toBe(existingPresentation)
    expect(metadata?.sources).toEqual([])
  })
})
