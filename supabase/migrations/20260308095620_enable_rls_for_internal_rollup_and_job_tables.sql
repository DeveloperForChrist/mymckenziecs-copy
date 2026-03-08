-- Enable RLS on internal public tables that should only be accessed via backend/service-role code.

ALTER TABLE IF EXISTS public.admin_metric_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.existing_job_id ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_metric_rollups_service_role_all ON public.admin_metric_rollups;
CREATE POLICY admin_metric_rollups_service_role_all
  ON public.admin_metric_rollups
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'existing_job_id'
      AND c.relkind = 'r'
  ) THEN
    DROP POLICY IF EXISTS existing_job_id_service_role_all ON public.existing_job_id;
    CREATE POLICY existing_job_id_service_role_all
      ON public.existing_job_id
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
