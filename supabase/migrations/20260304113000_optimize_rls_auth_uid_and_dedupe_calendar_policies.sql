-- Performance hardening for RLS:
-- 1) Replace auth.uid() with (select auth.uid()) in policy predicates
--    to avoid per-row re-evaluation warnings from Supabase linter.
-- 2) Remove duplicate legacy permissive policies on calendar_events.

do $$
declare
  p record;
  new_qual text;
  new_with_check text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%'
      )
  loop
    new_qual := case
      when p.qual is null then null
      else replace(p.qual, 'auth.uid()', '(select auth.uid())')
    end;

    new_with_check := case
      when p.with_check is null then null
      else replace(p.with_check, 'auth.uid()', '(select auth.uid())')
    end;

    if new_qual is not null and new_with_check is not null then
      execute format(
        'alter policy %I on %I.%I using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, new_qual, new_with_check
      );
    elsif new_qual is not null then
      execute format(
        'alter policy %I on %I.%I using (%s)',
        p.policyname, p.schemaname, p.tablename, new_qual
      );
    elsif new_with_check is not null then
      execute format(
        'alter policy %I on %I.%I with check (%s)',
        p.policyname, p.schemaname, p.tablename, new_with_check
      );
    end if;
  end loop;
end $$;

-- Remove duplicate legacy policies on calendar_events.
drop policy if exists "Users can view own calendar events" on public.calendar_events;
drop policy if exists "Users can insert own calendar events" on public.calendar_events;
drop policy if exists "Users can update own calendar events" on public.calendar_events;
drop policy if exists "Users can delete own calendar events" on public.calendar_events;

