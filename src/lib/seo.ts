import type { Metadata } from 'next'
import getAppUrl from '@/lib/app-url'

export const APP_FULL_NAME = 'MyMcKenzieCS'
export const APP_SHORT_NAME = 'MyMcKenzieCS'
export const DEFAULT_DESCRIPTION =
  'MyMcKenzieCS is the legal self-help workspace for self-represented litigants in the UK and US. Organise case documents, track deadlines, and get procedural support in one place.'
export const SOCIAL_SHARE_IMAGE_PATH = '/favicon-source.png'
export const SOCIAL_SHARE_IMAGE_WIDTH = 1080
export const SOCIAL_SHARE_IMAGE_HEIGHT = 1080
export const siteUrl = getAppUrl().replace(/\/+$/, '')

const googleBotPreviewDirectives = {
  'max-image-preview': 'large' as const,
  'max-snippet': -1 as const,
  'max-video-preview': -1 as const,
}

export const NO_INDEX_METADATA: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      ...googleBotPreviewDirectives,
    },
  },
}

type BuildPageMetadataOptions = {
  title?: string
  description?: string
  path?: string
  noIndex?: boolean
}

const normalizePath = (path: string = '/') => {
  if (!path || path === '/') return '/'

  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`
  return withLeadingSlash.replace(/\/+$/, '')
}

export const buildCanonicalUrl = (path: string = '/') => new URL(normalizePath(path), siteUrl).toString()

export const buildFullTitle = (title?: string) => {
  const normalizedTitle = title?.trim()
  return normalizedTitle ? `${normalizedTitle} | ${APP_FULL_NAME}` : APP_FULL_NAME
}

export function buildPageMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  noIndex = false,
}: BuildPageMetadataOptions): Metadata {
  const normalizedPath = normalizePath(path)
  const normalizedTitle = title?.trim()
  const normalizedDescription = description.trim()

  return {
    ...(normalizedTitle ? { title: normalizedTitle } : { title: { absolute: APP_FULL_NAME } }),
    description: normalizedDescription,
    alternates: {
      canonical: normalizedPath,
    },
    ...(noIndex ? NO_INDEX_METADATA : {}),
    openGraph: {
      type: 'website',
      locale: 'en_GB',
      url: buildCanonicalUrl(normalizedPath),
      title: buildFullTitle(normalizedTitle),
      description: normalizedDescription,
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
      title: buildFullTitle(normalizedTitle),
      description: normalizedDescription,
      images: [SOCIAL_SHARE_IMAGE_PATH],
    },
  }
}
