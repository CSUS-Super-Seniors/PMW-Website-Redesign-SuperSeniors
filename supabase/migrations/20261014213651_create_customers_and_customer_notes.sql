-- Customers tracked by the CRM. Rows are soft-deleted by setting deleted_at.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  address text,
  city text,
  preferred_contact text,
  text_ok boolean not null default false,
  lead_source text,
  next_follow_up_date date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_preferred_contact_check check (preferred_contact in ('email', 'phone', 'text'))
);

alter table public.customers enable row level security;

-- Notes staff leave on a customer. A note must belong to an existing customer.
create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  body text not null,
  author_id uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.customer_notes enable row level security;

-- CRM search lists active customers only.
create index customers_name_idx on public.customers (last_name, first_name)
  where deleted_at is null;

-- Email and phone cover deleted customers too, so repeat tracking can find returning customers.
create index customers_email_idx on public.customers (lower(email));
create index customers_phone_idx on public.customers (phone);

-- Foreign keys are not indexed automatically.
create index customer_notes_customer_id_idx on public.customer_notes (customer_id, created_at desc);
create index customer_notes_author_id_idx on public.customer_notes (author_id);
