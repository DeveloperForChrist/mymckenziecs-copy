import DashboardHomeClient from '@/components/dashboard/DashboardHomeClient';
import { getUserPlanData } from '@/lib/payments/user-plan';
import { getDashboardSession } from '@/lib/auth/dashboard-session';

export default async function DashboardPage() {
  const { authUser, emailVerified } = await getDashboardSession();

  let initialPlan = 'No plan';
  let initialPlanStatus = 'inactive';
  let initialNextBillingDate: string | null = null;
  let initialEmailVerified = emailVerified;
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
