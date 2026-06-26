import { redirect } from 'next/navigation';
import { buildSignInRedirectPath } from '@/lib/auth/workspace-routes';
import { getServerAuthUser, resolveWorkspaceShortcutRedirect } from '@/lib/auth/server-workspace-routes';
import { isBillingEligibleUser } from '@/lib/auth/session-user';
import { getUserPlanData } from '@/lib/payments/user-plan';
import { NO_INDEX_METADATA } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const metadata = NO_INDEX_METADATA;

export default async function UsWorkspacePage() {
  const { authUser } = await getServerAuthUser();

  if (!authUser || !isBillingEligibleUser(authUser)) {
    redirect(buildSignInRedirectPath('/us/dashboard'));
  }

  const planData = await getUserPlanData(authUser.id, authUser.email ?? null);
  redirect(await resolveWorkspaceShortcutRedirect(authUser, '/us/dashboard', { paidAccess: planData.paidAccess }));
}
