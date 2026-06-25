import { renderPlainEmail, renderPlainEmailText } from '@/lib/email/plain-template';
import { htmlEscape } from '@/lib/utils/html-escape';

type ResendSendEmailParams = {
  to: string | string[];
  subject: string;
  htmlBody?: string;
  textBody?: string;
  tag?: string;
  from?: string;
  fromName?: string;
  replyTo?: string | string[];
  attachments?: ResendEmailAttachment[];
};

const APPROVED_EMAIL_MARKER = 'data-mymckenziecs-email="plain"';

function decodeBasicEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function stripHtml(value: string) {
  return decodeBasicEntities(
    String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

function extractTitleFromHtml(html: string, fallback: string) {
  const heading = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1]
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return stripHtml(heading || title || fallback).trim() || fallback
}

function extractLinks(html: string) {
  const links: Array<{ label: string; url: string }> = []
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(html)) && links.length < 3) {
    const url = String(match[1] || '').trim()
    const label = stripHtml(match[2] || '').trim()
    if ((url.startsWith('http://') || url.startsWith('https://')) && label) {
      links.push({ label, url })
    }
  }
  return links
}

function normalizeLegacyHtml(subject: string, htmlBody?: string, textBody?: string) {
  const rawHtml = String(htmlBody || '').trim()
  if (!rawHtml) return { htmlBody, textBody }
  if (rawHtml.includes(APPROVED_EMAIL_MARKER)) {
    return {
      htmlBody,
      textBody: textBody || stripHtml(rawHtml),
    }
  }

  const title = extractTitleFromHtml(rawHtml, subject)
  const links = extractLinks(rawHtml)
  const plain = stripHtml(rawHtml)
  const withoutTitle = plain.startsWith(title) ? plain.slice(title.length).trim() : plain
  const lines = withoutTitle.split('\n').map((line) => line.trim()).filter(Boolean)
  const greetingIndex = lines.findIndex((line) => /^(hi|hello|dear)\b/i.test(line))
  const greeting = greetingIndex >= 0 ? lines[greetingIndex] : 'Hello,'
  const contentLines = lines
    .filter((line, index) => index !== greetingIndex)
    .filter((line) => !/^mymckenziecs$/i.test(line))
    .filter((line) => !links.some((link) => line === link.label || line === link.url))

  const intro = contentLines.shift() || 'This is a transactional notification from MyMcKenzieCS.'
  const bodyText = contentLines.join('\n\n').trim()
  const primaryLink = links[0]
  const normalized = {
    preheader: intro,
    title,
    greeting,
    intro,
    bodyHtml: bodyText
      ? `<div style="margin:0 0 20px;">${bodyText
          .split('\n\n')
          .map((paragraph) => `<p style="margin:0 0 14px;">${htmlEscape(paragraph).replace(/\n/g, '<br />')}</p>`)
          .join('')}</div>`
      : undefined,
    ctaLabel: primaryLink?.label,
    ctaUrl: primaryLink?.url,
    note: links.length > 1
      ? `Additional links in the original notification: ${links.slice(1).map((link) => `${link.label} (${link.url})`).join('; ')}`
      : undefined,
    closing: 'Kind regards,\nThe MyMcKenzieCS team',
  }

  return {
    htmlBody: renderPlainEmail(normalized),
    textBody: textBody || renderPlainEmailText(normalized),
  }
}

export type ResendEmailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

function formatFromAddress(from: string, fallbackName?: string) {
  if (!from) return from;
  if (from.includes('<')) return from;
  if (!fallbackName) return from;
  return `${fallbackName} <${from}>`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not defined`);
  }
  return value;
}

export async function sendResendEmail(params: ResendSendEmailParams) {
  const { Resend } = await import('resend');

  const apiKey = requireEnv('RESEND_API_KEY');
  const rawFrom =
    params.from ||
    process.env.RESEND_FROM_EMAIL ||
    process.env.FROM_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    process.env.GMAIL_USER ||
    'noreply@mymckenziecs.com';
  const fromName = params.fromName || process.env.RESEND_FROM_NAME || 'MyMcKenzieCS';
  const from = formatFromAddress(rawFrom, fromName);

  if (!from) {
    throw new Error('RESEND_FROM_EMAIL (or FROM_EMAIL/SUPPORT_EMAIL/GMAIL_USER fallback) is not defined');
  }

  const resend = new Resend(apiKey);
  const toList = Array.isArray(params.to) ? params.to : [params.to];
  const normalizedEmail = normalizeLegacyHtml(params.subject, params.htmlBody, params.textBody);

  const emailPayload = {
    from,
    to: toList,
    subject: params.subject,
    html: normalizedEmail.htmlBody,
    text: normalizedEmail.textBody,
    replyTo: params.replyTo,
    attachments: params.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: Buffer.isBuffer(attachment.content)
        ? attachment.content.toString('base64')
        : attachment.content,
      contentType: attachment.contentType,
    })),
    tags: params.tag ? [{ name: params.tag, value: params.tag }] : undefined,
  };

  const response = await resend.emails.send(emailPayload as unknown as Parameters<typeof resend.emails.send>[0]);

  if (response.error) {
    throw new Error(response.error.message || 'Failed to send email via Resend');
  }

  return response;
}
