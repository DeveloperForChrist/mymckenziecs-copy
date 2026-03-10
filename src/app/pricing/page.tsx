import { Suspense } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import PricingPageClient from '@/components/pricing/PricingPageClient';
import { isBillingEligibleUser } from '@/lib/auth/session-user';

export default async function PricingPage() {
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
  const hasAccountSession = isBillingEligibleUser(authData?.user);

  return (
    <Suspense fallback={null}>
      <PricingPageClient initialIsSignedIn={hasAccountSession} />
    </Suspense>
  );
}
