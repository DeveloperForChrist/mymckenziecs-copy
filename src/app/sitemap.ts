import type { MetadataRoute } from 'next'

const normalizeSiteUrl = (value: string) =>
  value.replace(/^https?:\/\/www\./i, 'https://').replace(/\/+$/, '')

const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || 'https://mymckenziecs.com')

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
