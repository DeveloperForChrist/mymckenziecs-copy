-- Harden app-defined public functions by pinning search_path.
-- This removes mutable search_path findings for SQL/plpgsql functions.

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    LEFT JOIN pg_depend d
      ON d.objid = p.oid
     AND d.deptype = 'e' -- extension-owned object
    WHERE n.nspname = 'public'
      AND l.lanname IN ('plpgsql', 'sql')
      AND d.objid IS NULL
      AND (
        p.proconfig IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM unnest(p.proconfig) cfg
         WHERE cfg LIKE 'search_path=%'
       )
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public', fn);
  END LOOP;
END
$$;
