import type { Metadata } from 'next'
import SignUpForm from '@/components/auth/SignUpForm'
import styles from '@/app/auth/auth.module.css'
import { Suspense } from 'react'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Create Account',
  description: 'Create a MyMcKenzieCS account and start your legal self-help workspace.',
  path: '/auth/signup',
  noIndex: true,
})

export const revalidate = 86400

export default function SignUpPage() {
  return (
    <>
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.hero}>
            <span className={styles.heroTag}>For self-represented litigants</span>
            <div>
              <h1 className={styles.heroTitle}>Create your legal workspace.</h1>
              <p className={styles.heroCopy}>
                MyMcKenzieCS keeps your case notes, deadlines, and document context together so you can
                prepare with more clarity and less friction.
              </p>
              <div className={styles.heroList}>
                <div className={styles.heroListItem}>
                  <span>01</span>
                  <div>Track key dates, evidence, and next steps in one place.</div>
                </div>
                <div className={styles.heroListItem}>
                  <span>02</span>
                <div>Get clear procedural support for your legal matter.</div>
                </div>
                <div className={styles.heroListItem}>
                  <span>03</span>
                  <div>Start using the workspace now and upgrade anytime for expanded features.</div>
                </div>
              </div>
            </div>
            <div className={styles.heroFooter}>
              <span className={styles.pill}>Start free and choose a plan later if you need more support.</span>
              <a href="/pricing">Plans</a>
              <a href="/faq">Plan FAQ</a>
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
              <a href="/auth/signin" className={styles.inlineLink}>
                Sign in
              </a>
            </p>
          </section>
        </div>
      </main>
    </>
  )
}
