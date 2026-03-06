import type { Metadata } from 'next'
import './globals.css'
import ClientErrorReporter from '@/components/monitoring/ClientErrorReporter'
import RouteTitleManager from '@/components/seo/RouteTitleManager'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.mymckenziecs.com'
const APP_FULL_NAME = 'MyMcKenzie Court Support'
const APP_SHORT_NAME = 'MyMcKenzieCS'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: APP_FULL_NAME,
    template: `%s | ${APP_FULL_NAME}`,
  },
  description: 'MyMcKenzie Court Support is an AI-assisted workspace for litigants in person.',
  applicationName: APP_FULL_NAME,
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    title: APP_FULL_NAME,
    description: 'MyMcKenzie Court Support is an AI-assisted workspace for litigants in person.',
    siteName: APP_FULL_NAME,
    images: [
      {
        url: '/logo-mymckenzie.svg',
        width: 1200,
        height: 630,
        alt: APP_FULL_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_FULL_NAME,
    description: 'MyMcKenzie Court Support is an AI-assisted workspace for litigants in person.',
    images: ['/logo-mymckenzie.svg'],
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-source.png', sizes: '1080x1080', type: 'image/png' },
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: APP_FULL_NAME,
    alternateName: APP_SHORT_NAME,
    url: siteUrl,
    logo: `${siteUrl}/logo-mymckenzie.svg`,
  }

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: APP_FULL_NAME,
    alternateName: APP_SHORT_NAME,
    url: siteUrl,
  }

  return (
    <html lang="en">
      <head>
        <link
          href="https://unpkg.com/boxicons@2.0.9/css/boxicons.min.css"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body>
        <ClientErrorReporter />
        <RouteTitleManager />
        {children}
      </body>
    </html>
  )
}
