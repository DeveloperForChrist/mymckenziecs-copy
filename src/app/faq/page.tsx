import styles from './faq.module.css';

export default function FaqPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <h1 className={styles.title}>Plans FAQ</h1>
          <p className={styles.subtitle}>
            Clear answers about what you get on Basic, Standard, Essential, and Plus.
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
              Basic gives you core chat assistance with 20 messages per day, plus session‑only chat history that clears on logout or tab close.
              It&apos;s ideal for quick triage and understanding your next step.
            </p>
          </article>
          <article className={styles.card}>
            <h3>What does Standard add?</h3>
            <p>
              Standard adds conversation history and more storage, plus unlimited conversations with a 30‑message per thread limit and deadline reminder emails.
              It&apos;s designed for steady, ongoing cases.
            </p>
          </article>
          <article className={styles.card}>
            <h3>What does Essential add?</h3>
            <p>
              Essential unlocks the MyMcKenzie Smart Assistant with verification, provides higher
              unlimited conversations with a 40‑message per thread limit, includes Case Law Search + MyMckenzie Case Study, and deadline reminder emails.
            </p>
          </article>
          <article className={styles.card}>
            <h3>What does Plus add?</h3>
            <p>
              Plus expands storage, provides unlimited conversations with a 50‑message per thread limit, includes Case Law Search + MyMckenzie Case Study, deadline reminder emails, and premium perks like priority support and early access. It supports larger matters with more evidence and longer timelines.
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
          <a className={styles.ghost} href="/auth/signup">Start free</a>
        </div>
      </div>
    </main>
  );
}
