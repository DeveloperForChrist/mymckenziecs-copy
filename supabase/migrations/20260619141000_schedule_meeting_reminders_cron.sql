-- Requires these Vault secrets in the hosted Supabase project:
--   cron_app_url = https://<your-app-domain>
--   cron_secret   = <shared cron secret>
-- The scheduled SQL looks these up at runtime, so the schedule can be created
-- before the secrets are populated.

do $$
declare
  has_pg_cron boolean;
  has_pg_net boolean;
  has_vault boolean;
begin
  select exists(select 1 from pg_extension where extname = 'pg_cron') into has_pg_cron;
  select exists(select 1 from pg_extension where extname = 'pg_net') into has_pg_net;
  select exists(select 1 from pg_extension where extname in ('vault', 'supabase_vault')) into has_vault;

  if not has_pg_cron then
    raise notice 'Skipping meeting reminder cron schedule because pg_cron is not enabled.';
    return;
  end if;

  if not has_pg_net then
    raise notice 'Skipping meeting reminder cron schedule because pg_net is not enabled.';
    return;
  end if;

  if not has_vault then
    raise notice 'Skipping meeting reminder cron schedule because Supabase Vault is not enabled.';
    return;
  end if;

  perform cron.schedule(
    'meeting-reminders-every-5-minutes',
    '*/5 * * * *',
    $cron$
    select
      net.http_post(
        url:=(
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_app_url'
        ) || '/api/cron/meeting-reminders',
        headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'cron_secret'
          )
        ),
        body:=jsonb_build_object(
          'source', 'pg_cron',
          'job', 'meeting-reminders-every-5-minutes',
          'scheduled_at', now()
        ),
        timeout_milliseconds:=10000
      ) as request_id;
    $cron$
  );
end
$$;
