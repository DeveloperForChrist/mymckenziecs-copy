import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import SignUpForm from '@/components/auth/SignUpForm'
import styles from '@/app/auth/auth.module.css'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Client Portal Sign Up',
  description: 'Create your invited client portal account.',
  path: '/client-portal/auth/signup',
  noIndex: true,
})

export const revalidate = 86400

type ClientPortalSignUpPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function ClientPortalSignUpPage({ searchParams }: ClientPortalSignUpPageProps) {
  const params = await searchParams
  const invitationToken = typeof params?.token === 'string' ? params.token.trim() : ''
  const redirectPath = typeof params?.redirect === 'string' ? params.redirect : ''

  if (!invitationToken) {
    redirect('/client-portal/auth/signin?redirect=%2Fclient-portal')
  }

  if (redirectPath !== '/client-portal') {
    const redirectUrl = new URL('/client-portal/auth/signup', 'http://localhost')
    redirectUrl.searchParams.set('redirect', '/client-portal')
    redirectUrl.searchParams.set('token', invitationToken)
    redirect(`${redirectUrl.pathname}?${redirectUrl.searchParams.toString()}`)
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <span className={styles.heroTag}>Client portal</span>
          <div>
            <h1 className={styles.heroTitle}>Create your portal account.</h1>
            <p className={styles.heroCopy}>
              Use the details from your invite to open the secure client portal.
            </p>
          </div>
          <div className={styles.heroFooter}>
            <span className={styles.pill}>Invite-only access.</span>
          </div>
        </section>

        <section className={styles.formPanel}>
          <div>
            <h2 className={styles.formTitle}>Open invited client portal</h2>
            <p className={styles.formSubtitle}>
              Enter your details to open the invited client portal.
            </p>
          </div>
          <Suspense fallback={<div className={styles.formSubtitle}>Loading account form...</div>}>
            <SignUpForm />
          </Suspense>
          <p className={styles.footnote}>
            Already opened this portal before? Sign in on the client portal page instead.
          </p>
        </section>
      </div>
    </main>
  )
}
