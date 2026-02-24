"use client";
import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// Dynamic imports for better performance
const SettingsSidebar = dynamic(() => import('../../components/settings/SettingsSidebar'), {
  ssr: false,
  loading: () => <div style={{width: '250px', background: '#f3f4f6'}} />
});

const AccountSection = dynamic(() => import('../../components/settings/AccountSection'), {
  ssr: false,
  loading: () => <div style={{padding: '20px'}}>Loading account settings...</div>
});

const BillingSection = dynamic(() => import('../../components/settings/BillingSection'), {
  ssr: false,
  loading: () => <div style={{padding: '20px'}}>Loading billing information...</div>
});

const ContactSection = dynamic(() => import('../../components/settings/ContactSection'), {
  ssr: false,
  loading: () => <div style={{padding: '20px'}}>Loading contact options...</div>
});

import styles from '../../components/settings/settingsPage.module.css';

export default function SettingsPage() {
  const [active, setActive] = useState('account');
  return (
    <>
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
              {active === 'account' && (
                <>
                  <h1 className={styles.heading}>Account Settings</h1>
                  <p className={styles.desc}>Manage your personal details, security, and preferences</p>
                  <AccountSection />
                </>
              )}
              {active === 'billing' && (
                <>
                  <h1 className={styles.heading}>Billing & Plans</h1>
                  <p className={styles.desc}>Review your current subscription and payment methods</p>
                  <BillingSection />
                </>
              )}
              {active === 'contact' && (
                <>
                  <h1 className={styles.heading}>Contact Us</h1>
                  <p className={styles.desc}>Reach the MyMcKenzie team for help and support</p>
                  <ContactSection />
                </>
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
