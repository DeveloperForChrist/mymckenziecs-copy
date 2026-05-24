import { getDashboardSession } from '@/lib/auth/dashboard-session'
import { NO_INDEX_METADATA } from '@/lib/seo'
import DirectoryPageClient from './DirectoryPageClient'
import { getUserPlanData } from '@/lib/payments/user-plan'
import { redirect } from 'next/navigation'

export const metadata = NO_INDEX_METADATA

export default async function DirectoryPage() {
  const { authUser, emailVerified } = await getDashboardSession()

  if (authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null, { emailVerified })
    if (planData?.publicMarket === 'US') {
      redirect('/us/dashboard')
    }
  }

  return <DirectoryPageClient userId={authUser?.id ?? null} />
}
