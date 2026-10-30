-- Sample data from the Figma mockups (customers, inquiries, jobs J-1001 to J-1005),
-- so a built screen can be compared to its mockup.
--
-- Safe to run again: every row has a fixed id, and a rerun puts each sample row back
-- to its sample values (including fields edited in the app) instead of adding a copy.
-- Rows created in the app, such as extra jobs, notes or steps, are not touched.
--
-- Runs automatically on `npm run db:reset` (local only). For dev and staging, use
-- `npm run db:seed`, which refuses to run against production. Never run this file
-- by hand against production, and never use `supabase db push --include-seed`.

-- Customers (Figma: Customers list, Customer profile, Inquiries list, Jobs list)
insert into public.customers (
  id, first_name, last_name, email, phone, address, city,
  preferred_contact, text_ok, lead_source, next_follow_up_date, created_at
)
values
  ('5eed0001-0000-4000-8000-000000000001', 'Margaret', 'Lewis', 'margaret.lewis@email.com',
   '(916) 555-0142', '4821 Fair Oaks Blvd', 'Carmichael', 'email', true, 'Referral', '2026-10-15',
   '2026-09-01 10:07:00-07'),
  ('5eed0001-0000-4000-8000-000000000002', 'Robert', 'Chen', 'robert.chen@protonmail.com',
   '(530) 555-0177', null, 'Placerville', null, false, null, null,
   '2026-09-01 10:06:00-07'),
  ('5eed0001-0000-4000-8000-000000000003', 'Dorothy', 'Alvarez', 'dorothy.alvarez@gmail.com',
   '(916) 555-0119', null, 'Fair Oaks', null, false, null, null,
   '2026-09-01 10:05:00-07'),
  ('5eed0001-0000-4000-8000-000000000004', 'Walter', 'Kim', 'walter.kim@icloud.com',
   '(707) 555-0163', null, 'Vacaville', null, false, null, null,
   '2026-09-01 10:04:00-07'),
  ('5eed0001-0000-4000-8000-000000000005', 'Linda', 'Martinez', null,
   null, null, 'Sacramento', null, false, null, null,
   '2026-09-01 10:03:00-07'),
  ('5eed0001-0000-4000-8000-000000000006', 'James', 'Wilson', null,
   null, null, 'Orangevale', null, false, null, null,
   '2026-09-01 10:02:00-07'),
  ('5eed0001-0000-4000-8000-000000000007', 'Carol', 'Smith', null,
   null, null, 'Citrus Heights', null, false, null, null,
   '2026-09-01 10:01:00-07')
on conflict (id) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  phone = excluded.phone,
  address = excluded.address,
  city = excluded.city,
  preferred_contact = excluded.preferred_contact,
  text_ok = excluded.text_ok,
  lead_source = excluded.lead_source,
  next_follow_up_date = excluded.next_follow_up_date,
  deleted_at = null,
  created_at = excluded.created_at,
  updated_at = now();

-- Notes on Margaret Lewis's profile (Figma: Customer profile)
insert into public.customer_notes (id, customer_id, body, created_at)
values
  ('5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000001',
   'Repeat customer with three completed jobs. Prefers email follow-up and has requested a quick callback for future quotes.',
   '2026-09-24 09:00:00-07'),
  ('5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000001',
   'Confirmed the latest invoice and requested a reminder before the next scheduled visit.',
   '2026-08-30 09:00:00-07'),
  ('5eed0002-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000001',
   'Referred by a neighbor and prefers weekday appointments between 10:00 AM and 2:00 PM.',
   '2026-08-12 09:00:00-07')
on conflict (id) do update set
  customer_id = excluded.customer_id,
  body = excluded.body,
  author_id = null,
  created_at = excluded.created_at;

-- Estimate requests (Figma: Inquiries list and INQ-1048 detail). Contact fields are
-- stored as the visitor typed them, so INQ-1048 keeps margaret@example.com.
-- Figma statuses map to the schema: New -> new, Reviewed -> contacted,
-- Accepted -> converted, Declined -> closed.
insert into public.inquiries (
  id, inquiry_number, customer_id, first_name, last_name, email, phone,
  preferred_contact, text_ok, item, issue_type, description, address, city,
  in_service_area, status, created_at
)
values
  ('5eed0003-0000-4000-8000-000000001048', 'INQ-1048', '5eed0001-0000-4000-8000-000000000001',
   'Margaret', 'Lewis', 'margaret@example.com', '(916) 555-0142', null, true,
   'Dining chair', 'Loose joint / wobbling',
   'The chair rocks from side to side and the rear joint looks loose. No pieces are broken or missing.',
   '4821 Fair Oaks Blvd', 'Carmichael', true, 'new', '2026-10-01 10:18:00-07'),
  ('5eed0003-0000-4000-8000-000000001047', 'INQ-1047', '5eed0001-0000-4000-8000-000000000002',
   'Robert', 'Chen', 'robert.chen@protonmail.com', '(530) 555-0177', null, false,
   'Oak dining table', null, null, null, 'Fair Oaks', true, 'new', '2026-10-01 08:42:00-07'),
  ('5eed0003-0000-4000-8000-000000001046', 'INQ-1046', '5eed0001-0000-4000-8000-000000000005',
   'Linda', 'Martinez', null, null, null, false,
   'Cedar chest', null, null, null, 'Sacramento', true, 'contacted', '2026-09-30 15:16:00-07'),
  ('5eed0003-0000-4000-8000-000000001045', 'INQ-1045', '5eed0001-0000-4000-8000-000000000006',
   'James', 'Wilson', null, null, null, false,
   'Rocking chair', null, null, null, 'Orangevale', true, 'converted', '2026-09-30 11:05:00-07'),
  ('5eed0003-0000-4000-8000-000000001044', 'INQ-1044', '5eed0001-0000-4000-8000-000000000007',
   'Carol', 'Smith', null, null, null, false,
   'Bedroom dresser', null, null, null, 'Citrus Heights', true, 'closed', '2026-09-29 14:28:00-07')
