'use client'

import Link from 'next/link'
import { useState } from 'react'

interface PreloadingLinkProps {
  href: string
  children: React.ReactNode
  className?: string
  prefetch?: boolean
}

export default function PreloadingLink({ href, children, className, prefetch = true }: PreloadingLinkProps) {
  const [hasPreloaded, setHasPreloaded] = useState(false)

  const handleMouseEnter = () => {
    if (!hasPreloaded && prefetch) {
      // Preload chatbot page when user hovers
      import('@/components/chatbot/ChatInterface')
      setHasPreloaded(true)
    }
  }

  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={className}
      onMouseEnter={handleMouseEnter}
    >
      {children}
    </Link>
  )
}
