import type { Metadata } from 'next'
import './globals.css'
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics'
import ClientErrorReporter from '@/components/monitoring/ClientErrorReporter'
import RouteTitleManager from '@/components/seo/RouteTitleManager'
import {
  APP_FULL_NAME,
  APP_SHORT_NAME,
  DEFAULT_DESCRIPTION,
  OPEN_GRAPH_ALTERNATE_LOCALES,
  OPEN_GRAPH_LOCALE,
  SOCIAL_SHARE_IMAGE_HEIGHT,
  SOCIAL_SHARE_IMAGE_PATH,
  SOCIAL_SHARE_IMAGE_WIDTH,
  buildFullTitle,
  siteUrl,
} from '@/lib/seo'

const FAVICON_SVG_PATH = '/favicon-circle-padded.svg'
const googleAnalyticsMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: APP_FULL_NAME,
    template: `%s | ${APP_FULL_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
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
    locale: OPEN_GRAPH_LOCALE,
    alternateLocale: OPEN_GRAPH_ALTERNATE_LOCALES,
    url: siteUrl,
    title: buildFullTitle(),
    description: DEFAULT_DESCRIPTION,
    siteName: APP_FULL_NAME,
    images: [
      {
        url: SOCIAL_SHARE_IMAGE_PATH,
        width: SOCIAL_SHARE_IMAGE_WIDTH,
        height: SOCIAL_SHARE_IMAGE_HEIGHT,
        type: 'image/png',
        alt: APP_FULL_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_FULL_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [SOCIAL_SHARE_IMAGE_PATH],
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: FAVICON_SVG_PATH, type: 'image/svg+xml' },
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: FAVICON_SVG_PATH,
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
    name: APP_SHORT_NAME,
    alternateName: APP_FULL_NAME,
    url: siteUrl,
  }

  return (
    <html lang="en">
      <head>
        <link
          href="https://unpkg.com/boxicons@2.0.9/css/boxicons.min.css"
          rel="stylesheet"
        />
        <link rel="icon" href={FAVICON_SVG_PATH} type="image/svg+xml" />
        <link rel="shortcut icon" href={FAVICON_SVG_PATH} type="image/svg+xml" />
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
        <GoogleAnalytics measurementId={googleAnalyticsMeasurementId} />
        <ClientErrorReporter />
        <RouteTitleManager />
        {children}
      </body>
    </html>
  )
}
