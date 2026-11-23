begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.inquiries (id, first_name, last_name, item) values
  ('10000000-0000-4000-8000-000000000001', 'Photo', 'Test', 'Chair'),
  ('10000000-0000-4000-8000-000000000002', 'Other', 'Test', 'Table');

set local role service_role;
select lives_ok($$
  select public.reconcile_estimate_photos(
    '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
    array['estimate-uploads/1900000000/20000000-0000-4000-8000-000000000001/a.jpg',
          'estimate-uploads/1900000000/20000000-0000-4000-8000-000000000001/b.jpg']);
$$, 'Initial draft photos attach');
select lives_ok($$
  select public.reconcile_estimate_photos(
    '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
    array['estimate-uploads/1900000000/20000000-0000-4000-8000-000000000001/a.jpg']);
$$, 'Retry replaces the draft set');
select is((select count(*)::int from public.inquiry_photos where inquiry_id = '10000000-0000-4000-8000-000000000001'), 1, 'Removed photo is no longer linked');
select throws_ok($$
  select public.reconcile_estimate_photos('10000000-0000-4000-8000-000000000001', null, array[]::text[]);
$$, 'P0001', 'Photo session does not own this inquiry', 'Empty retry cannot bypass session ownership');
select throws_ok($$
  select public.reconcile_estimate_photos(
    '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
    array['estimate-uploads/1900000000/20000000-0000-4000-8000-000000000001/a.jpg']);
$$, 'P0001', 'Photo already attached to another inquiry', 'Cross-inquiry claim rejected');
select is((select count(*)::int from public.inquiry_photos where inquiry_id = '10000000-0000-4000-8000-000000000001'), 1, 'Rejected claim leaves original links untouched');
select throws_ok($$
  select public.reconcile_estimate_photos(
    '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', array[]::text[]);
$$, 'P0001', 'Photo session does not own this inquiry', 'Foreign session cannot remove photos');
select lives_ok($$
  select public.reconcile_estimate_photos(
    '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
    array['estimate-uploads/1900100000/20000000-0000-4000-8000-000000000001/a.jpg']);
$$, 'Renewed session with the same identity can replace older-expiry paths');
select lives_ok($$
  select public.reconcile_estimate_photos(
    '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', array[]::text[], true);
$$, 'Removing all photos and finalizing works');
select is((select count(*)::int from public.inquiry_photos where inquiry_id = '10000000-0000-4000-8000-000000000001'), 0, 'Zero-photo retry clears previous links');
select lives_ok($$
  select public.reconcile_estimate_photos(
    '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', array[]::text[], true);
$$, 'Identical finalized retry is safe');
select throws_ok($$
  select public.reconcile_estimate_photos(
    '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
    array['estimate-uploads/1900000000/20000000-0000-4000-8000-000000000001/a.jpg']);
$$, 'P0001', 'Inquiry photos are finalized', 'Finalized set cannot change');
select lives_ok($$
  select public.reconcile_estimate_photos('10000000-0000-4000-8000-000000000002', null, array[]::text[], true);
$$, 'A no-photo submission needs no upload session');
reset role;
select ok(not has_function_privilege('anon', 'public.reconcile_estimate_photos(uuid,uuid,text[],boolean)', 'execute'), 'Anonymous cannot reconcile photos');
select ok(not has_function_privilege('authenticated', 'public.reconcile_estimate_photos(uuid,uuid,text[],boolean)', 'execute'), 'Signed-in browser cannot reconcile photos');
select * from finish();
rollback;