import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isBillingEligibleUser } from '@/lib/auth/session-user';
import { getUserPlanData } from '@/lib/payments/user-plan';
import { isUserEmailVerified } from '@/lib/auth/account-verification';
import { NO_INDEX_METADATA } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const metadata = NO_INDEX_METADATA;

export default async function UsWorkspacePage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // No-op in server component render context.
        },
      },
    }
  );

  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user;

  if (!authUser || !isBillingEligibleUser(authUser)) {
    redirect('/auth/signin?redirect=/us/dashboard');
  }

  const planData = await getUserPlanData(authUser.id, authUser.email ?? null);
  if (planData.paidAccess) {
    redirect('/us/dashboard');
  }

  const emailVerified = await isUserEmailVerified(authUser.id);
  if (emailVerified) {
    redirect('/us/dashboard');
  }

  redirect('/auth/verify-email?redirect=%2Fus%2Fdashboard');
}
