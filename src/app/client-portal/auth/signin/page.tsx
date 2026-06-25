import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import SignInForm from '@/components/auth/SignInForm'
import styles from '@/app/auth/auth.module.css'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Client Portal Sign In',
  description: 'Sign in to open your invited client portal.',
  path: '/client-portal/auth/signin',
  noIndex: true,
})

export const revalidate = 86400

type ClientPortalSignInPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function ClientPortalSignInPage({ searchParams }: ClientPortalSignInPageProps) {
  const params = await searchParams
  const invitationToken = typeof params?.token === 'string' ? params.token.trim() : ''
  const redirectPath = typeof params?.redirect === 'string' ? params.redirect : ''
  if (redirectPath !== '/client-portal') {
    const redirectUrl = new URL('/client-portal/auth/signin', 'http://localhost')
    redirectUrl.searchParams.set('redirect', '/client-portal')
    if (invitationToken) redirectUrl.searchParams.set('token', invitationToken)
    redirect(`${redirectUrl.pathname}?${redirectUrl.searchParams.toString()}`)
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <span className={styles.heroTag}>Client portal</span>
          <div>
            <h1 className={styles.heroTitle}>Open your portal.</h1>
            <p className={styles.heroCopy}>
              Sign in to continue to the client portal that was shared with you.
            </p>
          </div>
          <div className={styles.heroFooter}>
            <span className={styles.pill}>Portal access only.</span>
          </div>
        </section>

        <section className={styles.formPanel}>
          <div>
            <h2 className={styles.formTitle}>Client portal sign in</h2>
            <p className={styles.formSubtitle}>
              {invitationToken
                ? 'Use the invited account to open the portal.'
                : 'Use your client portal account to continue.'}
            </p>
          </div>
          <Suspense fallback={<div className={styles.formSubtitle}>Loading sign in form...</div>}>
            <SignInForm />
          </Suspense>
          <p className={styles.footnote}>
            Need to create the invited account instead? Open your invite link from the portal email.
          </p>
        </section>
      </div>
    </main>
  )
}
