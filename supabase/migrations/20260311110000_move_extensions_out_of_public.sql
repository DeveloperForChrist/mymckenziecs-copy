create schema if not exists extensions;
grant usage on schema extensions to public;

do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'vector'
      and n.nspname = 'public'
  ) then
    alter extension vector set schema extensions;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net'
      and n.nspname = 'public'
  ) then
    if exists (
      select 1
      from pg_namespace
      where nspname = 'net'
    ) then
      begin
        alter extension pg_net set schema net;
      exception
        when others then
          raise notice 'Unable to move pg_net out of public automatically: %', sqlerrm;
      end;
    else
      raise notice 'Skipping pg_net schema move because schema "net" does not exist.';
    end if;
  end if;
end
$$;
