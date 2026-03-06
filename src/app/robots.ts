import type { MetadataRoute } from 'next'

const normalizeSiteUrl = (value: string) =>
  value.replace(/^https?:\/\/www\./i, 'https://').replace(/\/+$/, '')

const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || 'https://mymckenziecs.com')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
