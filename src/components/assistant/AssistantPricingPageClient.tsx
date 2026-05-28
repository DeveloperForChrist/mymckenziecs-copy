"use client"

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { getPlanPriceId, type BillingMarket } from '@/constants'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import { isBillingEligibleUser } from '@/lib/auth/session-user'
import styles from './assistantPricing.module.css'

type AssistantPricingPageClientProps = {
  billingMarket?: BillingMarket
  currencySymbol?: string
  priceByPlan?: {
    plus: string
    pro: string
    workspaceBasic: string
    workspacePremium: string
    workspacePremiumPlus: string
  }
}

type ProductView = 'assistant' | 'workspace'
type PaidPlanName = 'Basic' | 'Premium' | 'Premium +' | 'Assistant Plus' | 'Assistant Pro'
type PlanKey = 'free' | 'plus' | 'pro' | 'workspace-basic' | 'workspace-premium' | 'workspace-premium-plus'
type PaidPlanKey = Exclude<PlanKey, 'free'>

const isPaidPlanKey = (value: PlanKey): value is PaidPlanKey => value !== 'free'

const assistantPlans: Array<{
  key: PlanKey
  name: string
  description: string
  stripePlanName?: PaidPlanName
  cta: string
  highlighted?: boolean
  features: string[]
}> = [
  {
    key: 'free',
    name: 'Free',
    description: 'Start with saved chats.',
    cta: 'Continue free',
    features: [
      'Saved chats',
      'Limited web search',
      'No document uploads',
      'No document storage',
    ],
  },
  {
    key: 'plus',
    name: 'Plus',
    description: 'For regular support with uploads and useful research.',
    stripePlanName: 'Assistant Plus',
    cta: 'Choose Plus',
    highlighted: true,
    features: [
      'Everything in Free',
      'Premium assistant responses',
      'Document uploads in chat',
      'More daily web searches with sources',
      'Conversation history',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    description: 'For heavier assistant work with saved documents and deeper research.',
    stripePlanName: 'Assistant Pro',
    cta: 'Choose Pro',
    features: [
      'Everything in Plus',
      'Premium+ assistant responses',
      'Persistent memory',
      'Higher web research allowance',
      'Saved document library',
      'Case-law retrieval in chat',
      'Case Law page',
    ],
  },
]

const workspacePlans: Array<{
  key: PlanKey
  name: string
  description: string
  stripePlanName: PaidPlanName
  cta: string
  highlighted?: boolean
  features: string[]
}> = [
  {
    key: 'workspace-basic',
    name: 'Basic',
    description: 'A lightweight case workspace for organising your matter.',
    stripePlanName: 'Basic',
    cta: 'Choose Basic',
    features: [
      'Case workspace access',
      'MyMcKenzieCS Basic Assistant',
      '10 document storage',
      'Conversation history',
      'Limited daily web research with source citations',
    ],
  },
  {
    key: 'workspace-premium',
    name: 'Premium',
    description: 'For ongoing matters with more documents and reminders.',
    stripePlanName: 'Premium',
    cta: 'Choose Premium',
    highlighted: true,
    features: [
      'Everything in Basic',
      'MyMcKenzieCS Smart Assistant',
      '25 document storage',
      'Expanded web research with source citations',
      'Deadline reminder emails',
    ],
  },
  {
    key: 'workspace-premium-plus',
    name: 'Premium +',
    description: 'For heavier case preparation and deeper research support.',
    stripePlanName: 'Premium +',
    cta: 'Choose Premium +',
    features: [
      'Everything in Premium',
      'MyMcKenzieCS Intelligent Assistant',
      '150 document storage',
      'Enhanced research support',
      'Advanced case-law retrieval and study',
    ],
  },
]

export default function AssistantPricingPageClient({
  billingMarket = 'GB',
  currencySymbol = '£',
  priceByPlan = {
    plus: currencySymbol === '$' ? '$15' : '£12',
    pro: currencySymbol === '$' ? '$59.99' : '£49.99',
    workspaceBasic: '18',
    workspacePremium: '32',
    workspacePremiumPlus: '149',
  },
}: AssistantPricingPageClientProps) {
  const [activeProduct, setActiveProduct] = useState<ProductView>('assistant')
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState<PlanKey | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const priceIds = useMemo(() => ({
    plus: getPlanPriceId('Assistant Plus', billingMarket),
    pro: getPlanPriceId('Assistant Pro', billingMarket),
    'workspace-basic': getPlanPriceId('Basic', billingMarket),
    'workspace-premium': getPlanPriceId('Premium', billingMarket),
    'workspace-premium-plus': getPlanPriceId('Premium +', billingMarket),
  }), [billingMarket])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let cancelled = false

    supabase.auth.getSession()
      .then(({ data }) => {
        if (cancelled) return
        setIsSignedIn(isBillingEligibleUser(data.session?.user))
        setAuthChecked(true)
      })
      .catch(() => {
        if (cancelled) return
        setIsSignedIn(false)
        setAuthChecked(true)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      setIsSignedIn(isBillingEligibleUser(session?.user))
      setAuthChecked(true)
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  const startPaidPlan = async (planKey: PaidPlanKey) => {
    const priceId = priceIds[planKey]
    const successPath = planKey.startsWith('workspace-') ? '/dashboard' : '/assistant'
    setCheckoutError(null)

    if (!priceId) {
      setCheckoutError('Pricing for this Assistant plan is not live yet.')
      return
    }

    if (!isSignedIn) {
      window.location.href = `/auth/signup?redirect=${encodeURIComponent('/assistant/pricing')}`
      return
    }

    setCheckoutLoading(planKey)
    try {
      const supabase = getSupabaseBrowserClient()
      const session = (await supabase.auth.getSession()).data.session
      const idToken = session?.access_token
      if (!idToken || !isBillingEligibleUser(session?.user)) {
        window.location.href = `/auth/signup?redirect=${encodeURIComponent('/assistant/pricing')}`
        return
      }

      const checkoutRes = await fetch('/api/stripe/plan-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          planId: priceId,
          successUrl: `${window.location.origin}${successPath}`,
          cancelUrl: window.location.href,
        }),
      })
      const checkoutData = await checkoutRes.json().catch(() => ({}))
      if (!checkoutRes.ok && checkoutData?.code === 'EMAIL_VERIFICATION_REQUIRED' && typeof checkoutData?.redirect === 'string') {
        window.location.href = checkoutData.redirect
        return
      }
      if (!checkoutRes.ok || !checkoutData?.url) {
        setCheckoutError(checkoutData?.error || 'Unable to start checkout.')
        return
      }
      window.location.href = checkoutData.url
    } catch (error: any) {
      setCheckoutError(error?.message || 'Unable to start checkout.')
    } finally {
      setCheckoutLoading(null)
    }
  }

  const activePlans = activeProduct === 'assistant' ? assistantPlans : workspacePlans

  const formatPrice = (plan: (typeof assistantPlans)[number] | (typeof workspacePlans)[number]) => {
    if (plan.key === 'free') return 'Free'
    if (plan.key === 'plus') return priceByPlan.plus
    if (plan.key === 'pro') return priceByPlan.pro
    if (plan.key === 'workspace-basic') return `${currencySymbol}${priceByPlan.workspaceBasic}`
    if (plan.key === 'workspace-premium') return `${currencySymbol}${priceByPlan.workspacePremium}`
    return `${currencySymbol}${priceByPlan.workspacePremiumPlus}`
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/assistant" className={styles.backLink}>Back to Assistant</Link>
        <div>
          <p className={styles.kicker}>MyMcKenzie Assistant</p>
          <h1>Choose how you want to continue.</h1>
          <p className={styles.subtitle}>
            Start with the Assistant product line, or switch to the full case workspace plans when you need a structured matter workspace.
          </p>
        </div>
      </header>

      <div className={styles.switcherWrap} aria-label="Pricing product switcher">
        <div className={styles.switcher}>
          <span
            className={styles.switcherThumb}
            style={{ transform: activeProduct === 'assistant' ? 'translateX(0)' : 'translateX(100%)' }}
            aria-hidden="true"
          />
          <button
            type="button"
            className={activeProduct === 'assistant' ? styles.switcherActive : ''}
            onClick={() => setActiveProduct('assistant')}
          >
            Assistant plans
          </button>
          <button
            type="button"
            className={activeProduct === 'workspace' ? styles.switcherActive : ''}
            onClick={() => setActiveProduct('workspace')}
          >
            Case workspace plans
          </button>
        </div>
      </div>

      {checkoutError && <div className={styles.errorBox}>{checkoutError}</div>}

      <section className={styles.grid} aria-label={activeProduct === 'assistant' ? 'Assistant plans' : 'Case workspace plans'}>
        {activePlans.map((plan) => (
          <article key={plan.key} className={`${styles.card} ${plan.highlighted ? styles.highlighted : ''}`}>
            {plan.highlighted && <div className={styles.badge}>Popular</div>}
            <div>
              <h2>{plan.name}</h2>
              <p className={styles.description}>{plan.description}</p>
              <div className={styles.price}>
                <span>{formatPrice(plan)}</span>
                {plan.key !== 'free' && !formatPrice(plan).toLowerCase().includes('pending') && <small>/month</small>}
              </div>
            </div>

            <ul className={styles.features}>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>

            {plan.key === 'free' ? (
              <Link href="/assistant" className={styles.secondaryButton}>
                {plan.cta}
              </Link>
            ) : (
              <button
                type="button"
                className={plan.highlighted ? styles.primaryButton : styles.secondaryButton}
                onClick={() => {
                  if (isPaidPlanKey(plan.key)) void startPaidPlan(plan.key)
                }}
                disabled={!authChecked || checkoutLoading === plan.key || !priceIds[plan.key as PaidPlanKey]}
              >
                {checkoutLoading === plan.key ? 'Starting...' : (!priceIds[plan.key as PaidPlanKey] ? 'Pricing pending' : plan.cta)}
              </button>
            )}
          </article>
        ))}
      </section>
    </main>
  )
}
