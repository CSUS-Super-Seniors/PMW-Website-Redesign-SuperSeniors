begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

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

set local role service_role;
insert into public.contact_messages (id, name, email, message) values
  ('00000000-0000-4000-8000-000000268005', 'Contact test', 'sender@example.com', 'Test message');
select ok(
  (select created_at is not null from public.contact_messages where id = '00000000-0000-4000-8000-000000268005'),
  'the server service role can save and the database assigns created_at'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.contact_messages$$,
  '42501', null,
  'anonymous visitors cannot read messages directly'
);
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
select throws_ok(
  $$update public.contact_messages set message = 'Changed'$$,
  '42501', null,
  'read permission does not allow owners to modify messages'
);
select throws_ok(
  $$delete from public.contact_messages$$,
  '42501', null,
  'read permission does not allow owners to delete messages'
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
