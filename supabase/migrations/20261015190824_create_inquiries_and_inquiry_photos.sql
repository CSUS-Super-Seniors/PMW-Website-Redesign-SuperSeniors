-- Numbers shown to staff as INQ-1001, INQ-1002, ...
create sequence public.inquiry_number_seq start with 1001;

-- Estimate requests from the public site. Customer fields are stored as submitted,
-- so the inquiry keeps what the visitor typed even after it is linked to a CRM customer.
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_number text not null default ('INQ-' || nextval('public.inquiry_number_seq')),
  customer_id uuid references public.customers (id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  preferred_contact text,
  text_ok boolean not null default false,
  item text not null,
  -- Free text so the "What happened?" options can come from a config list (Q9).
  issue_type text,
  description text,
  address text,
  city text,
  in_service_area boolean not null default false,
  lead_source text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inquiries_inquiry_number_key unique (inquiry_number),
  constraint inquiries_preferred_contact_check check (preferred_contact in ('email', 'phone', 'text')),
  constraint inquiries_status_check check (status in ('new', 'contacted', 'converted', 'closed'))
);

alter sequence public.inquiry_number_seq owned by public.inquiries.inquiry_number;

alter table public.inquiries enable row level security;

-- Optional photos attached to an inquiry. The file lives in the private inquiry photos bucket.
create table public.inquiry_photos (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint inquiry_photos_storage_path_key unique (storage_path)
);

alter table public.inquiry_photos enable row level security;

-- Inquiries list: newest first, optionally filtered by status.
create index inquiries_created_at_idx on public.inquiries (created_at desc);
create index inquiries_status_created_at_idx on public.inquiries (status, created_at desc);

-- Foreign keys are not indexed automatically.
create index inquiries_customer_id_idx on public.inquiries (customer_id);
create index inquiry_photos_inquiry_id_idx on public.inquiry_photos (inquiry_id);
