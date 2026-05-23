# Client Portal Smoke Checklist

Use this checklist before deployment for the professional-client portal flow.

## 1. Invite and Sign-In

1. Professional sends client invite from Inbox/Leads.
2. Client receives invite link and opens `/signup?token=...`.
3. Client creates account and is linked in `client_business_links` with `status='active'`.
4. Existing signed-in client can accept invite directly and reach `/dashboard`.

## 2. Client Dashboard Routing

1. Client with active link sees client-mode dashboard tile: `MyMcKenzieCS Client Portal`.
2. Homepage `Client Portal Login` CTA sends to `/auth/signin?redirect=/client-portal`.
3. After login, client reaches `/client-portal` successfully.

## 3. Client Portal Navigation

1. Header shows `Client Portal`, `Directory`, and `Logout`.
2. Logout ends session and returns to `/`.
3. Directory link opens `/dashboard/directory`.

## 4. Client Messaging

1. Client sends message to professional from client portal.
2. Professional receives message in Inbox.
3. Business alert is created for new client message.

## 5. Client Documents

1. Client documents tab lists real documents (not placeholder).
2. Client can open document via signed URL.
3. Client can select documents and sync to professional matter.
4. Professional sees synced files in matter documents with `Shared by client` badge.
5. Client can remove shared copies.
6. Professional can delete synced docs from case-work panel.

## 6. Relationship and Case End State

1. When matter is closed (`stage='closed'` or `status='archived'`), client link card shows `Case closed`.
2. Client sees `Request New Matter` action.
3. Client can `Leave Professional` (link becomes inactive).
4. If all links are inactive, client portal shows no-active-links state and directory CTA.

## 7. Alerts Feed

1. Alerts page loads from `/api/business/alerts` (not local seed data).
2. Mark read / mark all read / dismiss update correctly.
3. Alerts are emitted for:
   - client invite sent
   - client invite accepted
   - client message
   - document sync/remove
   - meeting create/status update
   - matter status/stage/deadline changes
4. Duplicate alert spam is suppressed for repeated near-identical events.

## 8. Access Control

1. Client cannot message businesses without active link.
2. Client cannot remove links that are not theirs.
3. Client cannot sync documents they do not own.
4. Professional-only alerts are not visible to unrelated users.
