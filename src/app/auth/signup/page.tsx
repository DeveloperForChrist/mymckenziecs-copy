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
            <span className={styles.heroTag}>Confidence for litigants</span>
            <div>
              <h1 className={styles.heroTitle}>Create your legal workspace.</h1>
              <p className={styles.heroCopy}>
                MyMcKenzieCS keeps your case notes, deadlines, and document context together so you can
                move with clarity and momentum.
              </p>
              <div className={styles.heroList}>
                <div className={styles.heroListItem}>
                  <span>01</span>
                  <div>Track key dates, evidence, and next steps without a spreadsheet.</div>
                </div>
                <div className={styles.heroListItem}>
                  <span>02</span>
                <div>Summaries and next steps tuned for UK civil procedure.</div>
                </div>
                <div className={styles.heroListItem}>
                  <span>03</span>
                  <div>Upgrade anytime to Basic, Premium, or Premium +.</div>
                </div>
              </div>
            </div>
            <div className={styles.heroFooter}>
              <span className={styles.pill}>Choose a plan to unlock full workspace tools.</span>
              <a href="/pricing">Plans</a>
              <a href="/faq">Plan FAQ</a>
            </div>
          </section>

          <section className={styles.formPanel}>
            <div>
              <h2 className={styles.formTitle}>Create your account</h2>
              <p className={styles.formSubtitle}>
                Enter your details to create your account. If you selected a plan, payment is collected immediately after this step.
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
