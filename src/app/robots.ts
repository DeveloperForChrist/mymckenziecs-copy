import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/chatbot',
          '/us/chatbot',
          '/checkout/',
          '/us/checkout/',
          '/dashboard',
          '/us/dashboard',
          '/settings',
          '/us/settings',
          '/workspace',
          '/us/workspace',
          '/admin',
          '/jesusistheadmin',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
