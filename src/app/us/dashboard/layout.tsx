import type { ReactNode } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isBillingEligibleUser } from '@/lib/auth/session-user';
import { isUserEmailVerified } from '@/lib/auth/account-verification';
import { NO_INDEX_METADATA } from '@/lib/seo';

export const metadata = NO_INDEX_METADATA;

export default async function UsDashboardLayout({ children }: { children: ReactNode }) {
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

  const emailVerified = await isUserEmailVerified(authUser.id);
  if (!emailVerified) {
    redirect('/auth/verify-email?redirect=%2Fus%2Fdashboard');
  }

  return <>{children}</>;
}
