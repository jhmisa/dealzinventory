-- Future-proof the public schema for the Oct 30, 2026 Supabase Data API change.
-- Background: https://github.com/orgs/supabase/discussions/45329
-- After Oct 30, 2026, Supabase stops auto-granting Data API roles on new tables in `public`.
-- Existing tables already have these grants (Supabase added them at CREATE TABLE time),
-- but this migration makes them explicit and sets default privileges so future
-- migrations don't have to remember the boilerplate.

-- Schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Re-grant on all existing objects (idempotent — no behavior change)
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated, service_role;

-- Default privileges for future objects created by the postgres role
-- (migrations run as postgres, so new tables created by future migrations
-- will inherit these grants automatically — even after the Oct 30 change).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
