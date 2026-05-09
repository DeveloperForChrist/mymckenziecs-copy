import { Suspense } from 'react';
import DocumentsClientNew from "@/components/dashboard/DocumentsClientNew";
import { getDashboardSession } from '@/lib/auth/dashboard-session';
import { getUserPlanData } from '@/lib/payments/user-plan';

export default async function DocumentsPage() {
  const { authUser, isEligible, emailVerified } = await getDashboardSession();
  const initialPlanLoaded = Boolean(isEligible);
  let initialCanUpload = false;

  if (isEligible && authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null, { emailVerified });
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
