-- Repair databases that already applied the first C5 migration before review.
-- Editing that pending migration alone does not undo an existing local grant
-- or policy. Require A3's owner policy before removing the C5 replacement.
do $$
begin
  if to_regprocedure('private.current_staff_role()') is null
    or not exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'contact_messages'
        and policyname = 'Owners have full access to contact messages'
    ) then
    raise exception 'Apply SSPMW-185 / PR #39 before the C5 permissions cleanup.';
  end if;
end;
$$;

drop policy if exists "Active owners can read contact messages" on public.contact_messages;
drop function if exists private.contact_messages_is_owner();

-- Restore DML privileges revoked by the old C5 migration. A3's RLS policy
-- restricts all four operations to active owners; it also permits spam removal.
grant select, insert, update, delete on public.contact_messages to authenticated;
grant select, insert on public.contact_messages to service_role;
