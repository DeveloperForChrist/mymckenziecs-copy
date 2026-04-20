import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const routes = [
    '',
    '/us',
    '/about',
    '/us/about',
    '/pricing',
    '/us/pricing',
    '/faq',
    '/us/faq',
    '/help',
    '/us/help',
    '/us/contact',
    '/us/privacy-policy',
    '/us/terms',
    '/us/cookie-policy',
    '/contact',
    '/litigant-in-person-uk',
    '/how-to-prepare-small-claims-court-uk',
    '/organise-court-documents-uk',
    '/court-bundle-preparation-uk',
    '/do-you-need-a-lawyer-for-small-claims-court-uk',
    '/mckenzie-friend-support',
    '/legal-case-management-tool',
    '/us/legal-case-management-tool',
    '/case-law-search-uk',
    '/us/case-law-research',
    '/witness-statement-uk',
    '/directions-questionnaire-uk',
    '/small-claims-court-uk',
    '/us/small-claims-court-guide',
    '/serving-court-documents-uk',
    '/us/self-represented-litigant-guide',
    '/us/organize-court-documents',
    '/terms',
    '/privacy-policy',
    '/cookie-policy',
  ]

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.7,
  }))
}
