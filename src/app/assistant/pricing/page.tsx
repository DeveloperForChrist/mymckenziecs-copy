import type { Metadata } from 'next'
import { Suspense } from 'react'
import AssistantPricingPageClient from '@/components/assistant/AssistantPricingPageClient'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Assistant Pricing',
  description: 'Choose Free, Plus, or Pro for MyMcKenzie Assistant.',
  path: '/assistant/pricing',
  noIndex: true,
})

export const revalidate = 86400

export default function AssistantPricingPage() {
  return (
    <Suspense fallback={null}>
      <AssistantPricingPageClient />
    </Suspense>
  )
}
