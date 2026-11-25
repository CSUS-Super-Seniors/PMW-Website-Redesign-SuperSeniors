-- Repeat customer rule (SSPMW-379): Repeat means two or more completed jobs.
-- Everything runs in one transaction and is rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Start from empty tables so only this file's rows are counted. Local Supabase
-- has the sample rows from seed.sql.
truncate public.customers, public.customer_notes, public.inquiries, public.inquiry_photos,
  public.jobs, public.job_steps, public.job_media, public.job_history, public.payments cascade;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000379a01', 'owner@test.local'),
  ('00000000-0000-0000-0000-000000379a02', 'employee@test.local');

insert into public.staff_profiles (id, full_name, role, status) values
  ('00000000-0000-0000-0000-000000379a01', 'Test Owner', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000379a02', 'Test Employee', 'employee', 'active');

insert into public.customers (id, first_name, last_name, deleted_at) values
  ('00000000-0000-0000-0000-000000379c00', 'No', 'Jobs', null),
  ('00000000-0000-0000-0000-000000379c01', 'One', 'Completed', null),
  ('00000000-0000-0000-0000-000000379c02', 'Two', 'Completed', null),
  ('00000000-0000-0000-0000-000000379c03', 'Completed', 'AndCancelled', null),
  ('00000000-0000-0000-0000-000000379c04', 'Completed', 'AndInProgress', null),
  ('00000000-0000-0000-0000-000000379c05', 'Three', 'Completed', null),
  ('00000000-0000-0000-0000-000000379c06', 'Deleted', 'Repeat', now());

insert into public.jobs (customer_id, item, status) values
  ('00000000-0000-0000-0000-000000379c01', 'Chair', 'completed'),
  ('00000000-0000-0000-0000-000000379c02', 'Chair', 'completed'),
  ('00000000-0000-0000-0000-000000379c02', 'Table', 'completed'),
  ('00000000-0000-0000-0000-000000379c03', 'Chair', 'completed'),
  ('00000000-0000-0000-0000-000000379c03', 'Table', 'cancelled'),
  ('00000000-0000-0000-0000-000000379c04', 'Chair', 'completed'),
  ('00000000-0000-0000-0000-000000379c04', 'Table', 'in_progress'),
  ('00000000-0000-0000-0000-000000379c04', 'Bench', 'scheduled'),
  ('00000000-0000-0000-0000-000000379c05', 'Chair', 'completed'),
  ('00000000-0000-0000-0000-000000379c05', 'Table', 'completed'),
  ('00000000-0000-0000-0000-000000379c05', 'Bench', 'completed'),
  ('00000000-0000-0000-0000-000000379c06', 'Chair', 'completed'),
  ('00000000-0000-0000-0000-000000379c06', 'Table', 'completed');

-- The rule itself, read as the service role the server uses.
set local role service_role;

select results_eq(
  $$select completed_job_count, is_repeat from public.customer_repeat_status
    where customer_id = '00000000-0000-0000-0000-000000379c00'$$,
  $$values (0, false)$$,
  'A customer with no jobs is listed with 0 completed jobs and is not Repeat'
);

select results_eq(
  $$select completed_job_count, is_repeat from public.customer_repeat_status
    where customer_id = '00000000-0000-0000-0000-000000379c01'$$,
  $$values (1, false)$$,
  'One completed job is not Repeat'
);

select results_eq(
  $$select completed_job_count, is_repeat from public.customer_repeat_status
    where customer_id = '00000000-0000-0000-0000-000000379c02'$$,
  $$values (2, true)$$,
  'Two completed jobs is Repeat'
);

select results_eq(
  $$select completed_job_count, is_repeat from public.customer_repeat_status
    where customer_id = '00000000-0000-0000-0000-000000379c03'$$,
  $$values (1, false)$$,
  'One completed job and one cancelled job is not Repeat'
);

select results_eq(
  $$select completed_job_count, is_repeat from public.customer_repeat_status
    where customer_id = '00000000-0000-0000-0000-000000379c04'$$,
  $$values (1, false)$$,
  'In-progress and scheduled jobs do not count'
);

select results_eq(
  $$select completed_job_count, is_repeat from public.customer_repeat_status
    where customer_id = '00000000-0000-0000-0000-000000379c05'$$,
  $$values (3, true)$$,
  'Three completed jobs stays Repeat'
);

select is_empty(
  $$select 1 from public.customer_repeat_status
    where customer_id = '00000000-0000-0000-0000-000000379c06'$$,
  'A soft-deleted customer is left out'
);

select is(
  (select count(*)::integer from public.customer_repeat_status),
  6,
  'Every active customer has exactly one row'
);

-- The badge appears after the second completed job: finishing a job flips the status.
reset role;
update public.jobs set status = 'completed'
where customer_id = '00000000-0000-0000-0000-000000379c03' and status = 'cancelled';
set local role service_role;

select results_eq(
  $$select completed_job_count, is_repeat from public.customer_repeat_status
    where customer_id = '00000000-0000-0000-0000-000000379c03'$$,
  $$values (2, true)$$,
  'A customer becomes Repeat as soon as their second job is completed'
);

-- Who can read it. The view applies the RLS of customers and jobs.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000379a01","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::integer from public.customer_repeat_status),
  6,
  'An owner sees every active customer'
);

select results_eq(
  $$select is_repeat from public.customer_repeat_status
    where customer_id = '00000000-0000-0000-0000-000000379c02'$$,
  $$values (true)$$,
  'An owner sees the same Repeat status as the server'
);

reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000379a02","role":"authenticated"}', true);
set local role authenticated;

select is_empty(
  'select * from public.customer_repeat_status',
  'An employee cannot read repeat status, the same as customers'
);

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select throws_ok(
  'select * from public.customer_repeat_status',
  '42501',
  null,
  'An anonymous visitor has no access to the view'
);

reset role;

select ok(
  not has_table_privilege('authenticated', 'public.customer_repeat_status', 'insert,update,delete'),
  'Signed-in users cannot write to the view'
);

select * from finish();
rollback;
