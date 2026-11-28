-- The owner-only invite route (SSPMW-271) creates the new person's staff_profiles
-- row with the service role. Grant only INSERT, like the earlier explicit SELECT
-- grant, instead of relying on project default privileges. Signed-in users keep
-- the existing RLS policies: only owners can write staff profiles.
grant insert on table public.staff_profiles to service_role;
