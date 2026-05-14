'use client'

import { usePathname } from 'next/navigation'
import { useLayoutEffect, useMemo } from 'react'

const APP_NAME = 'MyMcKenzieCS'

const titleByPath: Record<string, string> = {
  '/': 'Case Support Software for Legal Support Practices',
  '/uk': 'Case Support Software for UK Legal Support Practices',
  '/us': 'Case Support Workspace for U.S. Legal Support Work',
  '/about': 'About',
  '/us/about': 'About the U.S. Version',
  '/contact': 'Contact',
  '/us/contact': 'U.S. Contact',
  '/pricing': 'Pricing Plans',
  '/pricing/litigants': 'Litigant Pricing Plans',
  '/pricing/business': 'Business Pricing Plans',
  '/uk/pricing': 'Pricing Plans',
  '/uk/pricing/litigants': 'UK Litigant Pricing Plans',
  '/uk/pricing/business': 'UK Business Pricing Plans',
  '/us/pricing': 'U.S. Pricing Plans',
  '/us/pricing/litigants': 'U.S. Litigant Pricing Plans',
  '/us/pricing/business': 'U.S. Business Pricing Plans',
  '/faq': 'Plans FAQ',
  '/us/faq': 'U.S. Plans FAQ',
  '/help': 'Help',
  '/us/help': 'U.S. Help',
  '/terms': 'Terms and Conditions',
  '/us/terms': 'U.S. Terms and Conditions',
  '/privacy-policy': 'Privacy Policy',
  '/us/privacy-policy': 'U.S. Privacy Policy',
  '/cookie-policy': 'Cookie Policy',
  '/us/cookie-policy': 'U.S. Cookie Policy',
  '/chatbot': 'Chat Assistant',
  '/us/chatbot': 'U.S. Chat Assistant',
  '/settings': 'Settings',
  '/us/settings': 'U.S. Settings',
  '/dashboard': 'Dashboard',
  '/business/dashboard': 'Business Dashboard',
  '/us/dashboard': 'U.S. Dashboard',
  '/dashboard/calendar': 'Calendar',
  '/us/dashboard/calendar': 'U.S. Calendar',
  '/dashboard/case-law-search': 'Case Law Search',
  '/us/dashboard/case-law-search': 'U.S. Case Law Search',
  '/dashboard/documents': 'Documents',
  '/us/dashboard/documents': 'U.S. Documents',
  '/dashboard/MyNotes': 'My Notes',
  '/us/dashboard/MyNotes': 'U.S. My Notes',
  '/dashboard/mynotes': 'My Notes',
  '/us/dashboard/mynotes': 'U.S. My Notes',
  '/auth/signin': 'Sign In',
  '/auth/signup': 'Create Account',
  '/auth/reset-password': 'Reset Password',
  '/auth/verify-email': 'Verify Email',
  '/checkout/success': 'Checkout Success',
  '/us/checkout/success': 'U.S. Checkout Success',
  '/admin': 'Admin Login',
  '/admin/dashboard': 'Admin Dashboard',
  '/jesusistheadmin': 'Admin Login',
  '/jesusistheadmin/dashboard': 'Admin Dashboard',
}

const normalizePath = (value: string) => {
  if (!value) return '/'
  if (value === '/') return '/'
  return value.endsWith('/') ? value.slice(0, -1) : value
}

const segmentLabelOverrides: Record<string, string> = {
  chatbot: 'Chat Assistant',
  mynotes: 'My Notes',
  'case-law-search': 'Case Law Search',
  signin: 'Sign In',
  signup: 'Create Account',
  'reset-password': 'Reset Password',
  faq: 'Plans FAQ',
  admin: 'Admin',
  jesusistheadmin: 'Admin',
}

const isDynamicPathPart = (segment: string) => {
  if (!segment) return true
  if (/^\d+$/.test(segment)) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)) return true
  if (/^[a-z0-9_-]{20,}$/i.test(segment)) return true
  return false
}

const toTitleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

const titleFromPath = (pathname: string): string => {
  const segments = normalizePath(pathname)
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))

  if (segments.length === 0) return 'Home'

  let candidate = segments[segments.length - 1]
  if (isDynamicPathPart(candidate) && segments.length > 1) {
    candidate = segments[segments.length - 2]
  }

  const lowerCandidate = candidate.toLowerCase()
  if (segmentLabelOverrides[lowerCandidate]) return segmentLabelOverrides[lowerCandidate]

  return toTitleCase(candidate.replace(/[-_]+/g, ' '))
}

const resolveTitle = (pathname: string): string => {
  const normalized = normalizePath(pathname)
  if (titleByPath[normalized]) return titleByPath[normalized]
  return titleFromPath(normalized) || APP_NAME
}

export default function RouteTitleManager() {
  const pathname = usePathname()
  const pageTitle = useMemo(() => resolveTitle(pathname || '/'), [pathname])

  useLayoutEffect(() => {
    const nextTitle = pageTitle === APP_NAME ? APP_NAME : `${pageTitle} | ${APP_NAME}`
    if (document.title !== nextTitle) {
      document.title = nextTitle
    }
  }, [pageTitle])

  return null
}
