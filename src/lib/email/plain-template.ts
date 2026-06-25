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
      <div style="margin:0 0 24px;padding:18px 20px;border:1px solid #d8e0ea;border-radius:14px;background:#f8fafc;">
        ${detailsTitle ? `<p style="margin:0 0 12px;font-size:12px;font-weight:800;color:#31516f;text-transform:uppercase;letter-spacing:.08em;">${detailsTitle}</p>` : ''}
        ${details.map((row) => `
          <p style="margin:0 0 8px;font-size:14px;color:#243447;">
            <strong style="color:#0f2236;">${htmlEscape(row.label)}:</strong> ${htmlEscape(row.value)}
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
      <p style="margin:0 0 20px;">
        <a href="${htmlEscape(ctaUrl)}" style="display:inline-block;padding:14px 20px;border-radius:12px;border:1px solid #193957;background:#0f2f4a;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:.01em;">
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
  <body style="margin:0;padding:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #d8e0ea;border-radius:20px;overflow:hidden;box-shadow:0 18px 48px rgba(15,47,74,.10);">
            <tr>
              <td style="padding:22px 26px;background:#0f2f4a;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;font-size:16px;font-weight:800;letter-spacing:.02em;color:#ffffff;">MyMcKenzieCS</p>
                      <p style="margin:4px 0 0;font-size:12px;color:#b9d5e8;letter-spacing:.08em;text-transform:uppercase;">Secure case workspace</p>
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <span style="display:inline-block;padding:6px 10px;border:1px solid rgba(255,255,255,.24);border-radius:999px;color:#dff4ff;font-size:12px;font-weight:700;">Account notice</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 28px;">
                <h1 style="margin:0 0 18px;font-size:28px;line-height:1.2;color:#0f2236;font-weight:800;letter-spacing:-.02em;">${title}</h1>
                <p style="margin:0 0 16px;font-size:15px;color:#0f2236;">${greeting}</p>
                <p style="margin:0 0 20px;font-size:15px;color:#3f5368;">${intro}</p>
                ${detailsHtml}
                ${bodyHtml}
                ${actionHtml}
                ${urlFallbackHtml}
                ${note ? `<p style="margin:0 0 20px;padding:14px 16px;border-left:3px solid #77b7d7;background:#f4f8fb;font-size:14px;color:#40566d;">${note}</p>` : ''}
                <p style="margin:0;font-size:14px;color:#3f5368;">${closing}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e3e9f0;">
                <p style="margin:0 0 6px;font-size:12px;color:#60758a;">This transactional email was sent by MyMcKenzieCS in relation to your account, workspace, or client portal activity.</p>
                <p style="margin:0;font-size:12px;color:#60758a;">For your security, never share account links with anyone you do not trust.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
