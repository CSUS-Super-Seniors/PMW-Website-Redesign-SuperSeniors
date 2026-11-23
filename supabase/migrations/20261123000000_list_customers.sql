-- Customer list for the owner portal (SSPMW-338): search, filters and one page of
-- results with the total that matches, in one call.
--
-- Security invoker, so Row Level Security on customers applies to whoever calls
-- it. A signed-in owner sees customers; an employee, an inactive user or a user
-- without a staff profile gets a total of 0 and no rows. The server calls it with
-- the service role after its own owner check.
--
-- Rules:
-- - Soft-deleted customers (deleted_at set) never appear.
-- - Search matches part of the name ("first last" or "last first", any case), or,
--   when the search is only phone characters, part of the phone number's digits,
--   so "555-01", "55501" and "(916) 555" all find "(916) 555-0142".
-- - Jobs counts every job that is not cancelled. Repeat means two or more of
--   them (K8, SSPMW-379); anything less is New. Keep this in step with
--   REPEAT_CUSTOMER_MIN_JOBS in shared/src/customerList.ts.
-- - Last job is the latest completed date, else scheduled date, else the day the
--   job was created (Pacific time), across jobs that are not cancelled. The date
--   range filter applies to it, so customers with no jobs drop out of a range.
create function public.list_customers(
  p_search text default null,
  p_status text default null,
  p_last_job_from date default null,
  p_last_job_to date default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_term text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits text;
  v_pattern text;
  v_result jsonb;
begin
  if p_status is not null and p_status not in ('new', 'repeat') then
    raise exception 'Unknown customer status: %', p_status using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be from 1 to 100' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'p_offset must be 0 or more' using errcode = '22023';
  end if;

  if v_term is not null then
    -- like treats % and _ as wildcards and \ as the escape character.
    v_pattern := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if v_term ~ '^[0-9()+.\s-]+$' then
      v_digits := nullif(regexp_replace(v_term, '\D', '', 'g'), '');
    end if;
  end if;

  with job_summary as (
    select
      j.customer_id,
      count(*)::integer as job_count,
      max(coalesce(
        j.completed_date,
        j.scheduled_date,
        (j.created_at at time zone 'America/Los_Angeles')::date
      )) as last_job_date
    from public.jobs j
    where j.status <> 'cancelled'
    group by j.customer_id
  ),
  matches as (
    select
      c.id,
      c.first_name,
      c.last_name,
      c.phone,
      c.city,
      c.email,
      coalesce(s.job_count, 0) as job_count,
      s.last_job_date
    from public.customers c
    left join job_summary s on s.customer_id = c.id
    where c.deleted_at is null
      and (
        v_term is null
        or (c.first_name || ' ' || c.last_name) ilike v_pattern
        or (c.last_name || ' ' || c.first_name) ilike v_pattern
        or (
          v_digits is not null
          and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || v_digits || '%'
        )
      )
      and (
        p_status is null
        or (p_status = 'repeat') = (coalesce(s.job_count, 0) >= 2)
      )
      and (p_last_job_from is null or s.last_job_date >= p_last_job_from)
      and (p_last_job_to is null or s.last_job_date <= p_last_job_to)
  )
  select jsonb_build_object(
    'total', (select count(*) from matches),
    'customers', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', page.id,
            'firstName', page.first_name,
            'lastName', page.last_name,
            'phone', page.phone,
            'city', page.city,
            'email', page.email,
            'jobCount', page.job_count,
            'lastJobDate', page.last_job_date,
            'isRepeat', page.job_count >= 2
          )
          order by page.last_name, page.first_name, page.id
        )
        from (
          select *
          from matches
          -- Alphabetical, like the spreadsheets. The id breaks ties so rows never
          -- move between pages.
          order by last_name, first_name, id
          limit p_limit
          offset p_offset
        ) page
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.list_customers(text, text, date, date, integer, integer)
  from public, anon;
grant execute on function public.list_customers(text, text, date, date, integer, integer)
  to authenticated, service_role;
