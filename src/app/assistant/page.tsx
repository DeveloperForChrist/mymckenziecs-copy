import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import AssistantProductClient from '@/components/assistant/AssistantProductClient'
import type { InitialChatPlanState } from '@/components/chatbot/hooks/useChatAuthPlan'
import { getUserPlanData } from '@/lib/payments/user-plan'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function AssistantPage() {
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

  let initialAuthPlan: InitialChatPlanState | null = null
  if (authUser) {
    const planData = await getUserPlanData(authUser.id, authUser.email ?? null, { bypassCache: true })
    initialAuthPlan = {
      userId: authUser.id,
      plan: (planData?.plan || 'No plan').toString(),
      planStatus: (planData?.planStatus || 'inactive').toString(),
      paidAccess: Boolean(planData?.paidAccess),
      platformAccess: Boolean(planData?.platformAccess ?? planData?.paidAccess),
    }
  }

  return <AssistantProductClient initialChatPlan={initialAuthPlan} />
}
