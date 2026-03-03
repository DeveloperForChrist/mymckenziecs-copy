'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AccountSection from '@/components/settings/AccountSection';
import BillingSection from '@/components/settings/BillingSection';
import ContactSection from '@/components/settings/ContactSection';
import SettingsSidebar from '@/components/settings/SettingsSidebar';
import styles from '@/components/settings/settingsPage.module.css';

type InitialBillingPlan = {
  plan?: string;
  planStatus?: string;
  planPrice?: string | number;
  nextBillingDate?: any;
  hasStripeCustomer?: boolean;
  paidAccess?: boolean;
  cancelAtPeriodEnd?: boolean;
  canResume?: boolean;
  archiveAt?: string | null;
  deleteAt?: string | null;
};

export default function SettingsPageClient({ initialBillingPlan }: { initialBillingPlan: InitialBillingPlan | null }) {
  const searchParams = useSearchParams();
  const requestedTab = useMemo(() => {
    const raw = (searchParams?.get('tab') || searchParams?.get('section') || '').trim().toLowerCase();
    if (raw === 'billing' || raw === 'contact' || raw === 'account') return raw;
    return 'account';
  }, [searchParams]);
  const [active, setActive] = useState(requestedTab);

  useEffect(() => {
    setActive(requestedTab);
  }, [requestedTab]);

  const headerByTab: Record<string, { title: string; desc: string }> = {
    account: {
      title: 'Account Settings',
      desc: 'Manage your personal details, security, and preferences',
    },
    billing: {
      title: 'Billing & Plans',
      desc: 'Review your current subscription and payment methods',
    },
    contact: {
      title: 'Contact Us',
      desc: 'Reach the MyMcKenzieCS team for help and support',
    },
  };
  const currentHeader = headerByTab[active] || headerByTab.account;

  return (
    <div className="purple-gradient-bg app-shell">
      <div className="app-container">
        <div className={styles.settingsContainer}>
          <SettingsSidebar active={active} onSelect={setActive} />
          <main className={styles.mainContent}>
            <div className={styles.topActions}>
              <Link href="/dashboard" className="app-button-secondary">
                Go to Dashboard
              </Link>
            </div>
            <h1 className={styles.heading}>{currentHeader.title}</h1>
            <p className={styles.desc}>{currentHeader.desc}</p>

            <div aria-hidden={active !== 'account'} style={{ display: active === 'account' ? 'block' : 'none' }}>
              <AccountSection />
            </div>
            <div aria-hidden={active !== 'billing'} style={{ display: active === 'billing' ? 'block' : 'none' }}>
              <BillingSection initialPlanData={initialBillingPlan} />
            </div>
            <div aria-hidden={active !== 'contact'} style={{ display: active === 'contact' ? 'block' : 'none' }}>
              <ContactSection />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
