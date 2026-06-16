# Security Quick Reference Card

## 🔐 Before Deploying Any API Change

### Checklist
- [ ] **Authentication**: Does unauthenticated user get 401?
- [ ] **Authorization**: Can user access only their own data?
- [ ] **Rate Limiting**: Is endpoint protected from brute force?
- [ ] **Input Validation**: Are all inputs validated with Zod/checking?
- [ ] **Error Messages**: Does error message leak sensitive info?
- [ ] **Logging**: Are sensitive operations logged for audit?
- [ ] **HTTPS**: Running on secure connection?

---

## 🛡️ Security Headers Status

### ✅ Implemented (middleware.ts)
- Content-Security-Policy - Prevents XSS
- X-Frame-Options: DENY - Prevents clickjacking
- X-Content-Type-Options: nosniff - Prevents MIME sniffing
- Strict-Transport-Security - Enforces HTTPS (production)
- X-XSS-Protection - Older browser support
- Referrer-Policy - Controls referrer leakage
- Permissions-Policy - Restricts browser features

---

## 🔑 Authentication Pattern

### Every API Route Must Have
```typescript
const supabase = await createSupabaseRouteClient()
const { data: authData, error } = await supabase.auth.getUser()

// FIRST check: Is user authenticated?
if (error || !authData?.user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// SECOND check: Does user own this resource?
const userId = authData.user.id
// Verify user_id matches in database query

// THIRD: Apply rate limiting
const rateLimit = await rateLimit(...)
if (!rateLimit.success) {
  return rateLimitExceededResponse(...)
}
```

---

## ⏱️ Rate Limiting Examples

### Chat Endpoint (10 req/60s per user)
```typescript
const limit = await rateLimit(aiRateLimiter, `ai:${userId}`, 10, 60000)
```

### Email Endpoint (3 req/10 min per IP)
```typescript
const limit = await rateLimit(emailRateLimiter, `email:${ip}`, 3, 600000)
```

### Custom Limit (30 req/10 min per user)
```typescript
const limit = await rateLimit(uploadRateLimiter, `custom:${userId}`, 30, 600000)
```

---

## 🔒 Secret Verification (Cron Jobs)

### ❌ WRONG (Timing Attack Vulnerable)
```typescript
if (headerSecret === cronSecret) { ... }
```

### ✅ CORRECT (Timing-Safe)
```typescript
import { verifyCronSecret } from '@/lib/security/timing-safe'
if (!verifyCronSecret(headerSecret, cronSecret)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

---

## 📨 Email Template Safety

### ❌ WRONG (XSS Vulnerable)
```typescript
const fullName = req.body.fullName
const html = `<p>Hi ${fullName}</p>` // User input as-is!
```

### ✅ CORRECT (HTML Escaped)
```typescript
import { htmlEscape } from '@/lib/utils/html-escape'
const fullName = req.body.fullName
const html = `<p>Hi ${htmlEscape(fullName)}</p>` // Safe!
```

---

## 🚨 Error Message Pattern

### ❌ WRONG (Information Disclosure)
```typescript
catch (error) {
  return NextResponse.json({ error: error.message }, { status: 500 })
}
// Client sees: "Row not found in table 'users'"
```

### ✅ CORRECT (Generic Message)
```typescript
catch (error) {
  console.error('Internal error:', error)  // Server logs details
  return NextResponse.json(
    { error: 'Request failed. Please try again later.' },
    { status: 500 }
  )
}
```

---

## 🔍 Data Access Pattern

### Verify User Owns Data
```typescript
// Get user's resource
const { data: ownedCase } = await supabase
  .from('cases')
  .select('id')
  .eq('id', caseId)
  .eq('user_id', userId)  // ← This is critical!
  .maybeSingle()

// If not found, user doesn't own it
if (!ownedCase) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

---

## 📋 Cron Job Security

### All Cron Jobs Must Have
```typescript
import { verifyCronSecret } from '@/lib/security/timing-safe'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = request.headers.get('x-cron-secret')
  
  if (!verifyCronSecret(headerSecret, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // ... rest of cron job
}
```

---

## 🧪 Manual Security Testing

### Test Unauthorized Access
```bash
curl -X GET https://app.com/api/documents \
  # No auth header - should return 401
```

### Test Rate Limiting
```bash
for i in {1..35}; do
  curl -X GET https://app.com/api/documents \
    -H "Authorization: Bearer TOKEN"
done
# After 30 requests should get 429
```

### Test CSRF (When Implemented)
```bash
curl -X POST https://app.com/api/stripe/plan-checkout \
  -H "Authorization: Bearer TOKEN" \
  -d '{"planId":"price_123"}' \
  # No CSRF token - should get 403
```

### Test Error Messages
```bash
curl -X GET https://app.com/api/documents/invalid-id
# Should NOT return database error details
```

---

## 🆘 Emergency Response

### If Data Breach Suspected
1. [ ] Enable request logging in Supabase
2. [ ] Review access logs last 24 hours
3. [ ] Check for unauthorized API calls
4. [ ] Notify affected users
5. [ ] Review and patch vulnerability
6. [ ] Document incident

### If Rate Limiting Bypassed
1. [ ] Check for attack pattern in logs
2. [ ] Increase rate limit temporarily
3. [ ] Add stricter per-IP limits
4. [ ] Review other endpoints for same issue
5. [ ] Consider adding WAF rules

### If Admin Account Compromised
1. [ ] Force password reset
2. [ ] Review admin actions last 7 days
3. [ ] Rotate all secrets (API keys, etc)
4. [ ] Enable 2FA on admin account
5. [ ] Audit Stripe/Supabase access logs

---

## 📞 Questions?

For security questions:
1. Check SECURITY_AUDIT.md for detailed analysis
2. Check SECURITY_IMPLEMENTATION_GUIDE.md for how-to
3. Review SECURITY_FIXES_SUMMARY.md for current status

---

**Last Updated**: June 13, 2026  
**Maintained By**: Security Team
