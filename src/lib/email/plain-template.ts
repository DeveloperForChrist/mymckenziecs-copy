import { htmlEscape } from '@/lib/utils/html-escape'

type DetailRow = {
  label: string
  value: string
}

export type PlainEmailOptions = {
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
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-collapse:collapse;border-top:1px solid #d9e2ec;border-bottom:1px solid #d9e2ec;">
        ${detailsTitle ? `
          <tr>
            <td colspan="2" style="padding:14px 0 8px;font-size:12px;font-weight:700;color:#3b4a5a;text-transform:uppercase;letter-spacing:.08em;">${detailsTitle}</td>
          </tr>
        ` : ''}
        ${details.map((row) => `
          <tr>
            <td style="width:34%;padding:9px 16px 9px 0;border-top:1px solid #edf2f7;font-size:13px;color:#5b6775;font-weight:700;vertical-align:top;">${htmlEscape(row.label)}</td>
            <td style="padding:9px 0;border-top:1px solid #edf2f7;font-size:14px;color:#17202a;vertical-align:top;">${htmlEscape(row.value)}</td>
          </tr>
        `).join('')}
      </table>
    `
    : ''

  const bodyHtml = options.bodyHtml
    ? `<div style="margin:0 0 20px;color:#1f2937;font-size:15px;line-height:1.7;">${options.bodyHtml}</div>`
    : ''

  const actionHtml = ctaUrl && ctaLabel
    ? `
      <p style="margin:0 0 22px;">
        <a href="${htmlEscape(ctaUrl)}" style="display:inline-block;padding:12px 16px;border:1px solid #17324d;background:#17324d;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;line-height:1.2;">
          ${ctaLabel}
        </a>
      </p>
    `
    : ''

  const urlFallbackHtml = ctaUrl
    ? `
      <p style="margin:0 0 8px;font-size:13px;color:#64748b;">If the button does not open, copy this secure link into your browser:</p>
      <p style="margin:0 0 20px;font-size:13px;word-break:break-all;">
        <a href="${htmlEscape(ctaUrl)}" style="color:#0f2f4a;">${htmlEscape(ctaUrl)}</a>
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
  <body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#17202a;line-height:1.6;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" data-mymckenziecs-email="plain">
      <tr>
        <td align="center" style="padding:0 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;">
            <tr>
              <td style="padding:30px 0 18px;border-bottom:2px solid #17324d;">
                <p style="margin:0;font-size:18px;font-weight:800;letter-spacing:.01em;color:#17324d;">MyMcKenzieCS</p>
                <p style="margin:4px 0 0;font-size:12px;color:#5b6775;letter-spacing:.08em;text-transform:uppercase;">Secure legal case workspace</p>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 0 26px;">
                <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;color:#17202a;font-weight:800;letter-spacing:-.01em;">${title}</h1>
                <p style="margin:0 0 16px;font-size:15px;color:#17202a;">${greeting}</p>
                <p style="margin:0 0 20px;font-size:15px;color:#344054;">${intro}</p>
                ${detailsHtml}
                ${bodyHtml}
                ${actionHtml}
                ${urlFallbackHtml}
                ${note ? `<p style="margin:0 0 20px;padding:0 0 0 12px;border-left:3px solid #98a6b3;font-size:14px;color:#4b5563;">${note}</p>` : ''}
                <p style="margin:0;font-size:14px;color:#344054;">${closing}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 0 34px;border-top:1px solid #d9e2ec;">
                <p style="margin:0 0 6px;font-size:12px;color:#667085;">This transactional email was sent by MyMcKenzieCS in relation to your account, workspace, billing, client portal, meeting, or security activity.</p>
                <p style="margin:0;font-size:12px;color:#667085;">For security, do not forward sign-in, password, billing, or portal links to anyone you do not trust.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function renderPlainEmailText(options: PlainEmailOptions) {
  const lines = [
    options.title,
    '',
    options.greeting || 'Hello,',
    '',
    options.intro,
    '',
  ]

  if (options.details?.length) {
    if (options.detailsTitle) {
      lines.push(options.detailsTitle, '')
    }
    for (const row of options.details) {
      lines.push(`${row.label}: ${row.value}`)
    }
    lines.push('')
  }

  if (options.ctaLabel && options.ctaUrl) {
    lines.push(`${options.ctaLabel}:`, options.ctaUrl, '')
  }

  if (options.note) {
    lines.push(options.note, '')
  }

  lines.push(options.closing || 'Kind regards,\nMyMcKenzieCS')

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
