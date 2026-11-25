-- find_or_create_customer (SSPMW-385): one-step match or insert, so two requests for
-- the same new person can't both create a customer. Rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

truncate public.customers, public.customer_notes, public.inquiries, public.inquiry_photos,
  public.jobs, public.job_steps, public.job_media, public.job_history, public.payments cascade;

insert into public.customers (id, first_name, last_name, email, phone, created_at, deleted_at) values
  ('00000000-0000-0000-0000-000000385c01', 'Margaret', 'Lewis', ' Margaret@Example.com ',
   '(916) 555-0142', '2026-01-01', null),
  ('00000000-0000-0000-0000-000000385c02', 'Margaret', 'Newer', 'margaret@example.com',
   null, '2026-06-01', null),
  ('00000000-0000-0000-0000-000000385c03', 'Robert', 'Chen', null,
   '+1 530-555-0177', '2026-01-01', null),
  ('00000000-0000-0000-0000-000000385c04', 'Gone', 'Customer', 'gone@example.com',
   '(707) 555-0100', '2026-01-01', now());

set local role service_role;

-- Matching
select results_eq(
  $$select customer_id, matched_by, created from public.find_or_create_customer(
    'M', 'L', p_email => 'MARGARET@example.com ', p_phone => null)$$,
  $$values ('00000000-0000-0000-0000-000000385c01'::uuid, 'email', false)$$,
  'Email matches ignoring case and spaces, oldest customer first'
);

select results_eq(
  $$select customer_id, matched_by, created from public.find_or_create_customer(
    'R', 'C', p_phone => '530.555.0177')$$,
  $$values ('00000000-0000-0000-0000-000000385c03'::uuid, 'phone', false)$$,
  'Phone matches by digits, ignoring a stored +1'
);

select results_eq(
  $$select customer_id, matched_by from public.find_or_create_customer(
    'M', 'L', p_email => 'someone.new@example.com', p_phone => '1 (916) 555-0142')$$,
  $$values ('00000000-0000-0000-0000-000000385c01'::uuid, 'phone')$$,
  'A new email falls back to the phone match'
);

select results_eq(
  $$select customer_id, matched_by from public.find_or_create_customer(
    'M', 'L', p_email => 'margaret@example.com', p_phone => '(530) 555-0177')$$,
  $$values ('00000000-0000-0000-0000-000000385c01'::uuid, 'email')$$,
  'Email is checked before phone'
);

select is(
  (select count(*)::integer from public.customers),
  4,
  'Matching never inserts'
);

select is_empty(
  $$select * from public.find_or_create_customer(
    'G', 'C', p_email => 'gone@example.com', p_phone => '(707) 555-0100', p_create => false)$$,
  'A soft-deleted customer is never matched'
);

select is_empty(
  $$select * from public.find_or_create_customer(
    'X', 'Y', p_email => 'm_rgaret@example.com', p_create => false)$$,
  'Email wildcards are plain text'
);

select is_empty(
  $$select * from public.find_or_create_customer(
    'X', 'Y', p_phone => '555-0142', p_create => false)$$,
  'A partial phone number never matches'
);

select is_empty(
  $$select * from public.find_or_create_customer(
    'X', 'Y', p_phone => '(209) 555-0142', p_create => false)$$,
  'Sharing only the last four digits is not a match'
);

-- Creating
select results_eq(
  $$select matched_by, created from public.find_or_create_customer(
    'Ana', 'Ruiz', p_email => ' Ana.Ruiz@Example.com', p_phone => ' (916) 555-0100 ',
    p_city => 'Fair Oaks', p_preferred_contact => 'text', p_text_ok => true,
    p_lead_source => 'yelp', p_next_follow_up_date => '2026-12-01')$$,
  $$values (null::text, true)$$,
  'A new person is created'
);

select results_eq(
  $$select first_name, last_name, email, phone, city, preferred_contact, text_ok, lead_source,
      next_follow_up_date
    from public.customers where first_name = 'Ana'$$,
  $$values ('Ana', 'Ruiz', 'ana.ruiz@example.com', '(916) 555-0100', 'Fair Oaks', 'text', true,
      'yelp', '2026-12-01'::date)$$,
  'The new customer keeps every detail, with the email trimmed and in lower case'
);

select results_eq(
  $$select matched_by, created from public.find_or_create_customer(
    'Ana', 'Ruiz', p_email => 'ana.ruiz@example.com')$$,
  $$values ('email'::text, false)$$,
  'Running it again for the same person finds the customer just created'
);

select is(
  (select count(*)::integer from public.customers where first_name = 'Ana'),
  1,
  'The same person leaves exactly one record'
);

select is_empty(
  $$select * from public.find_or_create_customer(
    'Nobody', 'New', p_email => 'nobody@example.com', p_create => false)$$,
  'With p_create false and no match, nothing is returned'
);

select is(
  (select count(*)::integer from public.customers where email = 'nobody@example.com'),
  0,
  'With p_create false, nothing is inserted'
);

-- Who can call it
reset role;
select ok(
  not has_function_privilege('authenticated',
    'public.find_or_create_customer(text, text, text, text, text, text, text, boolean, text, date, boolean)',
    'execute'),
  'Signed-in users cannot call it directly'
);

select ok(
  not has_function_privilege('anon',
    'public.find_or_create_customer(text, text, text, text, text, text, text, boolean, text, date, boolean)',
    'execute'),
  'Anonymous visitors cannot call it'
);

select * from finish();
rollback;
