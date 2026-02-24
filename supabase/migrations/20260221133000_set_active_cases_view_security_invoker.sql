-- Ensure active_cases_view runs with querying user's permissions/RLS context.
alter view if exists public.active_cases_view set (security_invoker = true);
