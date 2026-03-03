import { Suspense } from 'react'
import VerifyEmailScreen from '@/components/auth/VerifyEmailScreen'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', background: '#270427' }} />}>
      <VerifyEmailScreen />
    </Suspense>
  )
}
