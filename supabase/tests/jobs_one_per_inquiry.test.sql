begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into public.customers (id, first_name, last_name) values
  ('00000000-0000-0000-0000-000000000156', 'One', 'Job');
insert into public.inquiries (id, first_name, last_name, item) values
  ('00000000-0000-0000-0000-000000001156', 'One', 'Job', 'Dining chair');

select lives_ok(
  $$insert into public.jobs (customer_id, inquiry_id, item) values
    ('00000000-0000-0000-0000-000000000156', '00000000-0000-0000-0000-000000001156', 'Dining chair')$$,
  'an inquiry can have a job'
);

select throws_ok(
  $$insert into public.jobs (customer_id, inquiry_id, item) values
    ('00000000-0000-0000-0000-000000000156', '00000000-0000-0000-0000-000000001156', 'Dining chair')$$,
  '23505',
  null,
  'a second job for the same inquiry is refused'
);

select lives_ok(
  $$insert into public.jobs (customer_id, item) values
    ('00000000-0000-0000-0000-000000000156', 'Table'),
    ('00000000-0000-0000-0000-000000000156', 'Bench')$$,
  'jobs without an inquiry are not limited'
);

select * from finish();
rollback;