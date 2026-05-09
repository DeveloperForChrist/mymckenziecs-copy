import NotesPageClient from "@/components/dashboard/NotesPageClient";
import { getDashboardSession } from '@/lib/auth/dashboard-session';
import { getUserPlanData } from '@/lib/payments/user-plan';

const NOTES_READ_ONLY_MESSAGE = "Read-only mode: resume plan to edit notes. Existing notes remain safe.";

export default async function MyCasesPage() {
  const { authUser, emailVerified } = await getDashboardSession();
  let initialReadOnlyMode = false;

  if (authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null, { emailVerified });
    initialReadOnlyMode = !Boolean(planData?.platformAccess ?? planData?.paidAccess);
  }

  return (
    <div className="purple-gradient-bg app-shell">
      <div className="app-container">
        <NotesPageClient
          initialAuthUid={authUser?.id ?? null}
          initialReadOnlyMode={initialReadOnlyMode}
          initialReadOnlyMessage={initialReadOnlyMode ? NOTES_READ_ONLY_MESSAGE : null}
        />
      </div>
    </div>
  );
}
