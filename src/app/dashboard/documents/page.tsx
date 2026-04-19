import { Suspense } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DocumentsClientNew from "@/components/dashboard/DocumentsClientNew";
import { isBillingEligibleUser } from '@/lib/auth/session-user';
import { getUserPlanData } from '@/lib/payments/user-plan';

export default async function DocumentsPage() {
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
  const isEligible = isBillingEligibleUser(authUser);
  const initialPlanLoaded = Boolean(isEligible);
  let initialCanUpload = false;

  if (isEligible && authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null);
    initialCanUpload = Boolean(planData?.platformAccess ?? planData?.paidAccess);
  }

  return (
    <div className="purple-gradient-bg app-shell">
      <div className="app-container">
        <Suspense fallback={null}>
          <DocumentsClientNew initialCanUpload={initialCanUpload} initialPlanLoaded={initialPlanLoaded} />
        </Suspense>
      </div>
    </div>
  );
}
