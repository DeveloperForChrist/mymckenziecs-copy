import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from "next/link";
import EnhancedCalendarClient from "@/components/dashboard/EnhancedCalendarClient";
import { hasReminderAccess } from '@/lib/plans/access';
import { getUserPlanData } from '@/lib/payments/user-plan';

export default async function CalendarPage() {
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

  let initialHasPaidAccess = false;
  let initialHasReminderAccess = false;
  let initialRemindersEnabled = false;

  if (authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null);
    initialHasPaidAccess = Boolean(planData?.paidAccess);
    initialHasReminderAccess = initialHasPaidAccess && hasReminderAccess(planData?.plan || '');

    if (initialHasReminderAccess) {
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('deadline_reminders')
        .eq('user_id', authUser.id)
        .maybeSingle();
      initialRemindersEnabled = prefs?.deadline_reminders === true;
    }
  }

  return (
    <div className="purple-gradient-bg app-shell">
      <div className="app-container">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <Link href="/dashboard" className="app-button-secondary">
            Go to Dashboard
          </Link>
        </div>
        <EnhancedCalendarClient
          initialAuthUid={authUser?.id ?? null}
          initialUserEmail={authUser?.email ?? null}
          initialHasPaidAccess={initialHasPaidAccess}
          initialPlanChecked={Boolean(authUser)}
          initialHasReminderAccess={initialHasReminderAccess}
          initialRemindersEnabled={initialRemindersEnabled}
        />
      </div>
    </div>
  )
}
