import { describe, expect, it } from 'vitest'
import { endsMidSentenceOrSection } from './legal-agent'

describe('legal agent truncation detection', () => {
  it('detects dangling connectors as incomplete endings', () => {
    expect(endsMidSentenceOrSection('The finance showing on a check does not automatically mean you cannot sell -- but')).toBe(true)
    expect(endsMidSentenceOrSection('It may still matter because')).toBe(true)
  })

  it('does not mark normal terminal sentences as incomplete', () => {
    expect(endsMidSentenceOrSection('The finance position should be checked before advertising the car.')).toBe(false)
  })
})
