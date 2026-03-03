# Chat Limits And Access Model

## Current Model
- Guest users can use chat subject to request-level rate limiting.
- Signed-in chat requires an active paid subscription.
- Paid users are not capped by a per-thread message limit.

## Enforcement Points
- Request-level rate limiting: `src/app/api/chat/route.ts` via API rate limiter middleware.
- Paid-plan requirement for signed-in chat: `src/app/api/chat/route.ts`.

## UI Behavior
- Signed-in users without a paid plan receive an upgrade-required response from `/api/chat`.

## Notes
- Historical migration files may still include old counter columns for audit/history only.
