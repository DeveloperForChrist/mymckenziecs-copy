import Link from 'next/link';
import CaseLawSearchPageClient from '@/components/dashboard/CaseLawSearchPageClient';
import { getDashboardSession } from '@/lib/auth/dashboard-session';
import { getUserPlanData } from '@/lib/payments/user-plan';
import { getAppRouteForMarket } from '@/lib/markets/app-routes';

export default async function CaseLawSearchPage() {
  const { authUser, emailVerified } = await getDashboardSession();

  let initialUserPlan = 'guest';
  let initialHasPaidAccess = false;
  const initialPlanChecked = Boolean(authUser);
  let initialPublicMarket: 'GB' | 'US' = 'GB';

  if (authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null, { emailVerified });
    initialPublicMarket = planData?.publicMarket === 'US' ? 'US' : 'GB';
    const caseLawAvailable = Boolean(planData?.caseLawAvailable);
    const dashboardHref = getAppRouteForMarket('/dashboard', initialPublicMarket);
    const chatbotHref = getAppRouteForMarket('/chatbot', initialPublicMarket);

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
                  href={dashboardHref}
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
                  href={chatbotHref}
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
      initialPublicMarket={initialPublicMarket}
    />
  );
}
