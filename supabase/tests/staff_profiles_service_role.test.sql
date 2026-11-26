begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000227', 'service-role-regression@test.local');
insert into public.staff_profiles (id, full_name, role, status) values
  ('00000000-0000-0000-0000-000000000227', 'Service Role Regression', 'employee', 'active');

select ok(
  has_table_privilege('service_role', 'public.staff_profiles', 'SELECT'),
  'service_role has explicit SELECT permission on staff_profiles'
);

set local role service_role;
select results_eq(
  $$select role, status from public.staff_profiles
    where id = '00000000-0000-0000-0000-000000000227'$$,
  $$values ('employee'::text, 'active'::text)$$,
  'Backend service role can load staff authorization data'
);
reset role;

-- The invite route (SSPMW-271) adds the new person's profile with the service role.
select ok(
  has_table_privilege('service_role', 'public.staff_profiles', 'INSERT'),
  'service_role has explicit INSERT permission on staff_profiles'
);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000271', 'invited-regression@test.local'),
  ('00000000-0000-0000-0000-000000000272', 'self-invite-regression@test.local');

set local role service_role;
select lives_ok(
  $$insert into public.staff_profiles (id, full_name, role, status)
    values ('00000000-0000-0000-0000-000000000271', 'Invited Regression', 'employee', 'active')$$,
  'Backend service role can add an invited person''s staff profile'
);
reset role;

-- Employees still cannot add staff, so the grant does not widen what signed-in users can do.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000227","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.staff_profiles (id, full_name, role, status)
    values ('00000000-0000-0000-0000-000000000272', 'Uninvited Owner', 'owner', 'active')$$,
  '42501',
  null,
  'An employee cannot add a staff profile'
);
reset role;

select * from finish();
rollback;
