import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getDashboardEntryState } from '@/lib/auth/server-workspace-routes';
import { isAssistantOnlyAccount } from '@/lib/auth/product-access';
import { NO_INDEX_METADATA } from '@/lib/seo';

export const metadata = NO_INDEX_METADATA;

export default async function UsDashboardLayout({ children }: { children: ReactNode }) {
  const { session, redirectPath } = await getDashboardEntryState('/us/dashboard');
  if (redirectPath) {
    redirect(redirectPath);
  }

  const { authUser } = session;
  if (await isAssistantOnlyAccount(authUser)) {
    redirect('/assistant');
  }

  return <>{children}</>;
}
