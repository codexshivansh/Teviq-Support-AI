-- Supabase stopped auto-granting Data API privileges to tables created in the
-- public schema. Keep the server-only service role functional when migrations
-- are replayed on a new project, preview branch, or local database reset.
--
-- Browser roles remain unchanged. Row-level security and the existing RPC
-- revocations continue to prevent direct client access.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
