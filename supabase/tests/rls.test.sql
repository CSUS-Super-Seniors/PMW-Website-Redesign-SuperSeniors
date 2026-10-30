-- RLS tests. Each query runs as a signed-in owner, employee, inactive employee,
-- signed-in user with no staff profile or anonymous visitor, the same way PostgREST runs a request with their token.
-- Everything runs in one transaction and is rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;

select plan(48);

-- Start from empty tables so the counts below only see this file's rows. Local
-- Supabase has the sample rows from seed.sql (db start and db reset load it).
-- Rolled back at the end like everything else. Add any table this file counts here.
truncate public.customers, public.customer_notes, public.inquiries, public.inquiry_photos,
  public.contact_messages, public.jobs, public.job_steps, public.job_media,
  public.job_history, public.payments, public.testimonials cascade;

-- Test data, inserted as postgres so RLS does not apply.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'employee@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'inactive@test.local'),
  ('00000000-0000-0000-0000-0000000000a4', 'nostaff@test.local');

insert into public.staff_profiles (id, full_name, role, status) values
  ('00000000-0000-0000-0000-0000000000a1', 'Test Owner', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000000a2', 'Test Employee', 'employee', 'active'),
  ('00000000-0000-0000-0000-0000000000a3', 'Inactive Employee', 'employee', 'inactive');

insert into public.customers (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'Pat', 'Customer', 'pat@test.local');

insert into public.customer_notes (customer_id, body) values
  ('00000000-0000-0000-0000-0000000000c1', 'Prefers mornings');

insert into public.inquiries (id, first_name, last_name, item) values
  ('00000000-0000-0000-0000-0000000000d1', 'Sam', 'Lead', 'Rocking chair');

insert into public.inquiry_photos (inquiry_id, storage_path) values
  ('00000000-0000-0000-0000-0000000000d1', 'inquiries/test/photo.jpg');

insert into public.contact_messages (name, email, message) values
  ('Alex Visitor', 'alex@test.local', 'Do you fix tables?');

insert into public.jobs (id, customer_id, item) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Dining table');

insert into public.job_steps (job_id, body, position) values
  ('00000000-0000-0000-0000-0000000000e1', 'Sand the top', 0);

insert into public.job_media (id, job_id, kind, stage, storage_path, in_gallery) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'photo', 'after', 'jobs/test/gallery.jpg', true),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e1', 'photo', 'before', 'jobs/test/private.jpg', false);

insert into public.job_history (job_id, field, old_value, new_value) values
  ('00000000-0000-0000-0000-0000000000e1', 'status', 'scheduled', 'in_progress');

insert into public.payments (job_id, stripe_session_id, amount) values
  ('00000000-0000-0000-0000-0000000000e1', 'cs_test_1', 250.00);

insert into public.testimonials (id, name, email, rating, body, can_publish, status) values
  ('00000000-0000-0000-0000-0000000000b1', 'Happy Customer', 'happy@test.local', 5, 'Great work', true, 'approved'),
  ('00000000-0000-0000-0000-0000000000b2', 'Pending Customer', 'pending@test.local', 4, 'Waiting', true, 'pending');

-- Owner. Confirms the test data is visible to someone, so the empty results
-- below come from RLS and not from missing rows.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select results_eq('select count(*)::int from public.customers', array[1], 'Owner can read customers');
select results_eq('select count(*)::int from public.payments', array[1], 'Owner can read payments');
select results_eq(
  $$select count(*)::int from public.staff_profiles where full_name in ('Test Owner', 'Test Employee', 'Inactive Employee')$$,
  array[3],
  'Owner can read staff profiles'
);
select results_eq(
  'select count(email)::int from public.testimonials',
  array[2],
  'Owner can read testimonial emails'
);
select results_eq(
  $$update public.jobs set item = 'Dining table (owner edit)' returning item$$,
  $$values ('Dining table (owner edit)'::text)$$,
  'Owner can update jobs'
);
select lives_ok(
  $$insert into public.job_media (id, job_id, kind, stage, storage_path, in_gallery)
    values ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e1', 'photo', 'after', 'jobs/test/owner-gallery.jpg', true)$$,
  'Owner can add job media to the gallery'
);

-- Employee
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

select results_eq('select count(*)::int from public.jobs', array[1], 'Employee can read jobs');
select results_eq('select count(*)::int from public.job_steps', array[1], 'Employee can read job steps');

