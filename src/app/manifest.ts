import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyMcKenzie Court Support',
    short_name: 'MyMcKenzieCS',
    description: 'MyMcKenzie Court Support is an AI-assisted workspace for litigants in person.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#270427',
    icons: [
      {
        src: '/favicon-source.png',
        sizes: '1080x1080',
        type: 'image/png',
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
