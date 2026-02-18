import { describe, expect, it } from 'vitest'
import { neutralizeLegalAdviceTone } from './legal-tone'

describe('neutralizeLegalAdviceTone', () => {
  it('softens directive language and definitive conclusions', () => {
    const input = [
      'The driver has broken the law.',
      'You should report this now.',
      'You must send the form today.'
    ].join(' ')

    const output = neutralizeLegalAdviceTone(input)

    expect(output).toContain('may have committed an offence')
    expect(output).toContain('you may wish to report this now')
    expect(output).toContain('the rules generally require that you send the form today')
  })
})

