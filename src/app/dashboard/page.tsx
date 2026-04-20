import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardHomeClient from '@/components/dashboard/DashboardHomeClient';
import { getUserPlanData } from '@/lib/payments/user-plan';
import { isUserEmailVerified } from '@/lib/auth/account-verification';
import { getUserLegalContext, isCaseLawAvailableForLegalContext } from '@/lib/legal/user-context';

export default async function DashboardPage() {
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

  let initialPlan = 'No plan';
  let initialPlanStatus = 'inactive';
  let initialNextBillingDate: string | null = null;
  let initialEmailVerified = false;
  let initialHasStripeCustomer = false;
  let initialCancelAtPeriodEnd = false;
  let initialCaseLawAvailable = false;
  let initialPublicMarket: 'GB' | 'US' = 'GB';
  const initialPlanLoaded = Boolean(authUser);

  if (authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null);
    const legalContext = await getUserLegalContext(authUser.id, authUser.user_metadata as any);
    initialPlan = (planData?.plan || 'No plan').toString();
    initialPlanStatus = (planData?.planStatus || 'inactive').toString().trim().toLowerCase();
    initialNextBillingDate =
      typeof planData?.nextBillingDate === 'string' ? planData.nextBillingDate : null;
    initialHasStripeCustomer = Boolean(planData?.hasStripeCustomer);
    initialCancelAtPeriodEnd = Boolean(planData?.cancelAtPeriodEnd);
    initialPublicMarket = planData?.publicMarket === 'US' ? 'US' : 'GB';
    initialCaseLawAvailable = isCaseLawAvailableForLegalContext(legalContext);
    initialEmailVerified = await isUserEmailVerified(authUser.id);
  }

  return (
    <DashboardHomeClient
      initialEmailVerified={initialEmailVerified}
      initialPlan={initialPlan}
      initialPlanStatus={initialPlanStatus}
      initialNextBillingDate={initialNextBillingDate}
      initialHasStripeCustomer={initialHasStripeCustomer}
      initialCancelAtPeriodEnd={initialCancelAtPeriodEnd}
      initialCaseLawAvailable={initialCaseLawAvailable}
      initialPlanLoaded={initialPlanLoaded}
      initialPublicMarket={initialPublicMarket}
    />
  );
}
