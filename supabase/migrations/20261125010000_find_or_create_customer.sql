-- Find or create a customer in one step (K9 SSPMW-385, used by K3 SSPMW-363).
--
-- Accept and create job (G3) and Add customer (K3) both need "is this person already a
-- customer? if not, add them". Done as a lookup followed by a separate insert, two
-- requests for the same new person at the same moment both see no match and both
-- insert, leaving a duplicate. This function does the lookup and the insert inside
-- one transaction while holding a lock on the person's email and phone, so the second
-- request waits, then finds the customer the first one created.
--
-- Matching rules (same as server/src/customerMatch.ts):
-- - Email: trimmed and lower case. Phone: digits only, a leading US "1" dropped, and
--   only a full 10-digit number counts. Anything shorter is too weak to match on.
-- - The oldest active (not soft-deleted) customer with the same email wins; otherwise
--   the oldest with the same phone digits.
-- - With no match and p_create true, a customer is inserted. The email is stored
--   trimmed and in lower case; the phone is stored as typed.
--
-- The locks are transaction-level advisory locks keyed on the normalized email and
-- phone, taken in a fixed order (email, then phone) so two calls can never deadlock.
-- A database unique index is not used because phones are stored as typed and existing
-- environments may already hold old duplicates that would make the migration fail.
--
-- Only the server (service role) may call it. It never reveals another customer's
-- details: the answer is the customer id, which detail matched, and whether it was
-- created.
create function public.find_or_create_customer(
  p_first_name text,
  p_last_name text,
  p_email text default null,
  p_phone text default null,
  p_address text default null,
  p_city text default null,
  p_preferred_contact text default null,
  p_text_ok boolean default false,
  p_lead_source text default null,
  p_next_follow_up_date date default null,
  p_create boolean default true
)
returns table (customer_id uuid, matched_by text, created boolean)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text;
  v_id uuid;
begin
  if length(v_digits) = 11 and left(v_digits, 1) = '1' then
    v_digits := substr(v_digits, 2);
  end if;
  v_phone := case when length(v_digits) = 10 then v_digits end;

  if v_email is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('customer-email:' || v_email, 0)
    );
  end if;
  if v_phone is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('customer-phone:' || v_phone, 0)
    );
  end if;

  if v_email is not null then
    select c.id into v_id
    from public.customers c
    where c.deleted_at is null
      and lower(btrim(c.email)) = v_email
    order by c.created_at, c.id
    limit 1;
    if v_id is not null then
      return query select v_id, 'email'::text, false;
      return;
    end if;
  end if;

  if v_phone is not null then
    select c.id into v_id
    from public.customers c
    where c.deleted_at is null
      and (
        regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone
        or regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = '1' || v_phone
      )
    order by c.created_at, c.id
    limit 1;
    if v_id is not null then
      return query select v_id, 'phone'::text, false;
      return;
    end if;
  end if;

  if not p_create then
    return;
  end if;

  insert into public.customers (
    first_name, last_name, email, phone, address, city,
    preferred_contact, text_ok, lead_source, next_follow_up_date
  )
  values (
    p_first_name, p_last_name, v_email, nullif(btrim(coalesce(p_phone, '')), ''), p_address,
    p_city, p_preferred_contact, coalesce(p_text_ok, false), p_lead_source,
    p_next_follow_up_date
  )
  returning id into v_id;

  return query select v_id, null::text, true;
end;
$$;

revoke execute on function public.find_or_create_customer(
  text, text, text, text, text, text, text, boolean, text, date, boolean
) from public, anon, authenticated;
grant execute on function public.find_or_create_customer(
  text, text, text, text, text, text, text, boolean, text, date, boolean
) to service_role;
