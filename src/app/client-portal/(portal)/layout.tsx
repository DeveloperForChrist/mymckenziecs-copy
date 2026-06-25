import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getClientPortalSession } from '@/lib/auth/client-portal-session'
import { isAnonymousAuthUser } from '@/lib/auth/session-user'
import { NO_INDEX_METADATA } from '@/lib/seo'

export const metadata = NO_INDEX_METADATA

export default async function ClientPortalLayout({ children }: { children: ReactNode }) {
  const { authUser, emailVerified } = await getClientPortalSession()

  if (!authUser || isAnonymousAuthUser(authUser)) {
    redirect('/client-portal/auth/signin?redirect=%2Fclient-portal')
  }

  if (!emailVerified) {
    redirect('/auth/verify-email?redirect=%2Fclient-portal')
  }

  return <>{children}</>
}
