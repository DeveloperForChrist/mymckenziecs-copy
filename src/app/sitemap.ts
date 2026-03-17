import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const routes = [
    '',
    '/about',
    '/pricing',
    '/faq',
    '/help',
    '/contact',
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
