create table public.migration_test (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table public.migration_test enable row level security;