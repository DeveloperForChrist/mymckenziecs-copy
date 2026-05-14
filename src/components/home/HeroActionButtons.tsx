'use client'

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';

type HeroActionButtonsProps = {
  pricingHref?: string;
  howItWorksHref?: string;
  contactFormHref?: string;
  directoryHref?: string;
  onPortalClick?: () => void;
};

export default function HeroActionButtons({
  pricingHref = '/pricing',
  howItWorksHref = '/legal-case-management-tool',
  contactFormHref = '/contact-form',
  directoryHref = '/dashboard/directory',
  onPortalClick,
}: HeroActionButtonsProps) {
  const [dashboardHref, setDashboardHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled || !session?.user) return;

        const res = await fetch('/api/user', { credentials: 'include', cache: 'no-store' });
        if (cancelled || !res.ok) return;
        const payload = await res.json().catch(() => ({}));
        const accountType = String(payload?.accountType || '').toLowerCase();
        setDashboardHref(accountType === 'business' ? '/business/dashboard' : '/dashboard');
      } catch {
        // fail silently — unauthenticated state is fine
      }
    };
    void check();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="mt-7 flex flex-wrap gap-3 justify-center xl:justify-start">
      {dashboardHref ? (
        <Link
          href={dashboardHref}
          className="app-button-secondary text-base sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
        >
          Go to Dashboard
        </Link>
      ) : (
        <Link
          href={pricingHref}
          className="app-button-secondary text-base sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
        >
          Try for free
        </Link>
      )}
      <Link
        href={contactFormHref}
        className="app-button-secondary text-base sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
      >
        Get Legal Help
      </Link>
      <Link
        href={directoryHref}
        className="app-button-secondary text-base sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
      >
        Find a Professional
      </Link>
      {onPortalClick && (
        <button
          type="button"
          onClick={onPortalClick}
          className="app-button-secondary text-base sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
        >
          Send to MCS Portal
        </button>
      )}
    </div>
  );
}
