"use client";
import React, { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamic imports for better performance
const SettingsSidebar = dynamic(() => import('../../components/settings/SettingsSidebar'), {
  ssr: false,
  loading: () => <div style={{width: '250px', background: '#f3f4f6'}} />
});

const AccountSection = dynamic(() => import('../../components/settings/AccountSection'), {
  ssr: false,
  loading: () => <div style={{padding: '20px'}}>Loading account settings...</div>
});

const CaseProfileSection = dynamic(() => import('../../components/settings/CaseProfileSection'), {
  ssr: false,
  loading: () => <div style={{padding: '20px'}}>Loading case profile...</div>
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
                <a href="/dashboard" className={`${styles.primaryBtn} ${styles.topActionBtn}`}>
                  Go to Dashboard
                </a>
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
              {active === 'case-profile' && (
                <>
                  <h1 className={styles.heading}>Case Profile</h1>
                  <p className={styles.desc}>Fill your case profile so MyMcKenzie Assistant can personalise guidance for you.</p>
                  <CaseProfileSection />
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
