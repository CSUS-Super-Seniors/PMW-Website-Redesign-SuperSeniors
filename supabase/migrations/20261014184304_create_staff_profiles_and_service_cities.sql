-- Staff accounts table creation
create table public.staff_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null,
  status text not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profiles_role_check check (role in ('owner', 'employee')),
  constraint staff_profiles_status_check check (status in ('active', 'inactive'))
);

alter table public.staff_profiles enable row level security;

-- Lookup table of cities PMW serves
create table public.service_cities (
  id bigint generated always as identity primary key,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint service_cities_name_key unique (name)
);

alter table public.service_cities enable row level security;
