# Security & Reliability Features

This document describes the security and reliability features added to MyMcKenzie Next.js 2.

## 🛡️ Features Implemented

### 1. Middleware Authentication
**File**: `middleware.ts`

Edge-level route protection using Supabase Auth. Protects routes before they reach your API handlers.

**Protected Routes**:
- `/dashboard/*` - User dashboard and features
- `/chatbot` - AI chat interface
- `/settings` - User settings
- `/api/chat` - Chat API
- `/api/analyze-document` - Document analysis
- `/api/search-case-law` - Case law search
- `/api/cases` - Case management
- All other authenticated API routes

**Admin Routes**:
- `/admin/*` - Admin dashboard
- `/api/admin/*` - Admin API endpoints

**Benefits**:
- ✅ Faster than page-level auth checks
- ✅ Consistent auth across all routes
- ✅ Automatically handles session refresh
- ✅ Redirects unauthenticated users to sign-in

### 2. Rate Limiting
**File**: `src/lib/utils/rate-limit.ts`

Protects expensive AI operations from abuse and controls costs.

**Rate Limits**:
- **AI Operations** (chat, document analysis, case law search): 10 requests per 60 seconds
- **General API**: 100 requests per 60 seconds
- **Auth Attempts**: 5 requests per 5 minutes

**Features**:
- ✅ In-memory fallback when Redis is not configured
- ✅ Works with Upstash Redis for production
- ✅ Per-user or per-IP limiting
- ✅ Returns rate limit headers (`X-RateLimit-*`)

**Setup** (Optional but Recommended):
```bash
# Sign up at https://upstash.com
# Add to .env.local:
UPSTASH_REDIS_REST_URL=your_url
UPSTASH_REDIS_REST_TOKEN=your_token
```

Without Upstash, it uses in-memory rate limiting (works but resets on server restart).

### 3. Error Monitoring (Sentry)
**Files**: 
- `sentry.server.config.ts`
- `sentry.client.config.ts`
- `sentry.edge.config.ts`
- `next.config.js` (Sentry integration)

Automatically captures and reports errors in production.

**Features**:
- ✅ Client-side error tracking
- ✅ Server-side error tracking
- ✅ Edge/middleware error tracking
- ✅ Session replay for debugging
- ✅ Performance monitoring
- ✅ Filters sensitive data (passwords, tokens)

**Setup**:
```bash
# Sign up at https://sentry.io
# Add to .env.local:
SENTRY_DSN=your_dsn
NEXT_PUBLIC_SENTRY_DSN=your_dsn
SENTRY_ORG=your_org
SENTRY_PROJECT=your_project
SENTRY_AUTH_TOKEN=your_auth_token
```

**Usage in Code**:
```typescript
import * as Sentry from '@sentry/nextjs'

try {
  // Your code
} catch (error) {
  Sentry.captureException(error, {
    tags: { api: 'chat', userId },
  })
}
```

### 4. Input Validation (Zod)
**Files**: 
- `src/validators/index.ts` - General schemas
- `src/validators/api-schemas.ts` - API-specific schemas

Type-safe validation for all API inputs using Zod.

**Schemas Available**:
- `chatMessageSchema` - Chat messages
- `analyzeDocumentSchema` - Document analysis requests
- `caseLawSearchSchema` - Case law searches
- `caseSchema` - Case creation/updates
- `userProfileSchema` - User profile data
- `contactFormSchema` - Contact form submissions
- And many more...

**Usage in API Routes**:
```typescript
import { chatMessageSchema } from '@/validators/index'

const validation = chatMessageSchema.safeParse(body)
if (!validation.success) {
  return NextResponse.json(
    { error: 'Invalid input', details: validation.error.errors },
    { status: 400 }
  )
}
```

**Benefits**:
- ✅ Prevents invalid data from reaching your database
- ✅ Prevents injection attacks
- ✅ Type-safe with TypeScript
- ✅ Clear error messages for debugging

### 5. Automated Testing
**Framework**: Vitest + React Testing Library

