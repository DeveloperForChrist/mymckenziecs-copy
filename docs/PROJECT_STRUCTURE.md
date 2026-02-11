# Project Structure

## Overview
This document describes the reorganized project structure for better maintainability and scalability.

## Directory Structure

### `/src/lib` - Core Libraries
Organized into logical modules:

- **`ai/`** - AI and ML functionality
  - `agents/` - AI agent implementations
  - `tools/` - AI tool integrations
  - `providers/` - OpenAI, Gemini clients
  - `chat-manager.ts` - Chat orchestration

- **`auth/`** - Authentication & session management
  - Session handlers for admin, client, and user

- **`database/`** - Database clients
  - Supabase clients for browser, route, and server

- **`payments/`** - Payment processing
  - Stripe integration

- **`cache/`** - Caching utilities
  - Client and image caching

- **`search/`** - Search functionality
  - Case matching engine

- **`utils/`** - Utility functions
  - Conversation encoding, logging, CLI tools

### `/src/components` - React Components
Feature-based organization:

- **`layout/`** - Layout components (Navbar, AppTopbar, etc.)
- **`user/`** - User-related components
- **`auth/`** - Authentication components
- **`chatbot/`** - Chat interface components
- **`dashboard/`** - Dashboard components
- **`onboarding/`** - Onboarding flow components
- **`settings/`** - Settings components

### `/src/app` - Next.js App Router
Pages and API routes following Next.js 14+ conventions

### `/docs` - Documentation
All project documentation:
- QUICKSTART.md
- MIGRATION_GUIDE.md
- CASE_LAW_SEARCH_README.md
- TODO.md
- PUSH_PLAN.md
- VISUAL_TIMELINE_FEATURE.md

### `/scripts` - Utility Scripts
Organized by purpose:

- **`db/`** - Database operations
  - `migrations/` - Database migrations
  - `seeds/` - Seed data scripts
  - `maintenance/` - Database maintenance

- **`stripe/`** - Stripe-related scripts
- **`monitoring/`** - Monitoring scripts
- **`case-law/`** - Case law population scripts

### New Directories (Ready for Use)

- **`/src/hooks`** - Custom React hooks
- **`/src/contexts`** - React Context providers
- **`/src/constants`** - App-wide constants (court fees, plans, etc.)
- **`/src/validators`** - Validation schemas (Zod)
- **`/src/features`** - Feature-based modules

## Path Aliases

The following TypeScript path aliases are configured:

```typescript
@/*           -> src/*
@/components/* -> src/components/*
@/lib/*        -> src/lib/*
@/types/*      -> src/types/*
@/features/*   -> src/features/*
@/hooks/*      -> src/hooks/*
@/constants/*  -> src/constants/*
@/contexts/*   -> src/contexts/*
@/validators/* -> src/validators/*
@/utils/*      -> src/lib/utils/*
```

## Import Examples

### Before
```typescript
import { createClient } from '../../../lib/supabase-browser';
import { stripe } from '../../../lib/stripe';
import { legalAgent } from '../../../lib/legal-agent';
```

### After
```typescript
import { createClient } from '@/lib/database';
import { stripe } from '@/lib/payments/stripe';
import { legalAgent } from '@/lib/ai/agents';
```

## Benefits

1. **Better Organization** - Logical grouping of related files
2. **Easier Navigation** - Clear structure makes finding files faster
3. **Cleaner Imports** - Path aliases reduce import complexity
4. **Scalability** - Feature-based structure supports growth
5. **Maintainability** - Related code is co-located

## Migration Notes

All file imports have been preserved. The physical location has changed but functionality remains the same. If you encounter any import errors, update the import paths using the new structure or path aliases.
