'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isBillingEligibleUser } from '@/lib/auth/session-user';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';

type BillingEligibleUser = Parameters<typeof isBillingEligibleUser>[0];

function userHasPaidPlan(plan: unknown, planStatus: unknown) {
  const label = String(plan || '').toLowerCase();
  const status = String(planStatus || '').toLowerCase();
  const paidPlan = label.includes('basic') || label.includes('premium');
  const activeState = status === 'active' || status === 'past_due';
  return paidPlan && activeState;
}

export default function HeroActionButtons() {
  const [authChecked, setAuthChecked] = useState(false);
  const [hasAccountSession, setHasAccountSession] = useState(false);
  const [hasPaidAccess, setHasPaidAccess] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    let requestId = 0;

    const syncUserState = async (user: BillingEligibleUser) => {
      const currentRequestId = ++requestId;
      const eligible = isBillingEligibleUser(user);

      if (!eligible) {
        if (cancelled || currentRequestId !== requestId) return;
        setHasAccountSession(false);
        setHasPaidAccess(false);
        setAuthChecked(true);
        return;
      }

      if (!cancelled && currentRequestId === requestId) {
        setHasAccountSession(true);
        setHasPaidAccess(false);
      }

      try {
        const response = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' });
        const planData = response.ok ? await response.json().catch(() => null) : null;
        if (cancelled || currentRequestId !== requestId) return;

        setHasPaidAccess(Boolean(planData?.paidAccess) || userHasPaidPlan(planData?.plan, planData?.planStatus));
      } catch {
        if (cancelled || currentRequestId !== requestId) return;
        setHasPaidAccess(false);
      } finally {
        if (!cancelled && currentRequestId === requestId) {
          setAuthChecked(true);
        }
      }
    };

    supabase.auth.getSession()
      .then(({ data }) => {
        if (cancelled) return;
        void syncUserState(data.session?.user);
      })
      .catch(() => {
        if (cancelled) return;
        setHasAccountSession(false);
        setHasPaidAccess(false);
        setAuthChecked(true);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      void syncUserState(session?.user);
    });

    return () => {
      cancelled = true;
      requestId += 1;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const dashboardHref = hasPaidAccess ? '/dashboard' : '/pricing?redirect=%2Fsettings%3Ftab%3Dbilling';
  const dashboardLabel = hasPaidAccess ? 'Go to Dashboard' : hasAccountSession ? 'Complete setup' : 'Sign in';

  return (
    <div className="mt-7 flex flex-wrap gap-3 justify-center xl:justify-start">
      <Link
        href="/pricing"
        className="app-button-secondary text-base sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
      >
        Choose plan
      </Link>
      {authChecked ? (
        <Link
          href={hasAccountSession ? dashboardHref : '/auth/signin'}
          className="app-button-secondary text-base sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
        >
          {dashboardLabel}
        </Link>
      ) : (
        <span className="app-button-secondary text-base sm:text-lg opacity-80">
          Loading account
        </span>
      )}
    </div>
  );
}