**Test Files**:
- `src/__tests__/smoke.test.ts` - Basic smoke tests
- `src/__tests__/validators.test.ts` - Validation schema tests
- `src/__tests__/rate-limit.test.ts` - Rate limiting tests

**Commands**:
```bash
npm test                # Run tests once
npm run test:watch      # Watch mode for development
npm run test:coverage   # Generate coverage report
```

**What's Tested**:
- ✅ Environment variable presence
- ✅ API route exports
- ✅ Validation schema behavior
- ✅ Rate limiting logic

**Add More Tests**:
Create new test files in `src/__tests__/`:
```typescript
import { describe, it, expect } from 'vitest'

describe('My Feature', () => {
  it('should work correctly', () => {
    expect(true).toBe(true)
  })
})
```

## 📊 API Routes Updated

The following routes now have rate limiting, validation, and error monitoring:

1. **`/api/chat`** - Chat with AI
   - Rate limit: 10 req/min
   - Validation: Message content, case ID
   - Error tracking: All exceptions

2. **`/api/analyze-document`** - Document analysis
   - Rate limit: 10 req/min
   - Validation: Document content, type
   - Error tracking: All exceptions

3. **`/api/search-case-law`** - Search case law
   - Rate limit: 10 req/min
   - Validation: Search query, filters
   - Error tracking: All exceptions

## 🚀 Quick Start

### Development
```bash
# Install dependencies (already done)
npm install

# Run tests
npm test

# Start dev server
npm run dev
```

### Production Checklist

1. **Set up Sentry** (Recommended):
   - Sign up at https://sentry.io
   - Add credentials to `.env.local`
   - Errors will be automatically tracked

2. **Set up Upstash Redis** (Optional):
   - Sign up at https://upstash.com
   - Add credentials to `.env.local`
   - Better rate limiting performance

3. **Review Middleware**:
   - Check `middleware.ts` for route protection
   - Add/remove routes as needed

4. **Test Rate Limits**:
   - Try making 11 rapid requests to `/api/chat`
   - Should receive 429 error on 11th request

5. **Run Tests**:
   ```bash
   npm test
   ```

## 📝 Adding More Validations

To add validation to a new API route:

```typescript
// 1. Create schema in src/validators/index.ts
export const myNewSchema = z.object({
  field: z.string().min(1),
})

// 2. Use in your API route
import { myNewSchema } from '@/validators/index'

export async function POST(req: NextRequest) {
  const body = await req.json()
  
  const validation = myNewSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.errors },
      { status: 400 }
    )
  }
  
  // Continue with validated data
}
```

## 🔧 Configuration

### Adjust Rate Limits

Edit `src/lib/utils/rate-limit.ts`:

```typescript
// Change from 10 requests to 20 requests per 60 seconds
export const aiRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '60 s'), // Changed from 10
      // ...
    })
  : null
```

### Adjust Sentry Sampling

Edit `sentry.*.config.ts`:

```typescript
Sentry.init({
  tracesSampleRate: 0.5, // 50% of transactions (change as needed)
  replaysSessionSampleRate: 0.1, // 10% of sessions
  // ...
})
```

## 🎯 Next Steps

Consider adding:
1. **Email Notifications** - Use Postmark for transactional emails
2. **WebSocket Support** - Real-time updates for case changes
3. **Caching** - Add Redis caching for expensive queries
4. **API Documentation** - Swagger/OpenAPI docs
5. **More Tests** - Increase coverage to 80%+

## 📚 Resources

- [Sentry Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Upstash Docs](https://docs.upstash.com/redis)
- [Zod Docs](https://zod.dev/)
- [Vitest Docs](https://vitest.dev/)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)

## 🐛 Troubleshooting

**Rate limiting not working**:
- Check if UPSTASH credentials are set (optional)
- In-memory fallback should work automatically

**Sentry not capturing errors**:
- Verify SENTRY_DSN is set in .env.local
- Check Sentry dashboard for errors

**Tests failing**:
- Run `npm install` to ensure all dependencies are installed
- Check environment variables are set

**Middleware redirecting unexpectedly**:
- Check your Supabase session is valid
- Clear cookies and sign in again

## 📄 License

Same as main project.
