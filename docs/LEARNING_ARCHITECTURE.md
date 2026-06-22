# MyMcKenzieCS Learning Architecture

This guide explains how to follow the code as a beginner-to-intermediate developer. It describes the target feature-first structure and uses Client Work as the first working example.

## 1. The Mental Model

Most features have four layers:

```text
React screen
  -> browser API helper
  -> Next.js API route
  -> service/repository code
  -> Supabase database and storage
```

Authentication and authorization must be checked before server code reads or changes private data.

## 2. Top-Level Folders

| Folder | Purpose |
| --- | --- |
| `src/app` | URLs, server-rendered pages, and API endpoints |
| `src/features` | Feature modules containing UI, hooks, types, and feature logic |
| `src/components` | Shared or legacy React components |
| `src/lib` | Shared backend, database, auth, AI, billing, and utility code |
| `supabase/migrations` | Database tables, functions, indexes, RLS, and storage policies |
| `scripts` | Deployment, maintenance, ingestion, and operational tools |
| `docs` | Architecture, security, and operational documentation |

## 3. Frontend Request Flow

Client Work is mounted by:

```text
src/app/business/dashboard/page.tsx
  -> src/components/business/BusinessDashboardClient.tsx
  -> src/components/business/ClientMattersPage.tsx
  -> src/features/client-matters/ClientMattersScreen.tsx
```

The compatibility component remains in `src/components/business` so existing imports keep working. New implementation code lives together under `src/features/client-matters`.

The feature is split into:

```text
client-matters/
├── ClientMattersScreen.tsx       # Composes the page
├── useClientMatters.ts           # State, loading, and mutations
├── model.ts                      # Types, labels, formatting, filtering
└── components/
    ├── CreateMatterDialog.tsx    # New work-item form
    ├── MatterList.tsx            # Search results and selection
    └── MatterDetails.tsx         # Selected work-item editor
```

Study these files in this order: `model.ts`, `MatterList.tsx`, `useClientMatters.ts`, then `ClientMattersScreen.tsx`.

## 4. Backend Request Flow

When a professional updates a matter:

```text
MatterDetails.tsx
  -> useClientMatters.updateMatter()
  -> updateClientMatter() in src/lib/business/client-matters.ts
  -> PUT /api/business/client-matters
  -> ensureBusinessContext()
  -> business-scoped update in Supabase
```

The API route must never trust an ID from the browser by itself. It combines the ID with the authenticated business ID before updating a row.

## 5. Authentication and Data Isolation

There are three main audiences:

- Litigants use the personal dashboard.
- Professionals use a business workspace.
- Invited clients use the client portal.

Important boundaries:

- Browser Supabase code uses the anonymous key and is constrained by RLS.
- Server API code can use the service-role key, so it must manually scope every query.
- Business routes call `ensureBusinessContext()` and filter by `business_id`.
- Client routes verify active `client_business_links` and matching matters.
- Documents require ownership or an explicit active client share.
- Marketplace enquiry PII stays private until one business atomically claims it.

## 6. Database Changes

Never edit production tables manually as the normal workflow. Add a timestamped SQL file under `supabase/migrations`.

A migration should usually include:

1. Tables or columns.
2. Foreign keys and constraints.
3. Indexes for common filters.
4. RLS enablement.
5. Policies for each allowed audience.
6. Explicit function grants and revocations.
7. Safe backfills for existing rows.

## 7. How to Add a Feature

Use this sequence:

1. Define the user-visible behavior.
2. Define TypeScript types and Zod request schemas.
3. Add the migration and RLS rules if data changes.
4. Add repository/service functions.
5. Add a thin API route.
6. Add the browser API helper.
7. Add the feature hook.
8. Add small UI components.
9. Add route, helper, and security tests.
10. Run `npm run type-check`, `npm run lint`, and focused tests.

## 8. Files Worth Studying

| Topic | Starting file |
| --- | --- |
| Global routing | `src/proxy.ts` |
| Supabase clients | `src/lib/database/` |
| Business authorization | `src/lib/business/business-workspace.ts` |
| Client authorization | `src/lib/client-portal/portal-matters.ts` |
| Documents | `src/app/api/documents/route.ts` |
| Client document access | `src/lib/documents/client-document-access.ts` |
| Billing | `src/lib/payments/user-plan.ts` |
| AI request handling | `src/app/api/chat/route.ts` |
| AI behavior | `src/lib/ai/agents/legal-agent.ts` |
| Case-law retrieval | `src/lib/case-law/` and `src/lib/vector/milvus.ts` |

## 9. Safe Refactoring Rule

Refactor one vertical feature at a time. Keep behavior unchanged, leave a compatibility export at the old path, run tests, and only then move to the next feature. Avoid a whole-codebase rewrite because it makes security regressions much harder to spot.
