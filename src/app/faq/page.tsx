import styles from './faq.module.css';

export const revalidate = 86400;

export default function FaqPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <h1 className={styles.title}>Plans FAQ</h1>
          <p className={styles.subtitle}>
            Clear answers about what you get on Basic, Premium, and Premium +.
          </p>
          <div className={styles.pillRow}>
            <span className={styles.pill}>No legal advice</span>
            <span className={styles.pill}>UK civil focus</span>
            <span className={styles.pill}>Cancel anytime</span>
          </div>
        </section>

        <section className={styles.grid}>
          <article className={styles.card}>
            <h3>What does Basic include?</h3>
            <p>
              Basic gives you the MyMcKenzieCS Basic Assistant, document storage, and conversation history.
            </p>
          </article>
          <article className={styles.card}>
            <h3>What does Premium add?</h3>
            <p>
              Premium adds larger document storage, conversation history, and deadline reminder emails.
            </p>
          </article>
          <article className={styles.card}>
            <h3>What does Premium + add?</h3>
            <p>
              Premium + is built for high-volume cases with the MyMcKenzieCS Intelligent Assistant, the largest storage allowance, enhanced research support, and advanced case law tools.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Can I switch or cancel?</h3>
            <p>
              Yes. You can upgrade or cancel in Settings any time. Your data stays with your account.
            </p>
          </article>
        </section>

        <div className={styles.cta}>
          <a className={styles.primary} href="/pricing">View pricing</a>
          <a className={styles.ghost} href="/auth/signup">Create account</a>
        </div>
      </div>
    </main>
  );
}
