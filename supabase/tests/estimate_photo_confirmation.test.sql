begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
insert into public.inquiries (id, first_name, last_name, item) values
  ('30000000-0000-4000-8000-000000000001', 'Photo', 'Retry', 'Chair');
set local role service_role;
select is(public.confirm_finalized_estimate_photos(
  '30000000-0000-4000-8000-000000000001', null, array[]::text[]), false, 'Draft cannot be confirmed');
select public.reconcile_estimate_photos(
  '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
  array['estimate-uploads/1000000000/40000000-0000-4000-8000-000000000001/a.jpg'], true);
select is(public.confirm_finalized_estimate_photos(
  '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
  array['estimate-uploads/1000000000/40000000-0000-4000-8000-000000000001/a.jpg']), true, 'Original finalized set confirmed regardless of path expiry');
select is(public.confirm_finalized_estimate_photos(
  '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002',
  array['estimate-uploads/1000000000/40000000-0000-4000-8000-000000000001/a.jpg']), false, 'Foreign session cannot confirm');
select is(public.confirm_finalized_estimate_photos(
  '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', array[]::text[]), false, 'Removal cannot be confirmed');
select is(public.confirm_finalized_estimate_photos(
  '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
  array['estimate-uploads/2000000000/40000000-0000-4000-8000-000000000001/a.jpg']), false, 'Renewed path cannot replace final set');
select is(public.confirm_finalized_estimate_photos(
  '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', array[]::text[]), false, 'Missing inquiry cannot confirm');
select is((select storage_path from public.inquiry_photos where inquiry_id = '30000000-0000-4000-8000-000000000001'),
  'estimate-uploads/1000000000/40000000-0000-4000-8000-000000000001/a.jpg', 'Confirmation does not mutate links');
reset role;
select ok(not has_function_privilege('anon', 'public.confirm_finalized_estimate_photos(uuid,uuid,text[])', 'execute'), 'Anonymous cannot confirm');
select ok(not has_function_privilege('authenticated', 'public.confirm_finalized_estimate_photos(uuid,uuid,text[])', 'execute'), 'Browser cannot confirm');
select * from finish();
rollback;