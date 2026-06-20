import { htmlEscape } from '@/lib/utils/html-escape'
import type { ProfessionalEmailBranding } from '@/lib/email/professional-branding'

type DetailRow = {
  label: string
  value: string
}

type BrandedEmailOptions = {
  branding: ProfessionalEmailBranding
  preheader?: string
  eyebrow?: string
  title: string
  greeting?: string
  intro: string
  detailsTitle?: string
  details?: DetailRow[]
  bodyHtml?: string
  ctaLabel?: string
  ctaUrl?: string
  secondaryCtaLabel?: string
  secondaryCtaUrl?: string
  closing?: string
  note?: string
}

function safeUrl(url: string | null | undefined) {
  const value = String(url || '').trim()
  if (!value) return null
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return null
}

export function renderBrandedEmail(options: BrandedEmailOptions) {
  const preheader = htmlEscape(options.preheader || options.title)
  const eyebrow = htmlEscape(options.eyebrow || 'MyMcKenzieCS')
  const title = htmlEscape(options.title)
  const greeting = htmlEscape(options.greeting || 'Hello,')
  const intro = htmlEscape(options.intro)
  const detailsTitle = options.detailsTitle ? htmlEscape(options.detailsTitle) : ''
  const details = Array.isArray(options.details) ? options.details : []
  const ctaLabel = options.ctaLabel ? htmlEscape(options.ctaLabel) : ''
  const ctaUrl = safeUrl(options.ctaUrl)
  const secondaryCtaLabel = options.secondaryCtaLabel ? htmlEscape(options.secondaryCtaLabel) : ''
  const secondaryCtaUrl = safeUrl(options.secondaryCtaUrl)
  const closing = htmlEscape(options.closing || `Kind regards,\n${options.branding.businessName}`)
    .replace(/\n/g, '<br />')
  const note = options.note ? htmlEscape(options.note) : ''

  const businessName = htmlEscape(options.branding.businessName)
  const logoUrl = safeUrl(options.branding.logoUrl)
  const heroImageUrl = safeUrl(options.branding.heroImageUrl)
  const contactEmail = options.branding.contactEmail ? htmlEscape(options.branding.contactEmail) : ''
  const website = safeUrl(options.branding.website)

  const detailsHtml = details.length
    ? `
      <div style="background:#f8fbff;border:1px solid #d7e3f4;border-radius:16px;padding:18px 20px;margin:0 0 22px;">
        ${detailsTitle ? `<p style="margin:0 0 10px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">${detailsTitle}</p>` : ''}
        ${details.map((row) => `
          <p style="margin:0 0 8px;font-size:15px;color:#334155;">
            <strong>${htmlEscape(row.label)}:</strong> ${htmlEscape(row.value)}
          </p>
        `).join('')}
      </div>
    `
    : ''

  const bodyHtml = options.bodyHtml ? `<div style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.7;">${options.bodyHtml}</div>` : ''

  const actionHtml = ctaUrl && ctaLabel
    ? `
      <p style="margin:0 0 18px;">
        <a href="${htmlEscape(ctaUrl)}" style="display:inline-block;background:#123a78;color:#ffffff;text-decoration:none;padding:13px 18px;border-radius:12px;font-weight:700;border:1px solid #0f2f60;">
          ${ctaLabel}
        </a>
      </p>
    `
    : ''

  const secondaryActionHtml = secondaryCtaUrl && secondaryCtaLabel
    ? `
      <p style="margin:0 0 22px;">
        <a href="${htmlEscape(secondaryCtaUrl)}" style="color:#123a78;text-decoration:underline;font-size:14px;font-weight:600;">
          ${secondaryCtaLabel}
        </a>
      </p>
    `
    : ''

  const urlFallbackHtml = ctaUrl
    ? `
      <p style="margin:0 0 10px;font-size:13px;color:#64748b;">If the button does not work, copy this link into your browser:</p>
      <p style="margin:0 0 22px;font-size:13px;word-break:break-all;">
        <a href="${htmlEscape(ctaUrl)}" style="color:#123a78;">${htmlEscape(ctaUrl)}</a>
      </p>
    `
    : ''

  const footerMeta = [
    website ? `<a href="${htmlEscape(website)}" style="color:#64748b;text-decoration:none;">${htmlEscape(website)}</a>` : '',
    contactEmail ? `<a href="mailto:${contactEmail}" style="color:#64748b;text-decoration:none;">${contactEmail}</a>` : '',
  ].filter(Boolean).join(' &nbsp;|&nbsp; ')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef3f9;font-family:Arial,Helvetica,sans-serif;color:#102033;line-height:1.6;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f9;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #d9e4f2;box-shadow:0 18px 54px rgba(15,23,42,.10);">
            <tr>
              <td style="padding:0;background:linear-gradient(135deg,#0f1b2d 0%,#123a78 100%);">
                <div style="padding:24px 26px 22px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c8d8f2;font-weight:700;">${eyebrow}</div>
                        <h1 style="margin:8px 0 0;font-size:28px;line-height:1.2;color:#ffffff;">${title}</h1>
                        <p style="margin:10px 0 0;font-size:15px;line-height:1.5;color:#dbe7f6;">${businessName}</p>
                      </td>
                      <td align="right" style="vertical-align:middle;padding-left:16px;">
                        ${logoUrl ? `<img src="${htmlEscape(logoUrl)}" alt="${businessName} logo" width="68" height="68" style="display:block;width:68px;height:68px;object-fit:cover;border-radius:18px;border:2px solid rgba(255,255,255,.18);" />` : ''}
                      </td>
                    </tr>
                  </table>
                </div>
                ${heroImageUrl ? `<img src="${htmlEscape(heroImageUrl)}" alt="${businessName}" style="display:block;width:100%;max-height:220px;object-fit:cover;" />` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 26px 30px;">
                <p style="margin:0 0 16px;font-size:16px;color:#102033;">${greeting}</p>
                <p style="margin:0 0 18px;font-size:15px;color:#334155;">${intro}</p>
                ${detailsHtml}
                ${bodyHtml}
                ${actionHtml}
                ${secondaryActionHtml}
                ${urlFallbackHtml}
                ${note ? `<p style="margin:0 0 18px;font-size:14px;color:#475569;">${note}</p>` : ''}
                <p style="margin:0;font-size:14px;color:#334155;">${closing}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 26px 24px;border-top:1px solid #e5edf7;background:#fbfdff;">
                <p style="margin:0 0 6px;font-size:12px;color:#64748b;letter-spacing:.08em;text-transform:uppercase;font-weight:700;">Sent via MyMcKenzieCS</p>
                <p style="margin:0;font-size:13px;color:#64748b;">${footerMeta || businessName}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
