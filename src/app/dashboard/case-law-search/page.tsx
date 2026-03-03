import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import CaseLawSearchPageClient from '@/components/dashboard/CaseLawSearchPageClient';
import { getUserPlanData } from '@/lib/payments/user-plan';

export default async function CaseLawSearchPage() {
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

  let initialUserPlan = 'guest';
  let initialHasPaidAccess = false;
  const initialPlanChecked = Boolean(authUser);

  if (authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null);
    initialUserPlan = (planData?.plan || 'guest').toString();
    initialHasPaidAccess = Boolean(planData?.paidAccess);
  }

  return (
    <CaseLawSearchPageClient
      initialUserPlan={initialUserPlan}
      initialHasPaidAccess={initialHasPaidAccess}
      initialPlanChecked={initialPlanChecked}
    />
  );
}
