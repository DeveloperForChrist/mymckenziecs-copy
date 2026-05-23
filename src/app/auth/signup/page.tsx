import type { Metadata } from 'next'
import SignUpForm from '@/components/auth/SignUpForm'
import styles from '@/app/auth/auth.module.css'
import { Suspense } from 'react'
import { buildPageMetadata } from '@/lib/seo'
import { buildMarketAwareAuthHref, getPublicMarket, getPublicRouteForMarket } from '@/lib/markets/public-routes'

export const metadata: Metadata = buildPageMetadata({
  title: 'Create Account',
  description: 'Create a MyMcKenzieCS account and start organising client legal support work in one workspace.',
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
  const signInHref = buildMarketAwareAuthHref('/auth/signin', market)

  return (
    <>
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.hero}>
            <span className={styles.heroTag}>For legal support professionals</span>
            <div>
              <h1 className={styles.heroTitle}>Create your client workspace.</h1>
              <p className={styles.heroCopy}>
                MyMcKenzieCS keeps client notes, deadlines, and document context together so your support work
                feels clearer, calmer, and more professional.
              </p>
              <div className={styles.heroList}>
                <div className={styles.heroListItem}>
                  <span>01</span>
                  <div>Track key dates, documents, client notes, and next steps in one place.</div>
                </div>
                <div className={styles.heroListItem}>
                  <span>02</span>
                <div>Give client matters a clearer structure without presenting the platform as legal advice.</div>
                </div>
                <div className={styles.heroListItem}>
                  <span>03</span>
                  <div>Start using the workspace now and upgrade anytime as your workload grows.</div>
                </div>
              </div>
            </div>
            <div className={styles.heroFooter}>
              <span className={styles.pill}>Create your workspace and choose your plan in billing when ready.</span>
              <a href={pricingHref}>Plans</a>
              <a href={faqHref}>Plan FAQ</a>
            </div>
          </section>

          <section className={styles.formPanel}>
            <div>
              <h2 className={styles.formTitle}>Create your account</h2>
              <p className={styles.formSubtitle}>
                Enter your details to create your account. We&apos;ll send a verification email next so you can unlock your workspace and start using it.
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
