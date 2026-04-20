import { Suspense } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import SettingsPageClient from '@/components/settings/SettingsPageClient';
import { getUserPlanData } from '@/lib/payments/user-plan';
import { isBillingEligibleUser } from '@/lib/auth/session-user';

export default async function UsSettingsPage() {
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
    redirect('/auth/signin?redirect=/us/settings');
  }

  const initialBillingPlan = await getUserPlanData(authUser.id, authUser.email ?? null);
  return (
    <Suspense fallback={null}>
      <SettingsPageClient initialBillingPlan={initialBillingPlan} />
    </Suspense>
  );
}
