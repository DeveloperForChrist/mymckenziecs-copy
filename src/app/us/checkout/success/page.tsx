import type { Metadata } from 'next';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import CheckoutSuccessPageClient from '@/components/checkout/CheckoutSuccessPageClient';
import { isBillingEligibleUser } from '@/lib/auth/session-user';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Checkout Success',
  description: 'Your MyMcKenzieCS U.S. checkout has completed successfully.',
  path: '/us/checkout/success',
  noIndex: true,
});

export default async function UsCheckoutSuccessPage() {
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
  if (!isBillingEligibleUser(authData?.user)) {
    redirect('/auth/signin?redirect=/us/checkout/success');
  }

  return (
    <Suspense fallback={null}>
      <CheckoutSuccessPageClient />
    </Suspense>
  );
}
