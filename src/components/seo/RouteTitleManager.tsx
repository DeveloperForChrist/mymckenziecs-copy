'use client'

import { usePathname } from 'next/navigation'
import { useLayoutEffect, useMemo } from 'react'

const APP_NAME = 'MyMcKenzie Court Support'

const titleByPath: Record<string, string> = {
  '/': 'Home',
  '/about': 'About',
  '/contact': 'Contact',
  '/pricing': 'Pricing',
  '/faq': 'Plans FAQ',
  '/help': 'Help',
  '/terms': 'Terms and Conditions',
  '/privacy-policy': 'Privacy Policy',
  '/cookie-policy': 'Cookie Policy',
  '/chatbot': 'Chat Assistant',
  '/settings': 'Settings',
  '/dashboard': 'Dashboard',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/case-law-search': 'Case Law Search',
  '/dashboard/documents': 'Documents',
  '/dashboard/MyNotes': 'My Notes',
  '/dashboard/mynotes': 'My Notes',
  '/auth/signin': 'Sign In',
  '/auth/signup': 'Create Account',
  '/auth/reset-password': 'Reset Password',
  '/checkout/success': 'Checkout Success',
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
    const nextTitle = pageTitle === APP_NAME ? APP_NAME : `${APP_NAME} - ${pageTitle}`
    const applyTitle = () => {
      if (document.title !== nextTitle) {
        document.title = nextTitle
      }
    }

    applyTitle()
    const raf = requestAnimationFrame(applyTitle)
    const timer = window.setTimeout(applyTitle, 120)
    const timer2 = window.setTimeout(applyTitle, 500)
    const timer3 = window.setTimeout(applyTitle, 1000)

    const titleObserver = new MutationObserver(() => applyTitle())
    const headObserver = new MutationObserver(() => applyTitle())
    const titleNode = document.querySelector('title')
    if (titleNode) {
      titleObserver.observe(titleNode, { childList: true, characterData: true, subtree: true })
    }
    if (document.head) {
      headObserver.observe(document.head, { childList: true, subtree: true })
    }

    const onFocus = () => applyTitle()
    const onVisibility = () => applyTitle()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      window.clearTimeout(timer2)
      window.clearTimeout(timer3)
      titleObserver.disconnect()
      headObserver.disconnect()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pageTitle])

  return null
}
