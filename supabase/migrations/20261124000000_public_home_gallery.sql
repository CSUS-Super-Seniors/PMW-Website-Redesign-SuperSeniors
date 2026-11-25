-- Public copies have their own path. Never send a private job-media path to Home.
-- I4 sets gallery_storage_path after copying the file, then sets in_gallery.
alter table public.job_media
  add column gallery_storage_path text,
  add column gallery_published_at timestamptz,
  add constraint job_media_gallery_path_check check (
    gallery_storage_path is null
    or gallery_storage_path ~ (
      '^media/' || id::text || case when kind = 'photo'
        then '\.(jpg|jpeg|png|webp|avif)$'
        else '\.(mp4|mov|webm)$' end
    )
  );

comment on column public.job_media.gallery_storage_path is
  'Public gallery bucket key: media/<media UUID>.<extension>. Set only after the public copy succeeds. Private storage_path remains unchanged.';

-- Re-publishing an item makes it recent again. Ordinary edits do not change its date.
create function private.stamp_gallery_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.in_gallery then
    if tg_op = 'INSERT' then
      new.gallery_published_at := statement_timestamp();
    elsif not old.in_gallery
       or new.gallery_storage_path is distinct from old.gallery_storage_path then
      new.gallery_published_at := statement_timestamp();
    else
      new.gallery_published_at := old.gallery_published_at;
    end if;
  else
    new.gallery_published_at := null;
  end if;
  return new;
end;
$$;

create trigger stamp_gallery_publication
before insert or update on public.job_media
for each row execute function private.stamp_gallery_publication();

-- Legacy flags without a public copy stay hidden. I4 can supply a path later.
-- Anonymous table grants are deliberately unchanged: job_id and the new metadata
-- remain server-only. The server groups by job without returning that identifier.
create function public.recent_gallery_work()
returns table (id uuid, before_path text, after_path text)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (array_agg(m.id order by m.gallery_published_at desc, m.id desc))[1],
    (array_agg(m.gallery_storage_path order by m.gallery_published_at desc, m.id desc)
      filter (where m.stage = 'before'))[1],
    (array_agg(m.gallery_storage_path order by m.gallery_published_at desc, m.id desc)
      filter (where m.stage = 'after'))[1]
  from public.job_media m
  where m.in_gallery
    and m.kind = 'photo'
    and m.gallery_storage_path is not null
    and m.gallery_published_at is not null
  group by m.job_id
  order by max(m.gallery_published_at) desc,
    (array_agg(m.id order by m.gallery_published_at desc, m.id desc))[1] desc
  limit 3;
$$;

revoke all on function public.recent_gallery_work() from public, anon, authenticated;
grant execute on function public.recent_gallery_work() to service_role;

create index job_media_gallery_publication_idx
  on public.job_media (gallery_published_at desc, id desc)
  where in_gallery and kind = 'photo' and gallery_storage_path is not null;
