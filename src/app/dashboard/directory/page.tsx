import { getDashboardSession } from '@/lib/auth/dashboard-session'
import { NO_INDEX_METADATA } from '@/lib/seo'
import DirectoryPageClient from './DirectoryPageClient'

export const metadata = NO_INDEX_METADATA

export default async function DirectoryPage() {
  const { authUser } = await getDashboardSession()
  return <DirectoryPageClient userId={authUser?.id ?? null} />
}
