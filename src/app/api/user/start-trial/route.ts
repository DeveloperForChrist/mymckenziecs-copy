import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Plans now start through checkout. Continue to checkout to choose a plan.',
      code: 'TRIALS_DISABLED',
    },
    { status: 410 }
  );
}
