export function htmlEscape(text: string | null | undefined): string {
  const s = String(text || '')
  const map: { [k: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return s.replace(/[&<>"']/g, (m) => map[m] || '')
}
