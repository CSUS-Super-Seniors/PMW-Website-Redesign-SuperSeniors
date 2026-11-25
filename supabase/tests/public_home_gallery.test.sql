begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.customers (id, first_name, last_name) values
  ('00000000-0000-0000-0000-000000000225', 'Private', 'Customer');
insert into public.jobs (id, customer_id, item)
select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000225', 'Private customer furniture'
from generate_series(1, 5) n;

-- Always include a pre-existing published item so an empty local gallery cannot
-- hide missing test isolation. The outer transaction rolls this fixture back.
insert into public.job_media (id, job_id, kind, stage, storage_path, in_gallery, gallery_storage_path) values
  ('22500000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000005', 'photo', 'after',
   'private/existing-gallery.jpg', true, 'media/22500000-0000-4000-8000-000000000001.jpg');

-- Counts, ordering and the final unpublish must see only this test's rows.
-- The final transaction rollback restores every pre-existing media row.
truncate public.job_media;

-- Two public photos per job; UUID ordering breaks publication-time ties.
insert into public.job_media (id, job_id, kind, stage, storage_path, in_gallery, gallery_storage_path)
select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  ('00000000-0000-0000-0000-' || lpad(((n + 1) / 2)::text, 12, '0'))::uuid,
  'photo', case when n % 2 = 1 then 'before' else 'after' end,
  'private/customer-name/' || n::text || '.jpg', true,
  'media/00000000-0000-0000-0000-' || lpad(n::text, 12, '0') || '.jpg'
from generate_series(1, 8) n;

select is((select count(*)::int from public.recent_gallery_work()), 3,
  'Home returns the three most recent jobs, not three individual photos');
select results_eq(
  'select id from public.recent_gallery_work()',
  $$values ('00000000-0000-0000-0000-000000000008'::uuid),
    ('00000000-0000-0000-0000-000000000006'::uuid),
    ('00000000-0000-0000-0000-000000000004'::uuid)$$,
  'Publication order has a deterministic tie breaker'
);
select is(
  (select before_path from public.recent_gallery_work() where id = '00000000-0000-0000-0000-000000000008'),
  'media/00000000-0000-0000-0000-000000000007.jpg',
  'Before and after are paired only within the same job'
);
select is((select count(*)::int from public.job_media where gallery_published_at is not null), 8,
  'Publishing automatically timestamps the media');

-- Newest uploads must not displace published work until owners publish them.
insert into public.job_media (id, job_id, kind, stage, storage_path, in_gallery, gallery_storage_path) values
  ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000005', 'photo', 'after', 'private/unpublished.jpg', false, 'media/00000000-0000-0000-0000-000000000009.jpg'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000005', 'video', 'after', 'private/video.mp4', true, 'media/00000000-0000-0000-0000-000000000010.mp4'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000005', 'photo', 'after', 'private/legacy.jpg', true, null);
select is((select count(*)::int from public.recent_gallery_work()), 3,
  'Unpublished media, videos and legacy flags without public copies are excluded');
select is_empty(
  $$select * from public.recent_gallery_work() where id in
    ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000011')$$,
  'No excluded item leaks into Home'
);

update public.job_media set in_gallery = false where id = '00000000-0000-0000-0000-000000000008';
select is(
  (select after_path from public.recent_gallery_work() where id = '00000000-0000-0000-0000-000000000007'),
  null::text, 'Removing one stage immediately removes that public photo'
);
update public.job_media set in_gallery = false where id = '00000000-0000-0000-0000-000000000007';
select is_empty(
  $$select * from public.recent_gallery_work() where id in
    ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000008')$$,
  'Removing both stages removes the pair'
);
update public.job_media set in_gallery = false where id = '00000000-0000-0000-0000-000000000001';
update public.job_media set in_gallery = true where id = '00000000-0000-0000-0000-000000000001';
select is((select id from public.recent_gallery_work() limit 1),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Re-publishing an old upload moves it ahead of newer uploads');

select throws_ok(
  $$update public.job_media set gallery_storage_path = 'media/Customer-123-Main-St.jpg'
    where id = '00000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'Public paths cannot include customer names, addresses or job numbers'
);

set local role anon;
select throws_ok('select * from public.recent_gallery_work()', '42501', null,
  'Anonymous visitors cannot invoke the internal grouping RPC');
reset role;
set local role authenticated;
select throws_ok('select * from public.recent_gallery_work()', '42501', null,
  'Authenticated clients cannot invoke the internal grouping RPC');
reset role;

update public.job_media set in_gallery = false;
set local role service_role;
select is_empty('select * from public.recent_gallery_work()',
  'Server reads an empty gallery after all items are removed');
reset role;

select * from finish();
rollback;
