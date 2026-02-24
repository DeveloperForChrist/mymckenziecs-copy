-- Harden extension security-definer function exposure.
-- Risk addressed: client-callable SECURITY DEFINER function without explicit search_path.

DO $$
BEGIN
  BEGIN
    ALTER FUNCTION storage.delete_leaf_prefixes(text[], text[])
      SET search_path = pg_catalog, storage;
  EXCEPTION
    WHEN undefined_function OR insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    REVOKE ALL ON FUNCTION storage.delete_leaf_prefixes(text[], text[])
      FROM PUBLIC, anon, authenticated;
  EXCEPTION
    WHEN undefined_function OR insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    GRANT EXECUTE ON FUNCTION storage.delete_leaf_prefixes(text[], text[])
      TO service_role;
  EXCEPTION
    WHEN undefined_function OR insufficient_privilege THEN
      NULL;
  END;
END
$$;
