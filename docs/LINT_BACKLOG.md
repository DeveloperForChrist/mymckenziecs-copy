## Lint Backlog

This file turns the repo-wide lint backlog into a simpler study plan.

### Current snapshot

- `npm run lint`
- Result on June 22, 2026:
  - `0 errors`
  - `909 warnings`

### Main warning categories

- `@typescript-eslint/no-explicit-any`
  - This is the biggest category by far.
  - Most of these live in older API routes, test files, AI tooling, and utility layers.
- `@typescript-eslint/no-unused-vars`
  - Smaller category.
  - Usually low-risk cleanup such as unused imports, constants, or helper params.

### Best cleanup order

1. Small shared files
   - Good for learning typed replacements without touching business logic too much.
   - Examples:
     - Sentry config
     - browser client wrappers
     - small security helpers

2. Business API routes
   - Good next step because they are smaller than the AI and chat system.
   - Focus on unused imports and simple request/response typing first.

3. Client portal and business UI support libs
   - These usually benefit from typed metadata objects and small helper types.

4. AI/chat routes and tests
   - These are the largest warning hotspots.
   - Best handled after the smaller files establish reusable typing patterns.

### Starter batch already cleaned

- [instrumentation-client.ts](/home/jordandev/mymckenziecs-copy/instrumentation-client.ts)
- [sentry.server.config.ts](/home/jordandev/mymckenziecs-copy/sentry.server.config.ts)
- [src/app/api/business/inbox/route.ts](/home/jordandev/mymckenziecs-copy/src/app/api/business/inbox/route.ts)
- [src/lib/security/csrf.ts](/home/jordandev/mymckenziecs-copy/src/lib/security/csrf.ts)
- [src/lib/database/supabase-browser.ts](/home/jordandev/mymckenziecs-copy/src/lib/database/supabase-browser.ts)

### What to look for when replacing `any`

- If the value is an unknown external payload:
  - start with `unknown`
  - narrow it with `typeof`, `Array.isArray`, or small helper guards

- If the value is a flexible object:
  - use `Record<string, unknown>` first
  - then tighten individual properties over time

- If the function wraps another typed function:
  - prefer `Parameters<typeof fn>` and `ReturnType<typeof fn>`
  - this keeps the wrapper aligned with the original API

### Good next targets

- `src/app/api/business/alerts/route.ts`
- `src/app/api/business/client-matters/route.ts`
- `src/lib/documents/client-document-access.ts`
- `src/lib/plans/access.ts`
- `src/lib/business/business-matters-db.ts`

These are better next steps than the very large chat routes because they are easier to reason about and easier to verify.
