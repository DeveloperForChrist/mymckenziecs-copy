# Backend Security Implementation Guide
**Version**: 1.0  
**Last Updated**: June 13, 2026  
**Target**: Complete security hardening of MyMcKenzieCS backend

---

## Overview

This guide provides step-by-step instructions for implementing the remaining security fixes. All critical vulnerabilities have been addressed. This guide covers medium and high-priority improvements.

---

## Part 1: CSRF Protection Implementation

### Why CSRF Protection?

Cross-Site Request Forgery (CSRF) attacks trick users into performing unintended actions. Example:

```
1. User logs into MyMcKenzieCS (authenticated)
2. User visits attacker's website
3. Attacker's page makes: fetch('/api/stripe/cancel-subscription', {method: 'POST'})
4. Browser automatically includes user's authentication cookies
5. User's subscription is canceled without consent
```

### Solution: CSRF Tokens

The implementation is already prepared in `src/lib/security/csrf.ts`. To use it:

#### Step 1: Initialize CSRF Token on Page Load

Add to your frontend initialization (e.g., in layout or middleware):

```typescript
// src/app/layout.tsx or similar
export default function RootLayout() {
  useEffect(() => {
    // Fetch CSRF token from server
    fetch('/api/security/csrf-token')
      .then(r => r.json())
      .then(data => {
        // Store token in memory (not localStorage for security)
        window.__CSRF_TOKEN = data.token
      })
  }, [])
  
  return (...)
}
```

#### Step 2: Create CSRF Token Endpoint

```typescript
// src/app/api/security/csrf-token/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { addCsrfTokenToResponse } from '@/lib/security/csrf'

export async function GET(request: NextRequest) {
  const response = NextResponse.json({ success: true })
  return addCsrfTokenToResponse(response)
}
```

#### Step 3: Protect API Routes

For all state-changing routes (POST, PUT, DELETE), add validation:

```typescript
// src/app/api/stripe/plan-checkout/route.ts
import { validateCsrfToken } from '@/lib/security/csrf'

export async function POST(request: NextRequest) {
  // Validate CSRF token FIRST (before any other logic)
  if (!await validateCsrfToken(request)) {
    return NextResponse.json(
      { error: 'Security validation failed' },
      { status: 403 }
    )
  }
  
  // ... rest of handler
}
```

#### Step 4: Send Token with All API Requests

Update your API client to include the CSRF token:

```typescript
// src/lib/api-client.ts or similar
async function apiCall(method: string, url: string, body?: any) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  
  // Add CSRF token for state-changing requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && window.__CSRF_TOKEN) {
    headers['x-csrf-token'] = window.__CSRF_TOKEN
  }
  
  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // Important: include cookies
  })
}
```

---

## Part 2: Rate Limiting Remaining Endpoints

### Current Status

- ✅ POST /api/chat - Rate limited
- ✅ POST /api/documents - Rate limited  
- ✅ GET /api/documents - Rate limited
- ❌ GET /api/case-law-history - NOT rate limited
- ❌ GET /api/search-case-law - NOT rate limited
- ❌ GET /api/cases - NOT rate limited
- ❌ GET /api/notes - NOT rate limited
- ❌ GET /api/chat-history - NOT rate limited

### Implementation Pattern

All endpoints follow the same pattern:

```typescript
import { getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse, uploadRateLimiter } from '@/lib/utils/rate-limit'

export async function GET(request: NextRequest) {
  // 1. Get authenticated user
  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Apply rate limiting (IMMEDIATELY after auth)
  const ip = getClientIp(request.headers)
  const identifier = `endpoint-name:user:${getIdentifier(authData.user.id, ip)}`
  const limit = await rateLimit(uploadRateLimiter, identifier, 30, 10 * 60 * 1000)
  if (!limit.success) {
    return rateLimitExceededResponse(limit, 'Too many requests to this endpoint')
  }

  // 3. Your actual handler logic
  // ...
}
```

### Add Rate Limiting to These Endpoints

#### 1. GET /api/case-law-history

```typescript
// Before: const { data: authData, error: authError } = await supabase.auth.getUser();
// After:
const { data: authData, error: authError } = await supabase.auth.getUser();
if (authError || !authData?.user) {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}

const ip = getClientIp(request.headers);
const rateLimitKey = `case-law-history:user:${getIdentifier(authData.user.id, ip)}`;
const limitResult = await rateLimit(uploadRateLimiter, rateLimitKey, 30, 10 * 60 * 1000);
if (!limitResult.success) {
  return rateLimitExceededResponse(limitResult, 'Too many history requests');
}
```

#### 2. GET /api/search-case-law

```typescript
// Same pattern, with tighter limit (20 req/10 min for expensive search)
const limitResult = await rateLimit(uploadRateLimiter, rateLimitKey, 20, 10 * 60 * 1000);
```

#### 3. GET /api/cases

```typescript
// Standard pattern (30 req/10 min)
const limitResult = await rateLimit(uploadRateLimiter, rateLimitKey, 30, 10 * 60 * 1000);
```

---

## Part 3: Error Message Sanitization

### Current Problem

```typescript
// BAD: Leaks error details
catch (error: any) {
  return NextResponse.json({ error: error.message }, { status: 500 })
}
// Client sees: "Row not found in table 'documents' with primary key '123'"
```

### Solution Pattern

```typescript
// GOOD: Generic message to client, detailed logging server-side
catch (error: any) {
  console.error('Document operation failed:', {
    error: error instanceof Error ? error.message : String(error),
    code: error?.code,
    details: error?.details,
    timestamp: new Date().toISOString(),
  })
  
  return NextResponse.json(
    { error: 'Request failed. Please try again later.' },
    { status: 500 }
  )
}
```

