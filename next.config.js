// Ensure `self` is available in the Node build/runtime environment
if (typeof global.self === 'undefined') global.self = globalThis;

const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [],
  },
  env: {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Bundle optimization
  experimental: {
    optimizeCss: true,
  },
  
  // Keep only lightweight client fallbacks; avoid manual splitChunks overrides
  // because Next.js manages chunking for App Router and custom settings can
  // break module runtime loading in the browser.
  webpack: (config, { isServer }) => {
    // pdf-parse uses an internal dynamic require that webpack flags as a
    // critical dependency. This warning is expected and non-breaking here.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /pdf-parse[\\/]dist[\\/]pdf-parse[\\/]cjs[\\/]index\.cjs/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    if (!config.output) config.output = {};
    config.output.globalObject = 'globalThis';
    
    return config;
  },
}

module.exports = withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Disable automatic injection of client config (we use instrumentation-client.ts)
  automaticInstrumentation: {
    clientSdk: false,
  },

  // Updated webpack config
  webpack: {
    // Automatically annotate React components to show their full name in breadcrumbs and session replay
    reactComponentAnnotation: {
      enabled: true,
    },
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    treeshake: {
      removeDebugLogging: true,
    },
    // Enables automatic instrumentation of Vercel Cron Monitors
    automaticVercelMonitors: true,
  },
});
