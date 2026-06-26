import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/auth/dashboard-session'
import { isAssistantOnlyAccount } from '@/lib/auth/product-access'
import { NO_INDEX_METADATA } from '@/lib/seo'

export const metadata = NO_INDEX_METADATA

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { authUser, isEligible, emailVerified, hasClientPortalAccess } = await getDashboardSession()
  if (!authUser || !isEligible) {
    redirect('/auth/signin?redirect=/dashboard')
  }

  if (!emailVerified && hasClientPortalAccess) {
    redirect('/client-portal')
  }

  if (!emailVerified) {
    redirect('/auth/verify-email?redirect=%2Fdashboard')
  }

  if (await isAssistantOnlyAccount(authUser)) {
    redirect('/assistant')
  }

  return <>{children}</>
}
