begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

select lives_ok(
  $$insert into public.service_cities (name, display_order) values
    ('SSPMW234 display order null fixture', null)$$,
  'NULL display_order is accepted'
);

select lives_ok(
  $$insert into public.service_cities (name, display_order) values
    ('SSPMW234 display order zero fixture', 0)$$,
  'zero display_order is accepted'
);

select lives_ok(
  $$insert into public.service_cities (name, display_order) values
    ('SSPMW234 display order positive fixture', 42)$$,
  'positive display_order is accepted'
);

select throws_ok(
  $$insert into public.service_cities (name, display_order) values
    ('SSPMW234 display order negative fixture', -1)$$,
  '23514',
  null,
  'negative display_order is rejected by the check constraint'
);

select * from finish();
rollback;