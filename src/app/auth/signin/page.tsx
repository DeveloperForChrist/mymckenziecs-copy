import type { Metadata } from 'next'
import SignInForm from '@/components/auth/SignInForm'
import styles from '@/app/auth/auth.module.css'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { buildPageMetadata } from '@/lib/seo'
import { buildMarketAwareAuthHref, getPublicMarket, getPublicRouteForMarket } from '@/lib/markets/public-routes'

export const metadata: Metadata = buildPageMetadata({
  title: 'Sign In',
  description: 'Sign in to your MyMcKenzieCS account.',
  path: '/auth/signin',
  noIndex: true,
})

export const revalidate = 86400

type SignInPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams
  const invitationToken = typeof params?.token === 'string' ? params.token.trim() : ''
  const redirectPath = typeof params?.redirect === 'string' ? params.redirect : null
  const isPortalRedirect = Boolean(redirectPath && redirectPath.startsWith('/client-portal'))
  if (invitationToken || isPortalRedirect) {
    const target = `/client-portal/auth/signin?${new URLSearchParams({
      ...(invitationToken ? { token: invitationToken } : {}),
      redirect: '/client-portal',
    }).toString()}`
    redirect(target)
  }
  const market = getPublicMarket({
    pathname: redirectPath,
    explicitMarket: typeof params?.market === 'string' ? params.market : null,
  })
  const pricingHref = getPublicRouteForMarket('/pricing', market)
  const faqHref = getPublicRouteForMarket('/faq', market)
  const signUpHref = buildMarketAwareAuthHref('/auth/signup', market, {
    redirect: redirectPath,
    token: invitationToken || undefined,
  })

  return (
    <>
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.hero}>
            <span className={styles.heroTag}>Your account</span>
            <div>
              <h1 className={styles.heroTitle}>Continue where you left off.</h1>
              <p className={styles.heroCopy}>
                Sign in once to use MyMcKenzieCS tools and any client portal access.
              </p>
              <div className={styles.heroList}>
                <div className={styles.heroListItem}>
                  <span>01</span>
                  <div>Continue saved chats and account activity.</div>
                </div>
                <div className={styles.heroListItem}>
                  <span>02</span>
                  <div>Manage your plan and account settings.</div>
                </div>
                <div className={styles.heroListItem}>
                  <span>03</span>
                  <div>Invited by a professional? Use the same sign-in.</div>
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
                Sign in to continue.
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
