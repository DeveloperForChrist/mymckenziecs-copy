import SignUpForm from '@/components/auth/SignUpForm'
import styles from '@/app/auth/auth.module.css'

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
                MyMcKenzie keeps your case notes, deadlines, and document context together so you can
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
              <span className={styles.pill}>Guest chat is free. Paid plans unlock full workspace tools.</span>
              <a href="/pricing">Plans</a>
              <a href="/faq">Plan FAQ</a>
            </div>
          </section>

          <section className={styles.formPanel}>
            <div>
              <h2 className={styles.formTitle}>Create your account</h2>
              <p className={styles.formSubtitle}>
                Create your account, then answer a few quick questions to seed your first case.
              </p>
            </div>
            <SignUpForm />
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
