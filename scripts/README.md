# Scripts Directory

This folder contains automation scripts for various project operations.

## Folders

### `/case-law`
Scripts for managing case law data population and maintenance.
- `populate-caselaw.ts` - Populate case law data into the database
- `populate-all-caselaw.ts` - Bulk populate all case law entries

### `/db`
Database-related scripts including migrations and maintenance tasks.
- `/migrations` - Database schema migrations
- `/seeds` - Database seeding scripts
- `/maintenance` - Database maintenance and cleanup scripts

### `/monitoring`
Monitoring and health check scripts for the application.
- `monitor-caselaw.sh` - Monitor case law data pipeline status

### `/stripe`
Stripe payment integration scripts.
- `seed-stripe-passes.mjs` - Seed Stripe pass products
- `sync-stripe-passes.mjs` - Synchronize Stripe passes with database

### `/supabase`
Supabase-specific database functions and migrations.
- `function_match_case_law.sql` - Supabase function for case law matching
- `migration_case_law.sql` - Case law migration script
- `migration_document_analyses.sql` - Document analysis migration
- `schema.sql` - Database schema definition

## Usage

Run scripts from the project root directory:

```bash
ts-node scripts/case-law/populate-caselaw.ts
npm run db:migrate
bash scripts/monitoring/monitor-caselaw.sh
```

Ensure environment variables are properly configured before running database or Stripe scripts.
