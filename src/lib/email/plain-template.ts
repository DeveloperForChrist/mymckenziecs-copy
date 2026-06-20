import { htmlEscape } from '@/lib/utils/html-escape'

type DetailRow = {
  label: string
  value: string
}

type PlainEmailOptions = {
  preheader?: string
  title: string
  greeting?: string
  intro: string
  detailsTitle?: string
  details?: DetailRow[]
  bodyHtml?: string
  ctaLabel?: string
  ctaUrl?: string
  note?: string
  closing?: string
}

function safeUrl(url: string | null | undefined) {
  const value = String(url || '').trim()
  if (!value) return null
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return null
}

export function renderPlainEmail(options: PlainEmailOptions) {
  const preheader = htmlEscape(options.preheader || options.title)
  const title = htmlEscape(options.title)
  const greeting = htmlEscape(options.greeting || 'Hello,')
  const intro = htmlEscape(options.intro)
  const detailsTitle = options.detailsTitle ? htmlEscape(options.detailsTitle) : ''
  const details = Array.isArray(options.details) ? options.details : []
  const ctaLabel = options.ctaLabel ? htmlEscape(options.ctaLabel) : ''
  const ctaUrl = safeUrl(options.ctaUrl)
  const closing = htmlEscape(options.closing || 'Kind regards,').replace(/\n/g, '<br />')
  const note = options.note ? htmlEscape(options.note) : ''

  const detailsHtml = details.length
    ? `
      <div style="margin:0 0 22px;padding:16px 18px;border:1px solid #d4dbe5;border-radius:12px;background:#f8fafc;">
        ${detailsTitle ? `<p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.06em;">${detailsTitle}</p>` : ''}
        ${details.map((row) => `
          <p style="margin:0 0 8px;font-size:14px;color:#334155;">
            <strong>${htmlEscape(row.label)}:</strong> ${htmlEscape(row.value)}
          </p>
        `).join('')}
      </div>
    `
    : ''

  const bodyHtml = options.bodyHtml
    ? `<div style="margin:0 0 20px;color:#1f2937;font-size:15px;line-height:1.7;">${options.bodyHtml}</div>`
    : ''

  const actionHtml = ctaUrl && ctaLabel
    ? `
      <p style="margin:0 0 18px;">
        <a href="${htmlEscape(ctaUrl)}" style="display:inline-block;padding:12px 16px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff;color:#111827;text-decoration:none;font-weight:600;">
          ${ctaLabel}
        </a>
      </p>
    `
    : ''

  const urlFallbackHtml = ctaUrl
    ? `
      <p style="margin:0 0 8px;font-size:13px;color:#64748b;">If needed, copy this link into your browser:</p>
      <p style="margin:0 0 20px;font-size:13px;word-break:break-all;">
        <a href="${htmlEscape(ctaUrl)}" style="color:#0f172a;">${htmlEscape(ctaUrl)}</a>
      </p>
    `
    : ''

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #dbe2ea;border-radius:18px;">
            <tr>
              <td style="padding:28px 26px;">
                <h1 style="margin:0 0 18px;font-size:28px;line-height:1.25;color:#111827;font-weight:700;">${title}</h1>
                <p style="margin:0 0 16px;font-size:15px;color:#111827;">${greeting}</p>
                <p style="margin:0 0 18px;font-size:15px;color:#374151;">${intro}</p>
                ${detailsHtml}
                ${bodyHtml}
                ${actionHtml}
                ${urlFallbackHtml}
                ${note ? `<p style="margin:0 0 18px;font-size:14px;color:#4b5563;">${note}</p>` : ''}
                <p style="margin:0;font-size:14px;color:#374151;">${closing}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
