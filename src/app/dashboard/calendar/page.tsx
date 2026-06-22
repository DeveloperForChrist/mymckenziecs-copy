import Link from "next/link";
import EnhancedCalendarClient from "@/components/dashboard/EnhancedCalendarClient";
import { getDashboardSession } from '@/lib/auth/dashboard-session';
import { hasReminderAccess } from '@/lib/plans/access';
import { getUserPlanData } from '@/lib/payments/user-plan';
import { getAppRouteForMarket } from '@/lib/markets/app-routes';

export default async function CalendarPage() {
  const { supabase, authUser, emailVerified } = await getDashboardSession();

  let initialHasPaidAccess = false;
  let initialHasReminderAccess = false;
  let initialRemindersEnabled = false;
  let initialPublicMarket: 'GB' | 'US' = 'GB';

  if (authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null, { emailVerified });
    initialPublicMarket = planData?.publicMarket === 'US' ? 'US' : 'GB';
    initialHasPaidAccess = Boolean(planData?.platformAccess ?? planData?.paidAccess);
    initialHasReminderAccess = Boolean(planData?.paidAccess) && hasReminderAccess(planData?.plan || '');

    if (initialHasReminderAccess) {
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('deadline_reminders')
        .eq('user_id', authUser.id)
        .maybeSingle();
      initialRemindersEnabled = prefs?.deadline_reminders === true;
    }
  }

  const dashboardHref = getAppRouteForMarket('/dashboard', initialPublicMarket);

  return (
    <div className="purple-gradient-bg app-shell">
      <div className="app-container">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <Link href={dashboardHref} className="app-button-secondary">
            Go to Dashboard
          </Link>
        </div>
        <EnhancedCalendarClient
          initialAuthUid={authUser?.id ?? null}
          initialHasPaidAccess={initialHasPaidAccess}
          initialPlanChecked={Boolean(authUser)}
          initialHasReminderAccess={initialHasReminderAccess}
          initialRemindersEnabled={initialRemindersEnabled}
        />
      </div>
    </div>
  )
}
