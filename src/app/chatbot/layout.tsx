import type { ReactNode } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isBillingEligibleUser } from '@/lib/auth/session-user'
import { NO_INDEX_METADATA } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const metadata = NO_INDEX_METADATA

export default async function ChatbotLayout({ children }: { children: ReactNode }) {
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
  if (!isBillingEligibleUser(authData?.user)) {
    redirect('/auth/signin?redirect=/chatbot')
  }

  return <>{children}</>
}
