-- Resolve "RLS Enabled No Policy" INFO lints on internal tables.
-- These tables are intended for backend/service-role access only.
-- Keep end-user direct access blocked while making policy intent explicit.

-- api_usage
drop policy if exists api_usage_service_role_all on public.api_usage;
create policy api_usage_service_role_all
  on public.api_usage
  for all
  to service_role
  using (true)
  with check (true);

-- audit_log
drop policy if exists audit_log_service_role_all on public.audit_log;
create policy audit_log_service_role_all
  on public.audit_log
  for all
  to service_role
  using (true)
  with check (true);

-- case_law
drop policy if exists case_law_service_role_all on public.case_law;
create policy case_law_service_role_all
  on public.case_law
  for all
  to service_role
  using (true)
  with check (true);

-- case_law_searches
drop policy if exists case_law_searches_service_role_all on public.case_law_searches;
create policy case_law_searches_service_role_all
  on public.case_law_searches
  for all
  to service_role
  using (true)
  with check (true);

-- message_analytics
drop policy if exists message_analytics_service_role_all on public.message_analytics;
create policy message_analytics_service_role_all
  on public.message_analytics
  for all
  to service_role
  using (true)
  with check (true);

-- reminder_delivery_state
drop policy if exists reminder_delivery_state_service_role_all on public.reminder_delivery_state;
create policy reminder_delivery_state_service_role_all
  on public.reminder_delivery_state
  for all
  to service_role
  using (true)
  with check (true);

