-- Visitors submit through the validated Express route using the server's
-- service-role client. No direct browser inserts or public reads are allowed.
revoke all on public.contact_messages from anon, authenticated;
grant select on public.contact_messages to authenticated;
grant select, insert on public.contact_messages to service_role;

-- staff_profiles also has RLS, so check the caller's role through a narrow
-- function in a schema that is not exposed by the Data API.
create schema if not exists private;
create function private.contact_messages_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles
    where id = (select auth.uid()) and role = 'owner' and status = 'active'
  );
$$;

revoke all on function private.contact_messages_is_owner() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.contact_messages_is_owner() to authenticated;

create policy "Active owners can read contact messages"
on public.contact_messages for select to authenticated
using ((select private.contact_messages_is_owner()));
