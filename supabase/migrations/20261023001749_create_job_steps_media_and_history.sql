-- Checklist steps for a job, shown in the order staff arrange them.
create table public.job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  body text not null,
  position integer not null,
  is_done boolean not null default false,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_steps_position_check check (position >= 0)
);

alter table public.job_steps enable row level security;

-- Photos and videos taken on a job. The file lives in the private job media bucket.
create table public.job_media (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null,
  stage text not null,
  storage_path text not null,
  -- Length of a video in seconds. Photos have no duration.
  duration_seconds integer,
  in_gallery boolean not null default false,
  created_at timestamptz not null default now(),
  constraint job_media_storage_path_key unique (storage_path),
  constraint job_media_kind_check check (kind in ('photo', 'video')),
  constraint job_media_stage_check check (stage in ('before', 'after')),
  constraint job_media_duration_check check (
    duration_seconds is null or (kind = 'video' and duration_seconds >= 0)
  )
);

alter table public.job_media enable row level security;

-- One row per field change on a job. Values are stored as text so any field fits.
create table public.job_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid references public.staff_profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

alter table public.job_history enable row level security;

-- Job page: checklist in order, media grouped by before/after, history newest first.
create index job_steps_job_id_idx on public.job_steps (job_id, position);
create index job_media_job_id_idx on public.job_media (job_id, stage, created_at);
create index job_history_job_id_idx on public.job_history (job_id, changed_at desc);

-- Public gallery: only media marked for it.
create index job_media_in_gallery_idx on public.job_media (created_at desc)
  where in_gallery;

-- Foreign keys are not indexed automatically.
create index job_history_changed_by_idx on public.job_history (changed_by);