select is_empty('select * from public.customers', 'Employee cannot read customers');
select is_empty('select * from public.customer_notes', 'Employee cannot read customer notes');
select is_empty('select * from public.inquiries', 'Employee cannot read inquiries');
select is_empty('select * from public.inquiry_photos', 'Employee cannot read inquiry photos');
select is_empty('select * from public.contact_messages', 'Employee cannot read contact messages');
select is_empty('select * from public.payments', 'Employee cannot read payments');
select is_empty('select * from public.job_history', 'Employee cannot read job history');
select is_empty('select * from public.testimonials', 'Employee cannot read testimonials');
select is_empty('select email from public.testimonials', 'Employee cannot read testimonial emails');
select is_empty('select * from public.staff_profiles', 'Employee cannot read staff profiles');

select lives_ok(
  $$insert into public.job_media (job_id, kind, stage, storage_path)
    values ('00000000-0000-0000-0000-0000000000e1', 'photo', 'before', 'jobs/test/employee.jpg')$$,
  'Employee can add job media'
);
select throws_ok(
  $$insert into public.job_media (job_id, kind, stage, storage_path, in_gallery)
    values ('00000000-0000-0000-0000-0000000000e1', 'photo', 'after', 'jobs/test/employee-gallery.jpg', true)$$,
  '42501',
  null,
  'Employee cannot add job media to the gallery'
);

-- Writes with no matching policy change no rows instead of raising an error.
select is_empty($$update public.jobs set item = 'Employee edit' returning id$$, 'Employee cannot update jobs');
select is_empty('delete from public.jobs returning id', 'Employee cannot delete jobs');
select is_empty('update public.job_media set in_gallery = true returning id', 'Employee cannot update job media');
select is_empty('delete from public.job_media returning id', 'Employee cannot delete job media');

-- Inactive employee
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);

select is_empty('select * from public.jobs', 'Inactive employee cannot read jobs');
select is_empty('select * from public.job_steps', 'Inactive employee cannot read job steps');

-- Signed-in user with no staff_profiles row, for example someone who signed up
-- on their own.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true);

select is_empty('select * from public.jobs', 'Non-staff user cannot read jobs');
select is_empty('select * from public.job_media', 'Non-staff user cannot read job media');
select is_empty('select * from public.customers', 'Non-staff user cannot read customers');
select is_empty('select * from public.payments', 'Non-staff user cannot read payments');
select is_empty('select * from public.testimonials', 'Non-staff user cannot read testimonials');
select is_empty('select email from public.testimonials', 'Non-staff user cannot read testimonial emails');

-- Anonymous visitor
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select is_empty('select * from public.jobs', 'Anonymous cannot read jobs');
select is_empty('select * from public.job_steps', 'Anonymous cannot read job steps');
select is_empty('select * from public.customers', 'Anonymous cannot read customers');
select is_empty('select * from public.customer_notes', 'Anonymous cannot read customer notes');
select is_empty('select * from public.inquiries', 'Anonymous cannot read inquiries');
select is_empty('select * from public.inquiry_photos', 'Anonymous cannot read inquiry photos');
select is_empty('select * from public.contact_messages', 'Anonymous cannot read contact messages');
select is_empty('select * from public.payments', 'Anonymous cannot read payments');
select is_empty('select * from public.job_history', 'Anonymous cannot read job history');
select is_empty('select * from public.staff_profiles', 'Anonymous cannot read staff profiles');

select results_eq(
  'select id from public.job_media order by id',
  $$values ('00000000-0000-0000-0000-0000000000f1'::uuid), ('00000000-0000-0000-0000-0000000000f3'::uuid)$$,
  'Anonymous only sees gallery media'
);
select results_eq(
  'select id from public.testimonials',
  $$values ('00000000-0000-0000-0000-0000000000b1'::uuid)$$,
  'Anonymous only sees approved testimonials'
);
select throws_ok(
  'select email from public.testimonials',
  '42501',
  null,
  'Anonymous cannot read testimonial emails'
);
select throws_ok(
  $$insert into public.job_media (job_id, kind, stage, storage_path)
    values ('00000000-0000-0000-0000-0000000000e1', 'photo', 'before', 'jobs/test/anon.jpg')$$,
  '42501',
  null,
  'Anonymous cannot add job media'
);

-- Owner again, to confirm the blocked employee writes above changed nothing.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select results_eq(
  'select item from public.jobs',
  $$values ('Dining table (owner edit)'::text)$$,
  'Employee writes left jobs unchanged'
);
select results_eq(
  'select count(*)::int from public.job_media where in_gallery',
  array[2],
  'Employee writes left job media unchanged'
);

select * from finish();
rollback;
