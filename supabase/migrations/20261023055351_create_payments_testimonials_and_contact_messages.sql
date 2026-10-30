-- Card payments for a job, made through Stripe Checkout. Card details stay with
-- Stripe; only the session id is kept here. Payments are kept even if the job
-- is no longer needed, so a job with payments cannot be deleted.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete restrict,
  stripe_session_id text not null,
  amount numeric(10, 2) not null,
  status text not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_stripe_session_id_key unique (stripe_session_id),
  constraint payments_amount_check check (amount > 0),
  constraint payments_status_check check (status in ('pending', 'paid')),
  -- A paid payment has a paid time and a pending one does not.
  constraint payments_paid_at_check check ((status = 'paid') = (paid_at is not null))
);

alter table public.payments enable row level security;

-- Testimonials submitted from the public site. Staff review each one before it
-- can be shown, and it is only shown if the customer allowed publishing.
create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  city text,
  -- Free text so the services can come from a config list.
  service text,
  rating smallint not null,
  body text not null,
  can_publish boolean not null default false,
  photo_contact_ok boolean not null default false,
  status text not null default 'pending',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint testimonials_rating_check check (rating between 1 and 5),
  constraint testimonials_status_check check (status in ('pending', 'approved', 'rejected'))
);

alter table public.testimonials enable row level security;

-- Messages from the public contact form. The visitor leaves a phone number, an email, or both.
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  message text not null,
  created_at timestamptz not null default now(),
  constraint contact_messages_contact_check check (phone is not null or email is not null)
);

alter table public.contact_messages enable row level security;

-- Payments list: newest first, optionally filtered by status.
create index payments_status_created_at_idx on public.payments (status, created_at desc);

-- Testimonials review queue, and the approved ones the public site may show.
create index testimonials_status_submitted_at_idx on public.testimonials (status, submitted_at desc);
create index testimonials_published_idx on public.testimonials (submitted_at desc)
  where status = 'approved' and can_publish;

-- Contact messages: newest first.
create index contact_messages_created_at_idx on public.contact_messages (created_at desc);

-- Foreign keys are not indexed automatically.
create index payments_job_id_idx on public.payments (job_id);
