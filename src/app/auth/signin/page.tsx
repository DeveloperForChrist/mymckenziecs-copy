import type { Metadata } from 'next'
import SignInForm from '@/components/auth/SignInForm'
import styles from '@/app/auth/auth.module.css'
import { Suspense } from 'react'
import { buildPageMetadata } from '@/lib/seo'
import { buildMarketAwareAuthHref, getPublicMarket, getPublicRouteForMarket } from '@/lib/markets/public-routes'

export const metadata: Metadata = buildPageMetadata({
  title: 'Sign In',
  description: 'Sign in to your MyMcKenzieCS account to resume your case workspace.',
  path: '/auth/signin',
  noIndex: true,
})

export const revalidate = 86400

type SignInPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams
  const redirectPath = typeof params?.redirect === 'string' ? params.redirect : null
  const market = getPublicMarket({
    pathname: redirectPath,
    explicitMarket: typeof params?.market === 'string' ? params.market : null,
  })
  const pricingHref = getPublicRouteForMarket('/pricing', market)
  const faqHref = getPublicRouteForMarket('/faq', market)
  const signUpHref = buildMarketAwareAuthHref('/auth/signup', market)

  return (
    <>
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.hero}>
            <span className={styles.heroTag}>Case-ready workflow</span>
            <div>
              <h1 className={styles.heroTitle}>Pick up where you left off.</h1>
              <p className={styles.heroCopy}>
                Review your notes, continue your case plan, and stay aligned with deadlines and documents.
              </p>
              <div className={styles.heroList}>
                <div className={styles.heroListItem}>
                  <span>01</span>
                  <div>Live case notes and chat summaries in one place.</div>
                </div>
                <div className={styles.heroListItem}>
                  <span>02</span>
                  <div>Document context stays attached to the case.</div>
                </div>
                <div className={styles.heroListItem}>
                  <span>03</span>
                  <div>Need more support? Add Basic, Premium, or Premium + anytime.</div>
                </div>
              </div>
            </div>
            <div className={styles.heroFooter}>
              <a href={pricingHref}>Pricing</a>
              <a href={faqHref}>Plan FAQ</a>
            </div>
          </section>

          <section className={styles.formPanel}>
            <div>
              <h2 className={styles.formTitle}>Welcome back</h2>
              <p className={styles.formSubtitle}>
                Sign in to resume your workspace and continue preparing your legal matter.
              </p>
              <p className={styles.formSubtitle} style={{ marginTop: '8px' }}>
                Invited by a legal professional? Use this same sign-in. You&apos;ll be taken to your Client Portal automatically.
              </p>
            </div>
            <Suspense fallback={<div className={styles.formSubtitle}>Loading sign in form...</div>}>
              <SignInForm />
            </Suspense>
            <p className={styles.footnote}>
              Don&apos;t have an account?{' '}
              <a href={signUpHref} className={styles.inlineLink}>
                Try for free
              </a>
            </p>
          </section>
        </div>
      </main>
    </>
  )
}
