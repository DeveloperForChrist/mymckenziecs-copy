import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from 'next/link';
import CaseLawSearchPageClient from '@/components/dashboard/CaseLawSearchPageClient';
import { getUserPlanData } from '@/lib/payments/user-plan';
import { getUserLegalContext, isCaseLawAvailableForLegalContext } from '@/lib/legal/user-context';

export default async function CaseLawSearchPage() {
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

  let initialUserPlan = 'guest';
  let initialHasPaidAccess = false;
  const initialPlanChecked = Boolean(authUser);

  if (authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null);
    const legalContext = await getUserLegalContext(authUser.id, authUser.user_metadata as any);
    const caseLawAvailable = isCaseLawAvailableForLegalContext(legalContext);

    if (!caseLawAvailable) {
      return (
        <div style={{ background: 'linear-gradient(135deg, #240724 0%, #240724 50%, #240724 100%)', minHeight: '100vh' }}>
          <main style={{ color: '#ffffff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <section
              style={{
                width: '100%',
                maxWidth: '720px',
                borderRadius: '20px',
                border: '1px solid rgba(251, 191, 36, 0.35)',
                background: 'linear-gradient(135deg, rgba(92, 53, 10, 0.35), rgba(59, 34, 6, 0.28))',
                padding: '28px',
              }}
            >
              <h1 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 700, color: '#fde68a' }}>
                Case law tools are not available for U.S. matters yet
              </h1>
              <p style={{ margin: '12px 0 0', color: '#fef3c7', lineHeight: 1.6 }}>
                We are still filling the U.S. case-law database. For now, case-law search and case-law study are available only for UK legal matters.
              </p>
              <div style={{ marginTop: '18px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <Link
                  href="/dashboard"
                  style={{
                    textDecoration: 'none',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.12)',
                    color: '#fff',
                    padding: '10px 16px',
                    fontWeight: 700,
                    border: '1px solid rgba(255,255,255,0.22)',
                  }}
                >
                  Back to dashboard
                </Link>
                <Link
                  href="/chatbot"
                  style={{
                    textDecoration: 'none',
                    borderRadius: '999px',
                    background: 'linear-gradient(135deg, #7bd4c9, #3aa79d)',
                    color: '#052a27',
                    padding: '10px 16px',
                    fontWeight: 700,
                  }}
                >
                  Open assistant
                </Link>
              </div>
            </section>
          </main>
        </div>
      );
    }

    initialUserPlan = (planData?.plan || 'guest').toString();
    initialHasPaidAccess = Boolean(planData?.paidAccess);
  }

  return (
    <CaseLawSearchPageClient
      initialUserPlan={initialUserPlan}
      initialHasPaidAccess={initialHasPaidAccess}
      initialPlanChecked={initialPlanChecked}
    />
  );
}
