import DashboardHomeClient from '@/components/dashboard/DashboardHomeClient';
import { getUserPlanData } from '@/lib/payments/user-plan';
import { getAccountTypeForUser } from '@/lib/auth/account-type';
import { getDashboardEntryState } from '@/lib/auth/server-workspace-routes';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const { session, redirectPath } = await getDashboardEntryState('/dashboard');
  if (redirectPath) {
    redirect(redirectPath);
  }

  const { authUser, emailVerified } = session;

  if (authUser && await getAccountTypeForUser(authUser) === 'business') {
    redirect('/business/dashboard');
  }

  let initialPlan = 'No plan';
  let initialPlanStatus = 'inactive';
  let initialNextBillingDate: string | null = null;
  const initialEmailVerified = emailVerified;
  let initialHasStripeCustomer = false;
  let initialCancelAtPeriodEnd = false;
  let initialCaseLawAvailable = false;
  let initialPublicMarket: 'GB' | 'US' = 'GB';
  const initialPlanLoaded = Boolean(authUser);

  if (authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null, { emailVerified });
    initialPlan = (planData?.plan || 'No plan').toString();
    initialPlanStatus = (planData?.planStatus || 'inactive').toString().trim().toLowerCase();
    initialNextBillingDate =
      typeof planData?.nextBillingDate === 'string' ? planData.nextBillingDate : null;
    initialHasStripeCustomer = Boolean(planData?.hasStripeCustomer);
    initialCancelAtPeriodEnd = Boolean(planData?.cancelAtPeriodEnd);
    initialPublicMarket = planData?.publicMarket === 'US' ? 'US' : 'GB';
    initialCaseLawAvailable = Boolean(planData?.caseLawAvailable);
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
