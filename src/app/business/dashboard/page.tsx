import type { Metadata } from 'next';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import BusinessDashboardClient from '@/components/business/BusinessDashboardClient';
import { isBillingEligibleUser } from '@/lib/auth/session-user';
import { getAccountTypeForUser } from '@/lib/auth/account-type';
import { NO_INDEX_METADATA } from '@/lib/seo';
import type { InitialChatPlanState } from '@/components/chatbot/hooks/useChatAuthPlan';

export const metadata: Metadata = {
  ...NO_INDEX_METADATA,
  title: 'Business Dashboard',
};

export default async function BusinessDashboardPage() {
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
    redirect('/auth/signin?redirect=/business/dashboard');
  }

  if (await getAccountTypeForUser(authUser) !== 'business') {
    redirect('/dashboard');
  }

  const initialAuthPlan: InitialChatPlanState = {
    userId: authUser.id,
    plan: 'Premium +',
    planStatus: 'active',
    paidAccess: true,
    platformAccess: true,
  };

  return <BusinessDashboardClient initialChatPlan={initialAuthPlan} />;
}
