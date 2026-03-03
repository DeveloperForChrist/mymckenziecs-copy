import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import ChatbotNavbar from '@/components/chatbot/ChatbotNavbar'
import ChatInterface from '@/components/chatbot/ChatInterface'
import { getUserPlanData } from '@/lib/payments/user-plan'
import type { InitialChatPlanState } from '@/components/chatbot/hooks/useChatAuthPlan'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function ChatbotPage() {
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
    }
  }

  return (
    <div className="purple-gradient-bg app-shell" style={{ color: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ChatbotNavbar
        initialPlanInfo={
          initialAuthPlan
            ? {
                plan: initialAuthPlan.plan,
                planStatus: initialAuthPlan.planStatus,
                paidAccess: initialAuthPlan.paidAccess,
              }
            : null
        }
        initialIsLoggedIn={Boolean(initialAuthPlan?.userId)}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: '35px' }}>
        <div style={{ flex: 1, display: 'flex', width: '100%' }}>
          <main style={{ width: '100%' }}>
            <ChatInterface initialAuthPlan={initialAuthPlan} />
          </main>
        </div>
      </div>
    </div>
  )
}
