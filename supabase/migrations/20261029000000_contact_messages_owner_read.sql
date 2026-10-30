-- C5 saves validated messages with the server-only service-role client.
-- SSPMW-185 / PR #39 owns browser permissions and owner RLS policies.
grant select, insert on public.contact_messages to service_role;
