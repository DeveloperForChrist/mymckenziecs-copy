const TONE_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bhas\s+broken\s+the\s+law\b/gi, replacement: 'may have committed an offence' },
  { pattern: /\bbroke\s+the\s+law\b/gi, replacement: 'may have committed an offence' },
  { pattern: /\bis\s+breaking\s+the\s+law\b/gi, replacement: 'may be committing an offence' },
  { pattern: /\bthis\s+is\s+illegal\b/gi, replacement: 'this may be unlawful' },
  { pattern: /\byou\s+should\b/gi, replacement: 'you may wish to' },
  { pattern: /\byou\s+must\b/gi, replacement: 'the rules generally require that you' },
  { pattern: /\byou\s+need\s+to\b/gi, replacement: 'it may help to' },
  { pattern: /\byou\s+have\s+to\b/gi, replacement: 'it is generally required to' },
  { pattern: /\byour\s+best\s+option\s+is\s+to\b/gi, replacement: 'one option to consider is to' },
  { pattern: /\byou\s+will\s+win\b/gi, replacement: 'outcomes depend on the facts, evidence, and procedure' },
  { pattern: /\byou\s+will\s+lose\b/gi, replacement: 'outcomes depend on the facts, evidence, and procedure' },
]

export function neutralizeLegalAdviceTone(text: string): string {
  if (!text) return ''

  let normalized = text
  for (const rule of TONE_REPLACEMENTS) {
    normalized = normalized.replace(rule.pattern, rule.replacement)
  }

  return normalized
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

