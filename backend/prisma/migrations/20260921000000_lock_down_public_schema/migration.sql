-- Lock down the public schema against Supabase's auto-generated Data API (PostgREST).
--
-- The application talks to Postgres only through the backend's own connection (the owner role,
-- which bypasses RLS). Nothing should ever reach these tables as `anon` or `authenticated`,
-- because that path skips the Express authentication and role checks entirely.
--
-- Two independent layers, so a single mistake is not enough to expose data:
--   1. Row-level security ON for every table, with no policies  => API roles see zero rows.
--   2. All privileges revoked from the API roles                 => API roles get "permission denied".
-- Default privileges are also revoked so tables created by FUTURE migrations do not silently
-- come back with the grants Supabase adds by default.
--
-- Guarded by pg_roles so this is a no-op for the role grants on a plain Postgres (CI, staging,
-- a restore drill) where anon/authenticated do not exist.

DO $$
DECLARE
  t record;
  api_role text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;

  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
