-- Enable RLS on remaining public tables that were still unprotected.
-- These tables are accessed server-side via service-role clients.

alter table if exists public.api_usage enable row level security;
alter table if exists public.audit_log enable row level security;
alter table if exists public.case_law enable row level security;
alter table if exists public.case_law_searches enable row level security;
alter table if exists public.message_analytics enable row level security;
alter table if exists public.reminder_delivery_state enable row level security;
