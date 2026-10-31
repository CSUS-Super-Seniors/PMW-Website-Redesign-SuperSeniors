begin;

create extension if not exists pgtap with schema extensions;
select plan(2);

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

select * from finish();
rollback;
