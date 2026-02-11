import { Resend } from 'resend';
import path from 'path';
import resendSender, { renderTemplate } from '../resendSender';

const RESEND_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.FROM_EMAIL || 'noreply@yourdomain';
const resend = new Resend(RESEND_KEY);

async function singleSendExample() {
  const templatePath = path.join(__dirname, '..', 'templates', 'deadline-3days.html');
  const html = renderTemplate(templatePath, {
    name: 'Alex',
    case_title: 'State v. Smith',
    deadline_title: 'Motion to Dismiss Due',
    deadline_time: '09:00',
    deadline_notes: 'Draft ready; need final review.',
    deadline_priority: 'medium',
    deadline_date: '2026-03-01',
    days_left: '3',
    action_url: 'https://www.mymckenziecs.com/cases/123',
  });

  // Using the Resend SDK directly (matches dashboard example)
  const res = await resend.emails.send({
    from: FROM,
    to: 'recipient@example.com',
    subject: '3 days until your deadline',
    html,
  });
  console.log('Resend single send response:', res);

  // Or use the helper wrapper
  // await resendSender.send({ to: 'recipient@example.com', subject: '3 days until your deadline', templatePath, vars: { ... } });
}

async function batchSendExample() {
  // Batch send multiple recipients (Resend batch API)
  const templatePath = path.join(__dirname, '..', 'templates', '01-welcome.html');
  const htmlForA = renderTemplate(templatePath, { name: 'Alice', cta_url: 'https://www.mymckenziecs.com/start' });
  const htmlForB = renderTemplate(templatePath, { name: 'Bob', cta_url: 'https://www.mymckenziecs.com/start' });

  const batchRes = await resend.batch.send([
    { from: FROM, to: ['alice@example.com'], subject: 'Welcome to MyMcKenzie', html: htmlForA },
    { from: FROM, to: ['bob@example.com'], subject: 'Welcome to MyMcKenzie', html: htmlForB },
  ]);
  console.log('Resend batch response:', batchRes);
}

async function main() {
  if (!RESEND_KEY) {
    console.warn('RESEND_API_KEY not set — this is a dry-run example showing usage only.');
    return;
  }

  await singleSendExample();
  await batchSendExample();
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
