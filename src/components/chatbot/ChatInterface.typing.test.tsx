import { describe, expect, it } from 'vitest'
import { parseAssistantResponse } from '@/lib/chat/assistant-presentation'

describe('ChatInterface typing formatting', () => {
  it('keeps a single numbered line as an ordered item while typing instead of a subheading', () => {
    const parsed = parseAssistantResponse('1. Next steps', false)

    expect(parsed).toEqual([
      {
        heading: null,
        lines: [{ text: 'Next steps', kind: 'ordered', order: 1 }],
      },
    ])
  })

  it('parses plain-text headings, ordered items, bullets, dividers, and summary lines', () => {
    const parsed = parseAssistantResponse(
      'Next steps\n\n1. File the claim\n2. Serve the papers\n- Keep proof of service\n────────────────────\nIn short: Start the claim and keep evidence of each step.'
    )

    expect(parsed).toEqual([
      {
        heading: 'Next steps',
        lines: [
          { text: 'File the claim', kind: 'ordered', order: 1 },
          { text: 'Serve the papers', kind: 'ordered', order: 2 },
          { text: 'Keep proof of service', kind: 'bullet' },
        ],
      },
      {
        heading: null,
        lines: [
          { text: '---', kind: 'divider' },
        ],
      },
      {
        heading: null,
        lines: [
          { text: 'In short: Start the claim and keep evidence of each step.', kind: 'summary' },
        ],
      },
    ])
  })
})
