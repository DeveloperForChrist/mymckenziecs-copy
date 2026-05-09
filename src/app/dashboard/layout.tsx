import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/auth/dashboard-session'
import { NO_INDEX_METADATA } from '@/lib/seo'

export const metadata = NO_INDEX_METADATA

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { authUser, isEligible, emailVerified } = await getDashboardSession()
  if (!authUser || !isEligible) {
    redirect('/auth/signin?redirect=/dashboard')
  }

  if (!emailVerified) {
    redirect('/auth/verify-email?redirect=%2Fdashboard')
  }

  return <>{children}</>
}
