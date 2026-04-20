import type { Metadata } from 'next';
import styles from '../../faq/faq.module.css';
import { buildPageMetadata } from '@/lib/seo';
import { buildMarketAwareAuthHref } from '@/lib/markets/public-routes';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Plans FAQ',
  description:
    'Read common questions about the U.S. version of MyMcKenzieCS, including plan coverage, research limits, and what stays the same across the shared workspace.',
  path: '/us/faq',
});

export const revalidate = 86400;

const faqItems = [
  {
    question: 'Is the U.S. version a different app?',
    answer:
      'No. It uses the same core MyMcKenzieCS workspace and UI, with U.S.-specific public pages, wording, and jurisdiction-aware support layered on top.',
  },
  {
    question: 'What does Basic include for U.S. users?',
    answer:
      'Basic gives you the MyMcKenzieCS Basic Assistant, document storage, and conversation history in the same shared workspace.',
  },
  {
    question: 'What does Premium add?',
    answer:
      'Premium adds larger document storage, conversation history, and scheduled deadline reminder emails before saved events.',
  },
  {
    question: 'What is still limited for U.S. users?',
    answer:
      'Advanced U.S. case-law database coverage is still growing. The U.S. version currently focuses on jurisdiction-aware support, public guides, and shared workspace features first.',
  },
  {
    question: 'Can I switch or cancel?',
    answer:
      'Yes. You can upgrade, downgrade, or cancel in Settings. Your data stays with your account.',
  },
] as const;

export default function UsFaqPage() {
  const signUpHref = buildMarketAwareAuthHref('/auth/signup', 'US');
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
          <h1 className={styles.title}>U.S. Plans FAQ</h1>
          <p className={styles.subtitle}>
            Clear answers about what stays the same in the shared workspace and what is changing for the U.S. rollout.
          </p>
          <div className={styles.pillRow}>
            <span className={styles.pill}>No legal advice</span>
            <span className={styles.pill}>U.S. self-help focus</span>
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
          <a className={styles.primary} href="/us/pricing">View U.S. pricing</a>
          <a className={styles.ghost} href={signUpHref}>Create account</a>
        </div>
      </div>
    </main>
  );
}
