import 'server-only';

import { cache } from 'react';
import { isUserEmailVerified } from '@/lib/auth/account-verification';
import { hasActiveClientPortalAccess } from '@/lib/auth/client-portal-access';
import { createSupabasePageClient } from '@/lib/database/supabase-page';
import { isBillingEligibleUser } from '@/lib/auth/session-user';

export const getDashboardSession = cache(async () => {
  const supabase = await createSupabasePageClient();

  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user ?? null;
  const isEligible = isBillingEligibleUser(authUser);
  const [emailVerified, hasClientPortalAccess] =
    isEligible && authUser
      ? await Promise.all([
          isUserEmailVerified(authUser.id),
          hasActiveClientPortalAccess(authUser.id),
        ])
      : [false, false];

  return {
    supabase,
    authUser,
    isEligible,
    emailVerified,
    hasClientPortalAccess,
  };
});
