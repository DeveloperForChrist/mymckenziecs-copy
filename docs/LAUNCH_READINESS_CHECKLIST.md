# Launch Readiness Checklist

Run this before each production deploy:

```bash
npm run launch:check
```

Optional modes:

```bash
# Skip build (faster local check)
npm run launch:check -- --skip-build

# Include tests
npm run launch:check -- --with-tests
```

## What `launch:check` verifies

- Required environment variables exist and are not placeholder-like values.
- TypeScript compiles (`npm run type-check`).
- ESLint has no blocking issues (`npm run lint -- --quiet`).
- Production build succeeds (`npm run build -- --webpack`) unless skipped.

## Manual production gates (required for 200k+/month)

1. Infrastructure scaling
- App runtime autoscaling min/max instances and concurrency are configured.
- DB connection pooling limits are configured and tested.

2. Observability and alerting
- Error rate alerts (5xx, failed webhooks, auth failures).
- Latency alerts for p95/p99 on `/api/chat`, `/api/user/plan`, `/api/documents`.
- Token/cost alerts for model providers.

3. External dependency resilience
- Stripe webhook retries verified.
- AI provider fallback behavior verified.
- Email provider failure handling verified.

4. Data safety
- Supabase backup and restore drill completed.
- Critical migrations are applied in production.
- RLS policies verified for user data tables.

5. Load verification
- Run synthetic load tests against hottest routes:
  - `POST /api/chat`
  - `GET /api/user/plan`
  - `GET /api/documents`
- Confirm p95 latency and error rates at expected peak concurrency.

## Built-in load test runner

Use the built-in runner:

```bash
# Chat-only (authenticated paid user required)
npm run load:test:chat

# Chat-only with rotating synthetic IPs to avoid rate-limit saturation in benchmark runs
LOAD_TEST_ROTATE_IP=1 npm run load:test -- --target chat --seconds 120 --concurrency 80

# Mixed workload (requires a real Supabase SSR auth cookie)
TOKENS=$(curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  --data '{"email":"<email>","password":"<password>"}')
LOAD_TEST_AUTH_COOKIE=$(npm run -s auth:cookie -- \
  --access-token "$(echo "$TOKENS" | jq -r '.access_token')" \
  --refresh-token "$(echo "$TOKENS" | jq -r '.refresh_token')")
npm run load:test:mixed
```

Custom command:

```bash
npm run load:test -- --target chat --seconds 120 --concurrency 80 --base-url http://127.0.0.1:3000

# Force full LLM path instead of support-intent short path
npm run load:test -- --target chat --chat-prompt full --seconds 60 --concurrency 20
```

Recommended starting thresholds (adjust after baseline):
- Error rate: `< 1%`
- `p95` latency:
  - `/api/user/plan` `< 250ms`
  - `/api/documents` `< 400ms`
  - `/api/chat` `< 3000ms` (AI-provider dependent)

## LLM traffic controls

Tune these env vars before launch load:

```bash
# Global premium chat budget (all premium + premium+ requests)
PREMIUM_PROVIDER_GLOBAL_RPM=240

# Short queue/backoff when global budget is saturated
PREMIUM_PROVIDER_QUEUE_WAIT_MS=250
PREMIUM_PROVIDER_QUEUE_RETRIES=2

# Provider split for Basic chat path
BASIC_OPENAI_ROUTING_PERCENT=20

# OpenAI model used when non-premium path routes to OpenAI
OPENAI_BASIC_MODEL=gpt-4.1-mini
```
