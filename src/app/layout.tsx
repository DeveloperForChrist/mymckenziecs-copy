import type { Metadata } from 'next'
import './globals.css'
import ClientErrorReporter from '@/components/monitoring/ClientErrorReporter'

export const metadata: Metadata = {
  title: 'MymckenzieCS',
  description: 'Legal assistance platform for litigants in person',
  icons: {
    icon: '/assets/mymckenzie-high-resolution-logo (7) 1.svg',
    shortcut: '/assets/mymckenzie-high-resolution-logo (7) 1.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://unpkg.com/boxicons@2.0.9/css/boxicons.min.css"
          rel="stylesheet"
        />
        <link
          rel="icon"
          href="/assets/mymckenzie-high-resolution-logo (7) 1.svg"
          type="image/svg+xml"
        />
      </head>
      <body>
        <ClientErrorReporter />
        {children}
      </body>
    </html>
  )
}
