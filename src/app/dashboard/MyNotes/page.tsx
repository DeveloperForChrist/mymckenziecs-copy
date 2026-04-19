import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import NotesPageClient from "@/components/dashboard/NotesPageClient";
import { getUserPlanData } from '@/lib/payments/user-plan';

const NOTES_READ_ONLY_MESSAGE = "Read-only mode: resume plan to edit notes. Existing notes remain safe.";

export default async function MyCasesPage() {
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
  let initialReadOnlyMode = false;

  if (authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null);
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
