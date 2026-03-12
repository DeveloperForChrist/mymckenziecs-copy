import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyMcKenzieCS',
    short_name: 'MyMcKenzieCS',
    description: 'MyMcKenzieCS is an AI-assisted self-help workspace for litigants in person.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#270427',
    icons: [
      {
        src: '/favicon-circle-padded.svg',
        type: 'image/svg+xml',
      },
      {
        src: '/favicon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/favicon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
