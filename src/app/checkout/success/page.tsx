import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import CheckoutSuccessPageClient from '@/components/checkout/CheckoutSuccessPageClient';
import { isBillingEligibleUser } from '@/lib/auth/session-user';

export default async function CheckoutSuccessPage() {
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
    redirect('/auth/signin?redirect=/checkout/success');
  }

  return (
    <Suspense fallback={null}>
      <CheckoutSuccessPageClient />
    </Suspense>
  );
}
