'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AccountSection from '@/components/settings/AccountSection';
import BillingSection from '@/components/settings/BillingSection';
import ContactSection from '@/components/settings/ContactSection';
import MeetingReminderSection from '@/components/settings/MeetingReminderSection';
import SettingsSidebar from '@/components/settings/SettingsSidebar';
import styles from '@/components/settings/settingsPage.module.css';
import { getAppRouteForMarket } from '@/lib/markets/app-routes';

type InitialBillingPlan = {
  plan?: string;
  planStatus?: string;
  planPrice?: string | number;
  planCurrencySymbol?: string;
  publicMarket?: 'GB' | 'US';
  nextBillingDate?: any;
  hasStripeCustomer?: boolean;
  paidAccess?: boolean;
  cancelAtPeriodEnd?: boolean;
  canResume?: boolean;
  archiveAt?: string | null;
  deleteAt?: string | null;
};

export default function SettingsPageClient({
  initialBillingPlan,
  dashboardHrefOverride,
  mode = 'standalone',
}: {
  initialBillingPlan: InitialBillingPlan | null;
  dashboardHrefOverride?: string;
  mode?: 'standalone' | 'embedded';
}) {
  const searchParams = useSearchParams();
  const publicMarket = initialBillingPlan?.publicMarket === 'US' ? 'US' : 'GB';
  const dashboardHref = dashboardHrefOverride || getAppRouteForMarket('/dashboard', publicMarket);
  const isEmbedded = mode === 'embedded';

  const requestedTab = useMemo(() => {
    const raw = (searchParams?.get('tab') || searchParams?.get('section') || '').trim().toLowerCase();
    if (raw === 'billing' || raw === 'contact' || raw === 'account' || raw === 'reminders') return raw;
    return 'account';
  }, [searchParams]);
  const [active, setActive] = useState(requestedTab);

  useEffect(() => {
    setActive(requestedTab);
  }, [requestedTab]);

  const setActiveAndSyncUrl = (next: string) => {
    setActive(next);
    if (isEmbedded) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // ignore
    }
  };

  const headerByTab: Record<string, { title: string; desc: string }> = {
    account: {
      title: 'Account Settings',
      desc: 'Manage your personal details, security, and preferences',
    },
    billing: {
      title: 'Billing & Plans',
      desc: 'Review your current subscription and payment methods',
    },
    reminders: {
      title: 'Meeting Reminders',
      desc: 'Choose how far in advance you want meeting reminders to go out',
    },
    contact: {
      title: publicMarket === 'US' ? 'U.S. Support' : 'Contact Us',
      desc:
        publicMarket === 'US'
          ? 'Reach the MyMcKenzieCS team for U.S. rollout, billing, account, and workspace support.'
          : 'Reach the MyMcKenzieCS team for help and support',
    },
  };
  const currentHeader = headerByTab[active] || headerByTab.account;

  return (
    <div className={isEmbedded ? styles.embeddedRoot : 'purple-gradient-bg app-shell'}>
      <div className={isEmbedded ? styles.embeddedContainer : 'app-container'}>
        <div className={styles.settingsContainer}>
          {isEmbedded ? (
            <nav className={styles.embeddedTabs} aria-label="Settings sections">
              <button
                type="button"
                className={`${styles.embeddedTab} ${active === 'account' ? styles.embeddedTabActive : ''}`}
                onClick={() => setActiveAndSyncUrl('account')}
                aria-current={active === 'account' ? 'page' : undefined}
              >
                Account
              </button>
              <button
                type="button"
                className={`${styles.embeddedTab} ${active === 'billing' ? styles.embeddedTabActive : ''}`}
                onClick={() => setActiveAndSyncUrl('billing')}
                aria-current={active === 'billing' ? 'page' : undefined}
              >
                Billing
              </button>
              <button
                type="button"
                className={`${styles.embeddedTab} ${active === 'reminders' ? styles.embeddedTabActive : ''}`}
                onClick={() => setActiveAndSyncUrl('reminders')}
                aria-current={active === 'reminders' ? 'page' : undefined}
              >
                Reminders
              </button>
              <button
                type="button"
                className={`${styles.embeddedTab} ${active === 'contact' ? styles.embeddedTabActive : ''}`}
                onClick={() => setActiveAndSyncUrl('contact')}
                aria-current={active === 'contact' ? 'page' : undefined}
              >
                Support
              </button>
            </nav>
          ) : (
            <SettingsSidebar active={active} onSelect={setActiveAndSyncUrl} publicMarket={publicMarket} />
          )}
          <main className={styles.mainContent}>
            {!isEmbedded ? (
              <div className={styles.topActions}>
                <Link href={dashboardHref} className="app-button-secondary">
                  Go to Dashboard
                </Link>
              </div>
            ) : null}
            <h1 className={styles.heading}>{currentHeader.title}</h1>
            <p className={styles.desc}>{currentHeader.desc}</p>

            <div aria-hidden={active !== 'account'} style={{ display: active === 'account' ? 'block' : 'none' }}>
              <AccountSection publicMarket={initialBillingPlan?.publicMarket} />
            </div>
            <div aria-hidden={active !== 'billing'} style={{ display: active === 'billing' ? 'block' : 'none' }}>
              <BillingSection initialPlanData={initialBillingPlan} />
            </div>
            <div aria-hidden={active !== 'reminders'} style={{ display: active === 'reminders' ? 'block' : 'none' }}>
              <MeetingReminderSection />
            </div>
            <div aria-hidden={active !== 'contact'} style={{ display: active === 'contact' ? 'block' : 'none' }}>
              <ContactSection initialPublicMarket={publicMarket} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
