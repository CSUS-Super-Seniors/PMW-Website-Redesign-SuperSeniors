-- Read-only recovery of a lost finalization response. Never revives draft authority.
create function public.confirm_finalized_estimate_photos(
  p_inquiry_id uuid,
  p_session_id uuid,
  p_storage_paths text[]
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.inquiries i
    where i.id = p_inquiry_id
      and i.photos_finalized
      and i.photo_upload_session_id is not distinct from p_session_id
      and p_storage_paths is not null
      and not exists (select 1 from unnest(p_storage_paths) as paths(path) where path is null)
      and coalesce((
        select array_agg(storage_path order by storage_path)
        from public.inquiry_photos where inquiry_id = i.id
      ), array[]::text[]) = coalesce((
        select array_agg(distinct path order by path)
        from unnest(p_storage_paths) as paths(path)
      ), array[]::text[])
  );
$$;

-- The caller must verify inquiry ownership and signed upload receipts first.
revoke all on function public.confirm_finalized_estimate_photos(uuid, uuid, text[])
  from public, anon, authenticated;
grant execute on function public.confirm_finalized_estimate_photos(uuid, uuid, text[])
  to service_role;