-- Customer list (SSPMW-338). Calls public.list_customers as each kind of user, the
-- same way PostgREST runs an RPC with their token. Rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

-- Only this file's rows, so totals are exact. seed.sql rows come back on rollback.
truncate public.customers, public.customer_notes, public.inquiries, public.inquiry_photos,
  public.jobs, public.job_steps, public.job_media, public.job_history, public.payments cascade;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000338a1', 'owner338@test.local'),
  ('00000000-0000-0000-0000-0000000338a2', 'employee338@test.local'),
  ('00000000-0000-0000-0000-0000000338a3', 'inactive338@test.local');

insert into public.staff_profiles (id, full_name, role, status) values
  ('00000000-0000-0000-0000-0000000338a1', 'List Owner', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000338a2', 'List Employee', 'employee', 'active'),
  ('00000000-0000-0000-0000-0000000338a3', 'Old Owner', 'owner', 'inactive');

insert into public.customers (id, first_name, last_name, phone, city, email, deleted_at) values
  ('00000000-0000-0000-0000-0000000338c1', 'Margaret', 'Lewis', '(916) 555-0142', 'Carmichael', 'm@test.local', null),
  ('00000000-0000-0000-0000-0000000338c2', 'Robert', 'Chen', '(530) 555-0177', 'Placerville', null, null),
  ('00000000-0000-0000-0000-0000000338c3', 'Dorothy', 'Alvarez', '916.555.0119', 'Fair Oaks', null, null),
  ('00000000-0000-0000-0000-0000000338c4', 'Walter', 'Kim', null, 'Vacaville', null, null),
  ('00000000-0000-0000-0000-0000000338c5', 'Deleted', 'Lewis', '(916) 555-0199', null, null, now()),
  ('00000000-0000-0000-0000-0000000338c6', 'Pct_100%', 'Literal', null, null, null, null);

-- Margaret: 3 jobs, one cancelled, so 2 count (Repeat). Last job Sep 24.
-- Robert: 1 job (New). Dorothy: 2 jobs (Repeat). Walter: no jobs (New).
-- The deleted customer has jobs too, and must still never appear.
insert into public.jobs (customer_id, item, status, scheduled_date, completed_date) values
  ('00000000-0000-0000-0000-0000000338c1', 'Bench', 'completed', '2026-09-01', '2026-09-24'),
  ('00000000-0000-0000-0000-0000000338c1', 'Chair', 'completed', '2026-07-10', '2026-07-12'),
  ('00000000-0000-0000-0000-0000000338c1', 'Desk', 'cancelled', '2026-11-01', null),
  ('00000000-0000-0000-0000-0000000338c2', 'Table', 'scheduled', '2026-09-18', null),
  ('00000000-0000-0000-0000-0000000338c3', 'Dresser', 'in_progress', '2026-08-30', null),
  ('00000000-0000-0000-0000-0000000338c3', 'Mirror', 'completed', '2026-03-02', '2026-03-05'),
  ('00000000-0000-0000-0000-0000000338c5', 'Shelf', 'completed', '2026-09-20', '2026-09-20'),
  ('00000000-0000-0000-0000-0000000338c5', 'Stool', 'completed', '2026-09-21', '2026-09-21');

-- Signs in as a user for the statements that follow, like a PostgREST request.
create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Names on the page, in order, as one text value.
create function pg_temp.names(result jsonb) returns text language sql as $$
  select coalesce(string_agg(c ->> 'firstName' || ' ' || (c ->> 'lastName'), ', ' order by n), '')
  from jsonb_array_elements(result -> 'customers') with ordinality as t(c, n);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-0000000338a1');

select is(
  pg_temp.names(public.list_customers()),
  'Dorothy Alvarez, Robert Chen, Walter Kim, Margaret Lewis, Pct_100% Literal',
  'owner sees every active customer by last name, and never a soft-deleted one'
);
select is((public.list_customers() ->> 'total')::int, 5, 'total leaves out the soft-deleted customer');

select is(
  public.list_customers() -> 'customers' -> 3,
  jsonb_build_object(
    'id', '00000000-0000-0000-0000-0000000338c1', 'firstName', 'Margaret', 'lastName', 'Lewis',
    'phone', '(916) 555-0142', 'city', 'Carmichael', 'email', 'm@test.local',
    'jobCount', 2, 'lastJobDate', '2026-09-24', 'isRepeat', true
  ),
  'a row has the list columns; cancelled jobs are not counted or used for last job'
);
select is(
  public.list_customers() -> 'customers' -> 2 -> 'lastJobDate', 'null'::jsonb,
  'a customer without jobs has no last job'
);

-- Search
select is(pg_temp.names(public.list_customers('marg')), 'Margaret Lewis', 'part of a first name, any case');
select is(pg_temp.names(public.list_customers('LEWIS')), 'Margaret Lewis', 'last name search skips the deleted Lewis');
select is(pg_temp.names(public.list_customers('garet lew')), 'Margaret Lewis', 'part of the full name');
select is(pg_temp.names(public.list_customers('chen robert')), 'Robert Chen', 'last name first');
select is(pg_temp.names(public.list_customers('555-01')), 'Dorothy Alvarez, Robert Chen, Margaret Lewis', 'part of a phone number, any format');
select is(pg_temp.names(public.list_customers('(916) 5550')), 'Dorothy Alvarez, Margaret Lewis', 'formatting is ignored on both sides');
select is(pg_temp.names(public.list_customers('0199')), '', 'a soft-deleted customer is not found by phone');
select is(pg_temp.names(public.list_customers('%')), 'Pct_100% Literal', 'a % in the search is a literal, not a wildcard');
select is(pg_temp.names(public.list_customers('zzz')), '', 'no match gives an empty page');
select is((public.list_customers('zzz') ->> 'total')::int, 0, 'no match gives a total of 0');

-- Filters
select is(pg_temp.names(public.list_customers(null, 'repeat')), 'Dorothy Alvarez, Margaret Lewis', 'Repeat filter');
select is(pg_temp.names(public.list_customers(null, 'new')), 'Robert Chen, Walter Kim, Pct_100% Literal', 'New filter includes customers with no jobs');
select is(
  pg_temp.names(public.list_customers(null, null, '2026-09-01', '2026-09-30')),
  'Robert Chen, Margaret Lewis',
  'date range applies to the last job date, inclusive'
);
select is(
  pg_temp.names(public.list_customers('555', 'repeat', '2026-08-01', '2026-09-30')),
  'Dorothy Alvarez, Margaret Lewis',
  'search, status and date range combine'
);

-- Pagination: the total is for all matches, the page holds only its rows.
select is(pg_temp.names(public.list_customers(null, null, null, null, 2, 2)), 'Walter Kim, Margaret Lewis', 'second page of two');
select is((public.list_customers(null, null, null, null, 2, 2) ->> 'total')::int, 5, 'total is the same on every page');

select throws_ok(
  $$select public.list_customers(null, 'vip')$$, '22023', null, 'an unknown status is refused'
);

-- Employees and inactive staff get nothing through RLS.
select pg_temp.sign_in('00000000-0000-0000-0000-0000000338a2');
select is(public.list_customers(), '{"total": 0, "customers": []}'::jsonb, 'an active employee sees no customers');

select pg_temp.sign_in('00000000-0000-0000-0000-0000000338a3');
select is(public.list_customers(), '{"total": 0, "customers": []}'::jsonb, 'an inactive owner sees no customers');

-- Anonymous visitors can't call it at all.
reset role;
set local role anon;
select throws_ok($$select public.list_customers()$$, '42501', null, 'anonymous visitors cannot call it');

select * from finish();
rollback;
