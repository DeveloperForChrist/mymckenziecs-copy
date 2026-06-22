// This file configures the initialization of Sentry on the server.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

type SanitizableRequestData = Record<string, unknown>

type SentryServerEvent = {
  request?: {
    data?: unknown
  }
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: process.env.NODE_ENV === 'development',

  environment: process.env.NODE_ENV,

  // Filter out sensitive data
  beforeSend(event: SentryServerEvent) {
    // Filter out passwords and tokens
    if (event.request?.data) {
      const data = event.request.data as SanitizableRequestData;
      if (typeof data === 'object') {
        ['password', 'token', 'apiKey', 'secret'].forEach(key => {
          if (key in data) {
            data[key] = '[Filtered]';
          }
        });
      }
    }
    return event;
  },
});
