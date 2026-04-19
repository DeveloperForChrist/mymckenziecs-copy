-- Enforce owner-scoped access on case records.
-- This aligns authenticated user routes with row-level policies instead of relying
-- on service-role access for normal case reads and writes.

alter table if exists public.cases enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cases'
      and policyname = 'cases_service_role_all'
  ) then
    create policy cases_service_role_all
      on public.cases
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cases'
      and policyname = 'cases_select_own'
  ) then
    create policy cases_select_own
      on public.cases
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cases'
      and policyname = 'cases_insert_own'
  ) then
    create policy cases_insert_own
      on public.cases
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cases'
      and policyname = 'cases_update_own'
  ) then
    create policy cases_update_own
      on public.cases
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cases'
      and policyname = 'cases_delete_own'
  ) then
    create policy cases_delete_own
      on public.cases
      for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;
