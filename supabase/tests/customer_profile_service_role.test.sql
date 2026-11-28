-- SSPMW-350: backend read grants must not widen browser-role access.
begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000350a01', 'profile-owner@test.local'),
  ('00000000-0000-0000-0000-000000350a02', 'profile-employee@test.local'),
  ('00000000-0000-0000-0000-000000350a03', 'profile-nonstaff@test.local');
insert into public.staff_profiles (id, full_name, role, status) values
  ('00000000-0000-0000-0000-000000350a01', 'Profile Owner', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000350a02', 'Profile Employee', 'employee', 'active');
insert into public.customers (id, first_name, last_name) values
  ('00000000-0000-0000-0000-000000350c01', 'Profile', 'Regression');
insert into public.customer_notes (customer_id, body) values
  ('00000000-0000-0000-0000-000000350c01', 'Profile regression note');
insert into public.jobs (customer_id, item, status) values
  ('00000000-0000-0000-0000-000000350c01', 'Chair', 'completed'),
  ('00000000-0000-0000-0000-000000350c01', 'Table', 'completed');

select ok(has_table_privilege('service_role', 'public.customers', 'SELECT'),
  'service_role has SELECT on customers');
select ok(has_table_privilege('service_role', 'public.customer_notes', 'SELECT'),
  'service_role has SELECT on customer_notes');
select ok(has_table_privilege('service_role', 'public.jobs', 'SELECT'),
  'service_role has SELECT on jobs');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.customers'::regclass, 'public.customer_notes'::regclass, 'public.jobs'::regclass)),
  'RLS stays enabled on all three profile tables'
);
select ok(
  (select coalesce(reloptions @> array['security_invoker=true'], false)
    from pg_class where oid = 'public.customer_repeat_status'::regclass),
  'customer_repeat_status remains a security-invoker view'
);

set local role service_role;
select results_eq(
  $$select completed_job_count, is_repeat from public.customer_repeat_status
    where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  $$values (2, true)$$,
  'Backend service role can read repeat status through the underlying tables'
);
select results_eq(
  $$select body from public.customer_notes where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  $$values ('Profile regression note'::text)$$,
  'Backend service role can read profile notes'
);
reset role;

-- Restrict every query to this fixture, leaving local seed data untouched.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000350a01","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select count(*)::integer from public.customers where id = '00000000-0000-0000-0000-000000350c01'$$,
  array[1], 'Owner can still read customers');
select results_eq(
  $$select count(*)::integer from public.customer_notes where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  array[1], 'Owner can still read notes');
select results_eq(
  $$select count(*)::integer from public.jobs where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  array[2], 'Owner can still read jobs');
select results_eq(
  $$select completed_job_count, is_repeat from public.customer_repeat_status where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  $$values (2, true)$$, 'Owner can still read repeat status');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000350a02","role":"authenticated"}', true);
select is_empty(
  $$select id from public.customers where id = '00000000-0000-0000-0000-000000350c01'$$,
  'Employee still cannot read customers');
select is_empty(
  $$select id from public.customer_notes where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  'Employee still cannot read notes');
select results_eq(
  $$select count(*)::integer from public.jobs where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  array[2], 'Employee retains existing job read access');
select is_empty(
  $$select customer_id from public.customer_repeat_status where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  'Employee still cannot read repeat status');
select is_empty(
  $$update public.jobs set item = 'Unauthorized edit' where customer_id = '00000000-0000-0000-0000-000000350c01' returning id$$,
  'Employee still cannot update jobs');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000350a03","role":"authenticated"}', true);
select is_empty(
  $$select id from public.customers where id = '00000000-0000-0000-0000-000000350c01'$$,
  'Non-staff user still cannot read customers');
select is_empty(
  $$select id from public.customer_notes where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  'Non-staff user still cannot read notes');
select is_empty(
  $$select id from public.jobs where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  'Non-staff user still cannot read jobs');
select is_empty(
  $$select customer_id from public.customer_repeat_status where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  'Non-staff user still cannot read repeat status');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is_empty(
  $$select id from public.customers where id = '00000000-0000-0000-0000-000000350c01'$$,
  'Anonymous visitor still cannot read customers');
select is_empty(
  $$select id from public.customer_notes where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  'Anonymous visitor still cannot read notes');
select is_empty(
  $$select id from public.jobs where customer_id = '00000000-0000-0000-0000-000000350c01'$$,
  'Anonymous visitor still cannot read jobs');
select throws_ok(
  'select * from public.customer_repeat_status', '42501', null,
  'Anonymous visitor still has no SELECT permission on repeat status');
reset role;

select * from finish();
rollback;