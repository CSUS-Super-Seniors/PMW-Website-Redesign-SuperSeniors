-- Numbers shown to staff as J-1001, J-1002, ...
create sequence public.job_number_seq start with 1001;

-- Repair jobs, the center of the portal. A job always belongs to a customer and
-- may come from an inquiry. Fields tied to open client questions are nullable.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null default ('J-' || nextval('public.job_number_seq')),
  customer_id uuid not null references public.customers (id) on delete restrict,
  inquiry_id uuid references public.inquiries (id) on delete set null,
  item text not null,
  -- Free text so the job types can come from a config list.
  job_type text,
  status text not null default 'scheduled',
  scheduled_date date,
  visit_time time,
  completed_date date,
  notes text,
  after_visit_notes text,
  referral_name text,
  referral_phone text,
  amount numeric(10, 2),
  estimated_hours numeric(5, 2),
  actual_hours numeric(5, 2),
  lead_source text,
  city text,
  gallery_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_job_number_key unique (job_number),
  constraint jobs_status_check check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  constraint jobs_amount_check check (amount >= 0),
  constraint jobs_estimated_hours_check check (estimated_hours >= 0),
  constraint jobs_actual_hours_check check (actual_hours >= 0)
);

alter sequence public.job_number_seq owned by public.jobs.job_number;

alter table public.jobs enable row level security;

-- Schedule: jobs on a date range, in visit order.
create index jobs_scheduled_date_idx on public.jobs (scheduled_date, visit_time);

-- Jobs list: newest first, optionally filtered by status or by status and date.
create index jobs_created_at_idx on public.jobs (created_at desc);
create index jobs_status_created_at_idx on public.jobs (status, created_at desc);
create index jobs_status_scheduled_date_idx on public.jobs (status, scheduled_date);

-- Foreign keys are not indexed automatically.
create index jobs_customer_id_idx on public.jobs (customer_id);
create index jobs_inquiry_id_idx on public.jobs (inquiry_id);
