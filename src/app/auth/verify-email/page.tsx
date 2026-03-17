import type { Metadata } from 'next'
import { Suspense } from 'react'
import VerifyEmailScreen from '@/components/auth/VerifyEmailScreen'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Verify Email',
  description: 'Verify your email address to finish setting up your MyMcKenzieCS account.',
  path: '/auth/verify-email',
  noIndex: true,
})

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