### Files to Update

Files containing error disclosure:
- [ ] `src/app/api/chat/route.ts`
- [ ] `src/app/api/documents/route.ts`  
- [ ] `src/app/api/cases/route.ts`
- [ ] `src/app/api/notes/route.ts`
- [ ] All `src/app/api/stripe/*` routes

---

## Part 4: HTML Escape User Input in Emails

### Current Problem

```typescript
const fullName = body.fullName  // User input: "<img src=x onerror=alert('XSS')>"
// Later in email template:
const htmlBody = `
  <p>Hi ${fullName.split(' ')[0]}</p>
`
// Email client executes JavaScript!
```

### Solution

Create a utility function:

```typescript
// src/lib/utils/html-escape.ts
export function htmlEscape(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return String(text).replace(/[&<>"']/g, (m) => map[m])
}
```

Usage in email templates:

```typescript
import { htmlEscape } from '@/lib/utils/html-escape'

const fullName = body.fullName
const htmlBody = `
  <p>Hi ${htmlEscape(fullName.split(' ')[0])},</p>
  <p>We received your message.</p>
`
```

### Files to Update

All email-sending files:
- [ ] `src/app/api/auth/signup/route.ts` - Escape fullName
- [ ] `src/app/api/stripe/webhook/route.ts` - Escape user names
- [ ] `src/app/api/contact/route.ts` - Escape email, name, subject, message
- [ ] `src/app/api/auth/resend-verification/route.ts` - Escape name
- [ ] Any other email rendering functions

---

## Part 5: Path Traversal Prevention

### Current Status

File: `src/app/api/documents/route.ts` (line 15-16)

```typescript
const sanitizeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._\- ]/g, '').trim() || 'uploaded-document'
```

### Problem

The `..` characters are removed, but combined with `/` they could still be an issue:
- Input: `../../../etc/passwd` becomes `etcpasswd` ✅ Safe (by accident)
- But: Better to be explicit

### Fix

```typescript
const sanitizeFilename = (name: string): string => {
  // Reject anything that looks like path traversal
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    return 'uploaded-document'
  }
  
  // Remove any non-safe characters
  const sanitized = name.replace(/[^a-zA-Z0-9._\- ]/g, '').trim()
  return sanitized || 'uploaded-document'
}
```

---

## Part 6: Verify Admin Routes

### Checklist

All admin routes should:
1. Check authentication
2. Check admin authorization  
3. Log access
4. Rate limit appropriately

### Verification Script

```bash
# Test each admin endpoint
curl -X GET http://localhost:3000/api/admin/users \
  -H "Cookie: admin-session=" \
  # Should return 401 if session invalid

curl -X GET http://localhost:3000/api/admin/users \
  -H "Cookie: admin-session=valid-token-here" \
  # Should return 200/data if authorized
```

### Admin Routes to Verify

- [ ] POST /api/admin/login - Rate limited ✅
- [ ] POST /api/admin/logout - CSRF protected
- [ ] GET /api/admin/users - Auth & logged
- [ ] GET /api/admin/cases - Auth & logged
- [ ] GET /api/admin/documents - Auth & logged
- [ ] GET /api/admin/metrics - Auth & logged
- [ ] GET /api/admin/api-usage - Auth & logged
- [ ] GET /api/admin/feedback - Auth & logged
- [ ] GET /api/admin/analytics - Auth & logged
- [ ] GET /api/admin/system - Auth & logged

---

## Implementation Checklist

### Week 1: Critical Fixes
- [x] Security headers middleware
- [x] Timing-safe secret comparison
- [x] Rate limit sample GET endpoint
- [ ] CSRF protection on 3 billing routes (2-3 hours)
- [ ] Rate limit 4 remaining GET endpoints (1 hour)

### Week 2: Important Fixes
- [ ] Path traversal fix (15 min)
- [ ] Verify all admin routes (2 hours)
- [ ] Error message sanitization (2 hours)
- [ ] HTML escape emails (2 hours)

### Week 3: Testing & Validation
- [ ] Security headers test
- [ ] CSRF bypass attempts
- [ ] Rate limit testing
- [ ] Admin access logging
- [ ] Error message validation

---

## Testing Commands

### Test Security Headers
```bash
curl -I https://yourapp.com/api/chat
# Look for: Content-Security-Policy, X-Frame-Options, Strict-Transport-Security
```

### Test Rate Limiting
```bash
# Should fail after 30 requests in 10 minutes
for i in {1..35}; do
  curl -H "Authorization: Bearer TOKEN" \
    https://yourapp.com/api/documents
done
```

### Test CSRF Protection
```bash
# Should fail without CSRF token
curl -X POST https://yourapp.com/api/stripe/plan-checkout \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"planId":"price_123"}'
# Expected: 403 CSRF validation failed
```

### Test HTML Escaping in Emails
```typescript
// Send signup with XSS payload
const body = {
  email: 'test@test.com',
  fullName: '<img src=x onerror="alert(1)">',
  password: 'Test123!'
}

// Check email: should show literal HTML, not execute JavaScript
```

---

## Monitoring & Alerting

After implementing fixes, monitor:

1. **Failed Rate Limits**: Alert if >100/hour from single IP
2. **Failed CSRF Validation**: Alert if >10/hour
3. **Auth Failures**: Alert if >50/hour for admin routes
4. **Error Logs**: Review daily for leaked information

---

## References

- [OWASP Top 10 2021](https://owasp.org/www-project-top-ten/)
- [CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Rate Limiting](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Prevention_Cheat_Sheet.html)

---

