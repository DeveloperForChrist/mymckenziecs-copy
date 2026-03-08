import { describe, expect, it } from 'vitest'
import {
  attachAssistantPresentationMetadata,
  buildAssistantResponsePayload,
  formatAssistantResponse,
  normalizeAssistantResponsePayload,
  stripAssistantPresentationMetadata,
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
          lines: [{ kind: 'ordered', order: 1, text: 'File the claim' }],
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

    expect(metadata?.presentation).toStrictEqual(existingPresentation)
    expect(metadata?.sources).toEqual([])
  })

  it('strips presentation metadata before persistence and can rehydrate it later', () => {
    const apiMetadata = attachAssistantPresentationMetadata('Next steps\n\n1. File the claim', {
      sources: [{ number: 1, title: 'CPR', url: 'https://www.justice.gov.uk/courts/procedure-rules/civil' }],
      activeCaseId: 'case-123',
    })

    const storedMetadata = stripAssistantPresentationMetadata(apiMetadata)

    expect(storedMetadata).toEqual({
      sources: [{ number: 1, title: 'CPR', url: 'https://www.justice.gov.uk/courts/procedure-rules/civil' }],
      activeCaseId: 'case-123',
    })

    const hydratedMetadata = attachAssistantPresentationMetadata(
      'Next steps\n\n1. File the claim',
      storedMetadata,
      { reuseExistingPresentation: true }
    )

    expect(hydratedMetadata?.presentation).toEqual({
      version: 1,
      sections: [
        {
          heading: 'Next steps',
          lines: [{ kind: 'ordered', order: 1, text: 'File the claim' }],
        },
      ],
    })
  })

  it('preserves explicit numbering when ordered steps are separated by bullet detail', () => {
    const formatted = formatAssistantResponse(
      '1. Gather documents\n\n• Contract\n\n2. Check the qualifying period\n\n• Service dates'
    )

    expect(formatted).toContain('1. Gather documents')
    expect(formatted).toContain('2. Check the qualifying period')
    expect(formatted).not.toContain('1. Check the qualifying period')
  })

  it('normalizes loose assistant payloads into the shared contract', () => {
    const payload = normalizeAssistantResponsePayload({
      response: 'In short: Keep proof of service.',
      metadata: {
        sources: [{ number: 1, title: 'CPR', url: 'https://www.justice.gov.uk/courts/procedure-rules/civil' }],
        presentation: { version: 999, sections: 'bad-data' },
      },
      debug: { provider: 'test' },
    })

    expect(payload).toEqual({
      response: 'In short: Keep proof of service.',
      metadata: {
        sources: [{ number: 1, title: 'CPR', url: 'https://www.justice.gov.uk/courts/procedure-rules/civil' }],
      },
      debug: { provider: 'test' },
    })
  })
})
