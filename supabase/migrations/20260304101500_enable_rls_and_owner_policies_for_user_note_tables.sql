-- Fix Supabase linter errors:
-- - rls_disabled_in_public on public.user_notes
-- - rls_disabled_in_public on public.user_case_law_history
--
-- Enforce owner-only access for authenticated users.
-- Server-side service role paths continue to work (service role bypasses RLS).

alter table if exists public.user_notes enable row level security;
alter table if exists public.user_case_law_history enable row level security;

drop policy if exists user_notes_select_own on public.user_notes;
create policy user_notes_select_own
  on public.user_notes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_notes_insert_own on public.user_notes;
create policy user_notes_insert_own
  on public.user_notes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_notes_update_own on public.user_notes;
create policy user_notes_update_own
  on public.user_notes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_notes_delete_own on public.user_notes;
create policy user_notes_delete_own
  on public.user_notes
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_case_law_history_select_own on public.user_case_law_history;
create policy user_case_law_history_select_own
  on public.user_case_law_history
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_case_law_history_insert_own on public.user_case_law_history;
create policy user_case_law_history_insert_own
  on public.user_case_law_history
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_case_law_history_update_own on public.user_case_law_history;
create policy user_case_law_history_update_own
  on public.user_case_law_history
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_case_law_history_delete_own on public.user_case_law_history;
create policy user_case_law_history_delete_own
  on public.user_case_law_history
  for delete
  to authenticated
  using (auth.uid() = user_id);

