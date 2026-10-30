begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000268001', 'contact-owner@example.com'),
  ('00000000-0000-4000-8000-000000268002', 'contact-employee@example.com'),
  ('00000000-0000-4000-8000-000000268003', 'contact-inactive@example.com'),
  ('00000000-0000-4000-8000-000000268004', 'contact-visitor@example.com');
insert into public.staff_profiles (id, full_name, role, status) values
  ('00000000-0000-4000-8000-000000268001', 'Contact owner', 'owner', 'active'),
  ('00000000-0000-4000-8000-000000268002', 'Contact employee', 'employee', 'active'),
  ('00000000-0000-4000-8000-000000268003', 'Contact inactive owner', 'owner', 'inactive');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.contact_messages'::regclass),
  'contact_messages has RLS enabled'
);

select ok(
  to_regprocedure('private.contact_messages_is_owner()') is null,
  'C5 no longer defines a competing owner helper'
);
select is(
  (select count(*) from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'contact_messages'
      and policyname = 'Active owners can read contact messages'),
  0::bigint, 'C5 no longer defines a competing read-only policy'
);

set local role service_role;
insert into public.contact_messages (id, name, email, message) values
  ('00000000-0000-4000-8000-000000268005', 'Contact test', 'sender@example.com', 'Test message');
select ok(
  (select created_at is not null from public.contact_messages where id = '00000000-0000-4000-8000-000000268005'),
  'the server service role can save and the database assigns created_at'
);
reset role;

set local role anon;
-- A fresh database may retain the standard anon SELECT grant and rely on RLS.
-- An upgraded local database may retain the old C5 table-level denial. Neither
-- path may reveal rows; only evaluate the query when SELECT is permitted.
select case when has_table_privilege(current_user, 'public.contact_messages', 'select')
then is_empty(
  $$select * from public.contact_messages$$,
  'anonymous visitors cannot read messages directly'
)
else throws_ok(
  $$select * from public.contact_messages$$, '42501', null,
  'anonymous visitors cannot read messages directly'
) end;
select throws_ok(
  $$insert into public.contact_messages (name, email, message) values ('Bypass', 'bypass@example.com', 'Bypass')$$,
  '42501', null,
  'anonymous visitors cannot bypass the validated API to insert directly'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000268001', true);
set local role authenticated;
select is(
  (select count(*) from public.contact_messages where id = '00000000-0000-4000-8000-000000268005'),
  1::bigint, 'an active owner can read messages'
);
select lives_ok(
  $$update public.contact_messages set message = 'Updated by owner'
    where id = '00000000-0000-4000-8000-000000268005'$$,
  'an active owner can update messages under A3 permissions'
);
select is(
  (select message from public.contact_messages where id = '00000000-0000-4000-8000-000000268005'),
  'Updated by owner', 'the owner update is saved'
);
select lives_ok(
  $$insert into public.contact_messages (id, name, email, message) values
    ('00000000-0000-4000-8000-000000268006', 'Spam fixture', 'spam@example.com', 'Spam')$$,
  'an active owner retains insert access under A3 permissions'
);
select is(
  (select count(*) from public.contact_messages where id = '00000000-0000-4000-8000-000000268006'),
  1::bigint, 'the owner-created spam fixture exists'
);
select lives_ok(
  $$delete from public.contact_messages where id = '00000000-0000-4000-8000-000000268006'$$,
  'an active owner can delete spam'
);
select is(
  (select count(*) from public.contact_messages where id = '00000000-0000-4000-8000-000000268006'),
  0::bigint, 'the deleted spam message is gone'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000268002', true);
set local role authenticated;
select is(
  (select count(*) from public.contact_messages where id = '00000000-0000-4000-8000-000000268005'),
  0::bigint, 'an employee cannot read messages'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000268003', true);
set local role authenticated;
select is(
  (select count(*) from public.contact_messages where id = '00000000-0000-4000-8000-000000268005'),
  0::bigint, 'an inactive owner cannot read messages'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000268004', true);
set local role authenticated;
select is(
  (select count(*) from public.contact_messages where id = '00000000-0000-4000-8000-000000268005'),
  0::bigint, 'an authenticated visitor without a staff profile cannot read messages'
);
select throws_ok(
  $$insert into public.contact_messages (name, email, message) values ('Bypass', 'bypass@example.com', 'Bypass')$$,
  '42501', null,
  'authenticated visitors must also submit through the API'
);
reset role;

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select is(
  (select count(*) from public.contact_messages where id = '00000000-0000-4000-8000-000000268005'),
  0::bigint, 'a missing user identity does not grant read access'
);
reset role;

select * from finish();
rollback;
