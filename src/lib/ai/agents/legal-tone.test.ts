import { describe, expect, it } from 'vitest'
import { neutralizeLegalAdviceTone } from './legal-tone'

describe('neutralizeLegalAdviceTone', () => {
  it('softens directive language and definitive conclusions', () => {
    const input = [
      'The driver has broken the law.',
      'You should report this now.',
      'You must send the form today.',
      'You need to reply today.',
      'You are entitled to compensation.'
    ].join(' ')

    const output = neutralizeLegalAdviceTone(input)

    expect(output).toContain('may have committed an offence')
    expect(output).toContain('you may wish to report this now')
    expect(output).toContain('the rules generally require that you send the form today')
    expect(output).toContain('it may help to reply today')
    expect(output).toContain('you may be entitled to compensation')
  })

  it('rewrites deterministic predictions and absolute legal conclusions', () => {
    const input = [
      'You will win.',
      'This is unlawful.',
      'The judge must strike out the claim.',
      'The court will dismiss the defence.',
    ].join(' ')

    const output = neutralizeLegalAdviceTone(input)

    expect(output).toContain('outcomes depend on the facts, evidence, and procedure')
    expect(output).toContain('this may be unlawful')
    expect(output).toContain('judges may, depending on the facts and procedure')
    expect(output).toContain('the court may, depending on the facts and procedure, dismiss the defence')
  })

  it('adds uncertainty framing when legal analysis has no hedge language', () => {
    const input = 'The court decides liability based on evidence.'
    const output = neutralizeLegalAdviceTone(input)
    expect(output.toLowerCase()).toContain('in general, this depends on the specific facts, evidence, and procedure.')
  })
})
