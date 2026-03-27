import Link from 'next/link';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
import { APP_FULL_NAME, buildCanonicalUrl, siteUrl } from '@/lib/seo';

export type GuideStat = {
  label: string;
  value: string;
};

export type GuideSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
  note?: string;
};

export type GuideLink = {
  href: string;
  label: string;
  description: string;
};

export type GuideFaqItem = {
  question: string;
  answer: string;
};

type GuidePageProps = {
  path: string;
  title: string;
  subtitle: string;
  meta: string;
  intro: string[];
  publishedDate?: string;
  modifiedDate?: string;
  stats?: GuideStat[];
  sections: GuideSection[];
  faqItems?: GuideFaqItem[];
  faqTitle?: string;
  faqIntro?: string;
  relatedLinks?: GuideLink[];
  ctaTitle?: string;
  ctaText?: string;
  primaryCta?: {
    href: string;
    label: string;
  };
  secondaryCta?: {
    href: string;
    label: string;
  };
};

const defaultArticleDate = '2026-03-17';

export default function GuidePage({
  path,
  title,
  subtitle,
  meta,
  intro,
  publishedDate = defaultArticleDate,
  modifiedDate = publishedDate,
  stats = [],
  sections,
  faqItems = [],
  faqTitle = 'Common questions',
  faqIntro,
  relatedLinks = [],
  ctaTitle = 'Turn guidance into a working case plan',
  ctaText = 'MyMcKenzieCS keeps your notes, documents, deadlines, and research in one place so preparation does not stay scattered.',
  primaryCta = { href: '/pricing', label: 'Compare plans' },
  secondaryCta = { href: '/workspace', label: 'Open workspace' },
}: GuidePageProps) {
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: subtitle,
    datePublished: publishedDate,
    dateModified: modifiedDate,
    mainEntityOfPage: buildCanonicalUrl(path),
    author: {
      '@type': 'Organization',
      name: APP_FULL_NAME,
      url: siteUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: APP_FULL_NAME,
      url: siteUrl,
    },
  };

  const faqJsonLd = faqItems.length > 0 ? {
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
  } : null;

  return (
    <LegalPageLayout title={title} subtitle={subtitle} meta={meta}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}

      <div className="space-y-10 text-slate-100">
        <div className="space-y-4 text-base leading-8 text-slate-200">
          {intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        {stats.length > 0 && (
          <section>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-violet-200/75">{stat.label}</p>
                  <p className="mt-3 text-sm leading-7 text-slate-100">{stat.value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {sections.map((section) => (
          <section key={section.title} className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 md:p-8">
            <h2 className="text-2xl font-semibold text-white md:text-[2rem]">{section.title}</h2>
            <div className="mt-4 space-y-4 text-base leading-8 text-slate-200">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {section.bullets && (
              <ul className="mt-5 space-y-3 text-base leading-7 text-slate-100">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-3">
                    <span className="mt-1 text-amber-300">-</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
            {section.note && (
              <div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-4 text-sm leading-7 text-amber-50">
                {section.note}
              </div>
            )}
          </section>
        ))}

        {faqItems.length > 0 && (
          <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 md:p-8">
            <p className="text-xs uppercase tracking-[0.2em] text-violet-200/75">Search intent</p>
            <h2 className="mt-2 text-2xl font-semibold text-white md:text-[2rem]">{faqTitle}</h2>
            {faqIntro && (
              <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">{faqIntro}</p>
            )}
            <div className="mt-6 space-y-4">
              {faqItems.map((item) => (
                <article
                  key={item.question}
                  className="rounded-3xl border border-white/10 bg-slate-950/30 p-5 md:p-6"
                >
                  <h3 className="text-lg font-semibold text-white md:text-xl">{item.question}</h3>
                  <p className="mt-3 text-base leading-8 text-slate-200">{item.answer}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {relatedLinks.length > 0 && (
          <section>
            <div className="mb-5">
              <p className="text-xs uppercase tracking-[0.2em] text-violet-200/75">Related guides</p>
              <h2 className="mt-2 text-2xl font-semibold text-white md:text-[2rem]">Continue your research</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {relatedLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5 transition-transform hover:-translate-y-1 hover:bg-white/[0.07]"
                >
                  <p className="text-lg font-semibold text-white">{link.label}</p>
                  <p className="mt-3 text-sm leading-7 text-slate-200">{link.description}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-[30px] border border-white/10 bg-gradient-to-r from-white/10 via-white/5 to-white/10 p-7 md:p-9 shadow-[0_30px_80px_rgba(0,0,0,0.3)]">
          <p className="text-xs uppercase tracking-[0.2em] text-violet-200/75">Next step</p>
          <h2 className="mt-2 text-2xl font-semibold text-white md:text-[2rem]">{ctaTitle}</h2>
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-200">{ctaText}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={primaryCta.href} className="app-button-secondary">
              {primaryCta.label}
            </Link>
            <Link href={secondaryCta.href} className="app-button-secondary">
              {secondaryCta.label}
            </Link>
          </div>
        </section>
      </div>
    </LegalPageLayout>
  );
}
