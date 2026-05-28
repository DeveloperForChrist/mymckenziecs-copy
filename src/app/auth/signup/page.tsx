import type { Metadata } from 'next'
import SignUpForm from '@/components/auth/SignUpForm'
import styles from '@/app/auth/auth.module.css'
import { Suspense } from 'react'
import { buildPageMetadata } from '@/lib/seo'
import { buildMarketAwareAuthHref, getPublicMarket, getPublicRouteForMarket } from '@/lib/markets/public-routes'

export const metadata: Metadata = buildPageMetadata({
  title: 'Create Account',
  description: 'Create a MyMcKenzieCS account.',
  path: '/auth/signup',
  noIndex: true,
})

export const revalidate = 86400

type SignUpPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams
  const redirectPath = typeof params?.redirect === 'string' ? params.redirect : null
  const market = getPublicMarket({
    pathname: redirectPath,
    explicitMarket: typeof params?.market === 'string' ? params.market : null,
  })
  const pricingHref = getPublicRouteForMarket('/pricing', market)
  const faqHref = getPublicRouteForMarket('/faq', market)
  const signInHref = buildMarketAwareAuthHref('/auth/signin', market, {
    redirect: redirectPath,
  })

  return (
    <>
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.hero}>
            <span className={styles.heroTag}>Your account</span>
            <div>
              <h1 className={styles.heroTitle}>Create your account.</h1>
              <p className={styles.heroCopy}>
                Use one account for MyMcKenzieCS tools and any client portal access.
              </p>
              <div className={styles.heroList}>
                <div className={styles.heroListItem}>
                  <span>01</span>
                  <div>Ask questions and continue saved chats.</div>
                </div>
                <div className={styles.heroListItem}>
                  <span>02</span>
                <div>Choose a plan when you are ready.</div>
                </div>
                <div className={styles.heroListItem}>
                  <span>03</span>
                  <div>Invited by a professional? Use the same account.</div>
                </div>
              </div>
            </div>
            <div className={styles.heroFooter}>
              <span className={styles.pill}>Create your account and continue.</span>
              <a href={pricingHref}>Plans</a>
              <a href={faqHref}>Plan FAQ</a>
            </div>
          </section>

          <section className={styles.formPanel}>
            <div>
              <h2 className={styles.formTitle}>Create your account</h2>
              <p className={styles.formSubtitle}>
                Enter your details. We&apos;ll send a verification email next.
              </p>
            </div>
            <Suspense fallback={<div className={styles.formSubtitle}>Loading account form...</div>}>
              <SignUpForm />
            </Suspense>
            <p className={styles.footnote}>
              Already have an account?{' '}
              <a href={signInHref} className={styles.inlineLink}>
                Sign in
              </a>
            </p>
          </section>
        </div>
      </main>
    </>
  )
}
