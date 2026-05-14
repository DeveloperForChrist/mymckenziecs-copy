import type { Metadata } from 'next';
import styles from './faq.module.css';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Plans FAQ',
  description:
    'Read common questions about MyMcKenzieCS plans, including what is included in Basic, Premium, and Premium +, plus switching and cancellation.',
  path: '/faq',
});

export const revalidate = 86400;

const faqItems = [
  {
    question: 'What does Basic include?',
    answer:
      'Basic gives you the MyMcKenzieCS Basic Assistant, document storage, and conversation history.',
  },
  {
    question: 'What does Premium add?',
    answer:
      'Premium adds larger document storage, conversation history, and a scheduled series of deadline reminder emails sent 21, 14, 7, 5, 3, and 1 day before a saved event.',
  },
  {
    question: 'What does Premium + add?',
    answer:
      'Premium + is built for high-volume cases with the MyMcKenzieCS Intelligent Assistant, the largest storage allowance, enhanced research support, advanced case law tools, and a scheduled series of deadline reminder emails sent 21, 14, 7, 5, 3, and 1 day before a saved event.',
  },
  {
    question: 'Can I switch or cancel?',
    answer:
      'Yes. You can upgrade or cancel in Settings any time. Your data stays with your account.',
  },
] as const;

export default function FaqPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
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
          {faqItems.map((item) => (
            <article key={item.question} className={styles.card}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </section>

        <div className={styles.cta}>
          <a className={styles.primary} href="/pricing">View pricing</a>
          <a className={styles.ghost} href="/auth/signup">Create account</a>
        </div>
      </div>
    </main>
  );
}
