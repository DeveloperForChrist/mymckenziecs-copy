import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isBillingEligibleUser } from '@/lib/auth/session-user'
import { getUserPlanData } from '@/lib/payments/user-plan'
import { isUserEmailVerified } from '@/lib/auth/account-verification'
import { getAppRouteForMarket } from '@/lib/markets/app-routes'
import { NO_INDEX_METADATA } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const metadata = NO_INDEX_METADATA

export default async function WorkspacePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // No-op in server component render context.
        },
      },
    }
  )

  const { data: authData } = await supabase.auth.getUser()
  const authUser = authData?.user

  if (!authUser || !isBillingEligibleUser(authUser)) {
    redirect('/auth/signin?redirect=/dashboard')
  }

  const planData = await getUserPlanData(authUser.id, authUser.email ?? null)
  const dashboardHref = getAppRouteForMarket('/dashboard', planData?.publicMarket === 'US' ? 'US' : 'GB')
  if (planData.paidAccess) {
    redirect(dashboardHref)
  }

  const emailVerified = await isUserEmailVerified(authUser.id)
  if (emailVerified) {
    redirect(dashboardHref)
  }

  redirect(`/auth/verify-email?redirect=${encodeURIComponent(dashboardHref)}`)
}
