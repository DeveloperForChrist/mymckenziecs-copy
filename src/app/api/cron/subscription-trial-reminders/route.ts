import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = (request.headers.get('x-cron-secret') || request.headers.get('authorization') || '')
    .replace(/^Bearer\s+/i, '');

  if (!cronSecret) {
    console.error('CRON_SECRET is not configured for subscription-trial-reminders cron route');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }

  if (headerSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    disabled: true,
    message: 'Subscription trial reminders are disabled because trials are no longer offered.',
  });
}
