-- Stable client-generated IDs deduplicate final submission across instances.
-- Nullable for legacy/manual inquiries and existing sample data.
alter table public.inquiries
  add column submission_id uuid unique,
  add column submission_hash text;

create function public.submit_estimate_request(
  p_submission_id uuid,
  p_submission_hash text,
  p_details jsonb,
  p_session_id uuid,
  p_storage_paths text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved public.inquiries%rowtype;
  details public.inquiries%rowtype;
begin
  if p_submission_id is null or p_submission_hash is null
    or p_submission_hash !~ '^[0-9a-f]{64}$'
    or p_details is null or jsonb_typeof(p_details) <> 'object'
    or p_storage_paths is null then
    raise exception 'Invalid submission';
  end if;

  -- Serialize identical IDs before lookup/insert, including when no row exists.
  -- Unique constraints remain the final guard for IDs, INQ numbers and photos.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_submission_id::text, 0));
  select * into saved from public.inquiries where submission_id = p_submission_id;
  if found then
    if saved.submission_hash is distinct from p_submission_hash then
      raise sqlstate 'PT409' using message = 'Submission ID already used';
    end if;
    return jsonb_build_object('id', saved.id, 'inquiry_number', saved.inquiry_number,
      'created_at', saved.created_at, 'created', false);
  end if;

  -- Only the server may call this, after shared validation, the current service-
  -- area check, spam checks, and verification of every signed photo and its bytes.
  details := jsonb_populate_record(null::public.inquiries, p_details);
  insert into public.inquiries (
    submission_id, submission_hash, first_name, last_name, email, phone, text_ok,
    address, city, item, issue_type, description, lead_source, in_service_area, status
  ) values (
    p_submission_id, p_submission_hash, details.first_name, details.last_name,
    details.email, details.phone, coalesce(details.text_ok, false), details.address,
    details.city, details.item, details.issue_type, details.description,
    details.lead_source, true, 'new'
  ) returning * into saved;

  -- A link conflict or any other photo error rolls back the inquiry insert too.
  begin
    perform public.reconcile_estimate_photos(saved.id, p_session_id, p_storage_paths, true);
  exception when raise_exception or unique_violation then
    raise sqlstate 'P7501' using message = 'Photo attachment conflict';
  end;
  return jsonb_build_object('id', saved.id, 'inquiry_number', saved.inquiry_number,
    'created_at', saved.created_at, 'created', true);
end;
$$;

revoke all on function public.submit_estimate_request(uuid, text, jsonb, uuid, text[])
  from public, anon, authenticated;
grant execute on function public.submit_estimate_request(uuid, text, jsonb, uuid, text[])
  to service_role;
