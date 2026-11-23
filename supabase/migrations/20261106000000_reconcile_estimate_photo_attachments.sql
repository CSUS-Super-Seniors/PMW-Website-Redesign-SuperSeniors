-- Keep draft photo replacement atomic and bind retries to their upload session.
alter table public.inquiries
  add column photo_upload_session_id uuid,
  add column photos_finalized boolean not null default false;

-- Existing inquiries were submitted before this draft-attachment protocol.
update public.inquiries set photos_finalized = true;

create function public.reconcile_estimate_photos(
  p_inquiry_id uuid,
  p_session_id uuid,
  p_storage_paths text[],
  p_finalize boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inquiry public.inquiries%rowtype;
  current_paths text[];
  desired_paths text[];
begin
  -- Serialize replacement/finalization for this inquiry across server instances.
  select * into inquiry from public.inquiries where id = p_inquiry_id for update;
  if not found then
    raise exception 'Inquiry not found';
  end if;
  if p_storage_paths is null or p_finalize is null then
    raise exception 'Invalid photo attachment request';
  end if;
  select coalesce(array_agg(distinct path order by path), array[]::text[])
    into desired_paths from unnest(p_storage_paths) as paths(path);
  if exists (
    select 1 from unnest(desired_paths) as paths(path)
    where path is null or p_session_id is null
      or path !~ ('^estimate-uploads/[0-9]+/' || p_session_id::text || '/[A-Za-z0-9.-]+$')
  ) then
    raise exception 'Invalid photo session paths';
  end if;
  if inquiry.photo_upload_session_id is not null
    and inquiry.photo_upload_session_id is distinct from p_session_id then
    raise exception 'Photo session does not own this inquiry';
  end if;
  select coalesce(array_agg(storage_path order by storage_path), array[]::text[])
    into current_paths from public.inquiry_photos where inquiry_id = p_inquiry_id;

  -- A lost final-submit response can be retried, but must never edit a final set.
  if inquiry.photos_finalized then
    if current_paths = desired_paths then return; end if;
    raise exception 'Inquiry photos are finalized';
  end if;
  if inquiry.status <> 'new' then
    raise exception 'Inquiry photos can no longer be changed';
  end if;
  -- Do not claim pre-existing/legacy attachments belonging to a different session.
  if exists (
    select 1 from unnest(current_paths) as paths(path)
    where p_session_id is null
      or path !~ ('^estimate-uploads/[0-9]+/' || p_session_id::text || '/[A-Za-z0-9.-]+$')
  ) then
    raise exception 'Photo session does not own existing attachments';
  end if;
  if exists (
    select 1 from public.inquiry_photos
    where storage_path = any(desired_paths) and inquiry_id <> p_inquiry_id
  ) then
    raise exception 'Photo already attached to another inquiry';
  end if;

  delete from public.inquiry_photos
    where inquiry_id = p_inquiry_id and not (storage_path = any(desired_paths));
  insert into public.inquiry_photos (inquiry_id, storage_path)
    select p_inquiry_id, path from unnest(desired_paths) as paths(path)
    where not exists (
      select 1 from public.inquiry_photos where storage_path = path
    );
  -- Catch a concurrent claim of an object by a different inquiry and roll back.
  if exists (
    select 1 from unnest(desired_paths) as paths(path)
    where not exists (
      select 1 from public.inquiry_photos
      where inquiry_id = p_inquiry_id and storage_path = path
    )
  ) then
    raise exception 'Photo attachment conflict';
  end if;
  update public.inquiries set
    photo_upload_session_id = coalesce(photo_upload_session_id, p_session_id),
    photos_finalized = p_finalize
    where id = p_inquiry_id;
end;
$$;

-- Only trusted server code may invoke this after verifying inquiry ownership
-- and every upload receipt. Browser-supplied paths are not authorization.
revoke all on function public.reconcile_estimate_photos(uuid, uuid, text[], boolean)
  from public, anon, authenticated;
grant execute on function public.reconcile_estimate_photos(uuid, uuid, text[], boolean)
  to service_role;