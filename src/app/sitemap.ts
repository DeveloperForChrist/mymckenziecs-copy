import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const homeRoutes = new Set(['/uk', '/us'])
  const routes = [
    '/uk',
    '/us',
    '/uk/about',
    '/us/about',
    '/uk/pricing',
    '/uk/pricing/litigants',
    '/uk/pricing/business',
    '/us/pricing',
    '/uk/faq',
    '/us/faq',
    '/uk/help',
    '/us/help',
    '/uk/contact',
    '/us/contact',
    '/uk/privacy-policy',
    '/us/privacy-policy',
    '/uk/terms',
    '/us/terms',
    '/uk/cookie-policy',
    '/us/cookie-policy',
    '/uk/legal-case-management-tool',
    '/us/legal-case-management-tool',
    '/uk/litigant-in-person-uk',
    '/uk/how-to-prepare-small-claims-court-uk',
    '/uk/organise-court-documents-uk',
    '/uk/court-bundle-preparation-uk',
    '/uk/do-you-need-a-lawyer-for-small-claims-court-uk',
    '/uk/mckenzie-friend-support',
    '/uk/case-law-search-uk',
    '/uk/witness-statement-uk',
    '/uk/directions-questionnaire-uk',
    '/uk/small-claims-court-uk',
    '/uk/serving-court-documents-uk',
    '/us/case-law-research',
    '/us/small-claims-court-guide',
    '/us/self-represented-litigant-guide',
    '/us/organize-court-documents',
  ]

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: homeRoutes.has(route) ? 'weekly' : 'monthly',
    priority: homeRoutes.has(route) ? 1 : 0.7,
  }))
}
