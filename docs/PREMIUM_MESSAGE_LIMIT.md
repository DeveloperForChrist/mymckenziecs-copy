# Chat Limits And Access Model

## Current Model
- Guest users can use chat for free with a 10-message rolling 24-hour limit.
- Signed-in chat requires an active paid subscription.
- Paid users are limited per thread:
  - Essential: 25 user messages per thread
  - Plus: 30 user messages per thread

## Enforcement Points
- Guest limit enforcement: `src/app/api/chat/route.ts` via `consume_guest_message`.
- Paid-plan requirement for signed-in chat: `src/app/api/chat/route.ts`.
- Per-thread message cap: `src/app/api/chat/route.ts` and `src/components/chatbot/ChatbotNavbar.tsx`.
- Thread counter endpoint: `src/app/api/message-count/route.ts`.

## UI Behavior
- Guests see `Guest: X/10` in the chatbot topbar.
- Signed-in paid users see `Messages: X/<plan-limit>` for the current conversation.
- Signed-in users without a paid plan receive an upgrade-required response from `/api/chat`.

## Notes
- Legacy free-tier counters and history branches were removed from runtime code.
- Historical migration files may still include old column names for audit/history only.
