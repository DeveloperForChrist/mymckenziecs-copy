-- Ensure user_billing_view respects querying user's permissions/RLS context.
alter view if exists public.user_billing_view set (security_invoker = true);
