const TONE_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bhas\s+broken\s+the\s+law\b/gi, replacement: 'may have committed an offence' },
  { pattern: /\bbroke\s+the\s+law\b/gi, replacement: 'may have committed an offence' },
  { pattern: /\bis\s+breaking\s+the\s+law\b/gi, replacement: 'may be committing an offence' },
  { pattern: /\bthis\s+is\s+illegal\b/gi, replacement: 'this may be unlawful' },
  { pattern: /\bthis\s+is\s+unlawful\b/gi, replacement: 'this may be unlawful' },
  { pattern: /\bit\s+is\s+unlawful\b/gi, replacement: 'it may be unlawful' },
  { pattern: /\byou\s+should\b/gi, replacement: 'you may wish to' },
  { pattern: /\byou\s+must\b/gi, replacement: 'the rules generally require that you' },
  { pattern: /\byou\s+need\s+to\b/gi, replacement: 'it may help to' },
  { pattern: /\byou\s+have\s+to\b/gi, replacement: 'it is generally required to' },
  { pattern: /\byou\s+ought\s+to\b/gi, replacement: 'you may wish to' },
  { pattern: /\byour\s+best\s+option\s+is\s+to\b/gi, replacement: 'one option to consider is to' },
  { pattern: /\bthe\s+best\s+option\s+is\s+to\b/gi, replacement: 'one option to consider is to' },
  { pattern: /\byou\s+are\s+entitled\s+to\b/gi, replacement: 'you may be entitled to' },
  { pattern: /\byou\s+can\s+claim\b/gi, replacement: 'you may be able to claim' },
  { pattern: /\byou\s+can\s+argue\b/gi, replacement: 'you may be able to argue' },
  { pattern: /\byou\s+can\s+rely\s+on\b/gi, replacement: 'you may be able to rely on' },
  { pattern: /\byou\s+can\s+say\b/gi, replacement: 'you could say' },
  { pattern: /\byou\s+will\s+win\b/gi, replacement: 'outcomes depend on the facts, evidence, and procedure' },
  { pattern: /\byou\s+will\s+lose\b/gi, replacement: 'outcomes depend on the facts, evidence, and procedure' },
  { pattern: /\byou\s+will\s+succeed\b/gi, replacement: 'success depends on the facts, evidence, and procedure' },
  { pattern: /\byou\s+will\s+be\s+liable\b/gi, replacement: 'liability may depend on the facts, evidence, and procedure' },
  { pattern: /\byou\s+will\s+not\s+be\s+liable\b/gi, replacement: 'liability may depend on the facts, evidence, and procedure' },
  { pattern: /\byou\s+cannot\s+lose\b/gi, replacement: 'outcomes depend on the facts, evidence, and procedure' },
  { pattern: /\bthe\s+court\s+will\b/gi, replacement: 'the court may, depending on the facts and procedure,' },
  { pattern: /\bthe\s+judge\s+will\b/gi, replacement: 'the judge may, depending on the facts and procedure,' },
  { pattern: /\bthe\s+judge\s+must\b/gi, replacement: 'judges may, depending on the facts and procedure,' },
  { pattern: /\bthe\s+court\s+must\b/gi, replacement: 'courts may, depending on the facts and procedure,' },
]

export function neutralizeLegalAdviceTone(text: string): string {
  if (!text) return ''

  let normalized = text
  for (const rule of TONE_REPLACEMENTS) {
    normalized = normalized.replace(rule.pattern, rule.replacement)
  }

  normalized = normalized
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const hasUncertaintyLanguage =
    /\b(in general|generally|this depends|depends on|may|might|can|could|you may wish to verify|judges may)\b/i.test(normalized)

  const likelyLegalAnalysis =
    /\b(law|legal|court|judge|claim|defence|hearing|judgment|unlawful|illegal|liable|liability|right|entitled)\b/i.test(normalized)

  if (!hasUncertaintyLanguage && likelyLegalAnalysis) {
    normalized = `In general, this depends on the specific facts, evidence, and procedure. ${normalized}`.trim()
  }

  return normalized
}
