-- The server uses service_role to load staff authorization data.
-- Explicitly grant read access rather than relying on project default privileges.
grant select on table public.staff_profiles to service_role;
