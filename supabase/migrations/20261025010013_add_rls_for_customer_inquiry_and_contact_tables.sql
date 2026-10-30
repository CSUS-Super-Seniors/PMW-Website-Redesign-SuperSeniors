-- Helpers used by RLS policies. This schema is not exposed through the API,
-- so these functions cannot be called directly as RPCs.
create schema if not exists private;

grant usage on schema private to authenticated;

-- Role of the signed-in staff member ('owner' or 'employee'), or null when the
-- user has no staff profile or the profile is inactive. Runs as the function
-- owner so it can read staff_profiles, which signed-in users cannot read.
create function private.current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.staff_profiles
  where id = auth.uid()
    and status = 'active';
$$;

revoke execute on function private.current_staff_role() from public;
grant execute on function private.current_staff_role() to authenticated;

-- Customer and lead data is owner only. Employees and anonymous visitors have no
-- policy, so they cannot read or change any rows. Public form submissions are
-- saved by the server, which bypasses RLS.
-- The helper is wrapped in a select so it runs once per query, not once per row.
create policy "Owners have full access to customers"
on public.customers
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');

create policy "Owners have full access to customer notes"
on public.customer_notes
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');

create policy "Owners have full access to inquiries"
on public.inquiries
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');

create policy "Owners have full access to inquiry photos"
on public.inquiry_photos
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');

create policy "Owners have full access to contact messages"
on public.contact_messages
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');