on conflict (id) do update set
  inquiry_number = excluded.inquiry_number,
  customer_id = excluded.customer_id,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  phone = excluded.phone,
  preferred_contact = excluded.preferred_contact,
  text_ok = excluded.text_ok,
  item = excluded.item,
  issue_type = excluded.issue_type,
  description = excluded.description,
  address = excluded.address,
  city = excluded.city,
  in_service_area = excluded.in_service_area,
  status = excluded.status,
  lead_source = null,
  created_at = excluded.created_at,
  updated_at = now();

-- Jobs J-1001 to J-1005 (Figma: Jobs list and job pages). The start date is the
-- scheduled date; the due date is on the last checklist step below. created_at is
-- set so the newest-first jobs list shows them in the Figma order (J-1001 first). Figma's
-- "Planning" and "Not Started" are both "scheduled" in the schema.
insert into public.jobs (
  id, job_number, customer_id, item, job_type, status, scheduled_date, notes, city, created_at
)
values
  ('5eed0004-0000-4000-8000-000000001001', 'J-1001', '5eed0001-0000-4000-8000-000000000001',
   'Entry bench', 'Repair', 'in_progress', '2026-10-01',
   'Repair job for Margaret Lewis. Confirm the work with the customer, order materials, and schedule the visit.',
   'Carmichael', '2026-09-01 11:05:00-07'),
  ('5eed0004-0000-4000-8000-000000001002', 'J-1002', '5eed0001-0000-4000-8000-000000000002',
   'Oak dining table', 'Refinishing', 'scheduled', '2026-10-10',
   'Repair job for Robert Chen. Confirm the work with the customer, order materials, and schedule the visit.',
   'Placerville', '2026-09-01 11:04:00-07'),
  ('5eed0004-0000-4000-8000-000000001003', 'J-1003', '5eed0001-0000-4000-8000-000000000005',
   'Cedar chest', 'Restoration', 'scheduled', '2026-10-15',
   'Repair job for Linda Martinez. Confirm the work with the customer, order materials, and schedule the visit.',
   'Sacramento', '2026-09-01 11:03:00-07'),
  ('5eed0004-0000-4000-8000-000000001004', 'J-1004', '5eed0001-0000-4000-8000-000000000006',
   'Writing desk', 'Refinishing', 'scheduled', '2026-10-22',
   'Repair job for James Wilson. Confirm the work with the customer, order materials, and schedule the visit.',
   'Orangevale', '2026-09-01 11:02:00-07'),
  ('5eed0004-0000-4000-8000-000000001005', 'J-1005', '5eed0001-0000-4000-8000-000000000003',
   'Antique dresser', 'Repair', 'in_progress', '2026-09-28',
   'Repair job for Dorothy Alvarez. Confirm the work with the customer, order materials, and schedule the visit.',
   'Fair Oaks', '2026-09-01 11:01:00-07')
on conflict (id) do update set
  job_number = excluded.job_number,
  customer_id = excluded.customer_id,
  item = excluded.item,
  job_type = excluded.job_type,
  status = excluded.status,
  scheduled_date = excluded.scheduled_date,
  notes = excluded.notes,
  city = excluded.city,
  inquiry_id = null,
  visit_time = null,
  completed_date = null,
  after_visit_notes = null,
  referral_name = null,
  referral_phone = null,
  amount = null,
  estimated_hours = null,
  actual_hours = null,
  lead_source = null,
  gallery_consent = false,
  created_at = excluded.created_at,
  updated_at = now();

-- The three checklist steps every Figma job page shows. Ids end in the job number and
-- the 0-based position, so J-1001's third step ("Final check") ends in ...10012.
-- The last step carries the job's due date.
insert into public.job_steps (id, job_id, body, position, due_date)
select
  ('5eed0005-0000-4000-8000-0000000' || jobs.num || step.position)::uuid,
  ('5eed0004-0000-4000-8000-00000000' || jobs.num)::uuid,
  step.body,
  step.position,
  case when step.position = 2 then jobs.due_date end
from (
  values
    ('1001', date '2026-10-20'),
    ('1002', date '2026-10-25'),
    ('1003', date '2026-11-05'),
    ('1004', date '2026-11-12'),
    ('1005', date '2026-10-18')
) as jobs (num, due_date)
cross join (
  values
    (0, 'Confirm the work with the customer'),
    (1, 'Order materials and do the repair'),
    (2, 'Final check with the customer')
) as step (position, body)
on conflict (id) do update set
  job_id = excluded.job_id,
  body = excluded.body,
  position = excluded.position,
  due_date = excluded.due_date,
  is_done = false,
  updated_at = now();

-- The seed sets job and inquiry numbers itself, so move the number sequences past
-- the highest number in use. Otherwise the next job created in the app would get J-1001.
select setval(
  'public.job_number_seq',
  greatest(
    (select last_value from public.job_number_seq),
    (select max(substring(job_number from 3)::bigint)
     from public.jobs where job_number ~ '^J-[0-9]+$')
  )
);

select setval(
  'public.inquiry_number_seq',
  greatest(
    (select last_value from public.inquiry_number_seq),
    (select max(substring(inquiry_number from 5)::bigint)
     from public.inquiries where inquiry_number ~ '^INQ-[0-9]+$')
  )
);
