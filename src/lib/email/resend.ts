type ResendSendEmailParams = {
  to: string | string[];
  subject: string;
  htmlBody?: string;
  textBody?: string;
  tag?: string;
  from?: string;
};

function formatFromAddress(from: string, fallbackName: string) {
  if (!from) return from;
  if (from.includes('<')) return from;
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
  const fromName = process.env.RESEND_FROM_NAME || 'MymckenzieCS';
  const from = formatFromAddress(rawFrom, fromName);

  if (!from) {
    throw new Error('RESEND_FROM_EMAIL (or FROM_EMAIL/SUPPORT_EMAIL/GMAIL_USER fallback) is not defined');
  }

  const resend = new Resend(apiKey);
  const toList = Array.isArray(params.to) ? params.to : [params.to];

  const response = await resend.emails.send({
    from,
    to: toList,
    subject: params.subject,
    html: params.htmlBody,
    text: params.textBody,
    tags: params.tag ? [{ name: params.tag, value: params.tag }] : undefined,
  } as any);

  if (response.error) {
    throw new Error(response.error.message || 'Failed to send email via Resend');
  }

  return response;
}
