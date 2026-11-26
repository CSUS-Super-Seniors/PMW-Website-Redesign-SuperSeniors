-- Repeat customer rule (K8, SSPMW-379). The one definition of "repeat customer" that
-- the customer list (K1), customer profile (K2), dashboard summary (F2) and customer
-- report (M4) all read, so they never disagree.
--
-- Rule: a customer is Repeat once they have two or more jobs with status
-- 'completed'. Scheduled, in-progress and cancelled jobs do not count. The count is
-- worked out from jobs every time, never typed in by hand.
-- Keep the 2 in step with REPEAT_CUSTOMER_MIN_COMPLETED_JOBS in
-- shared/src/customerRepeat.ts.
--
-- One row per active customer (soft-deleted customers are left out), including
-- customers with no jobs yet, who get a count of 0.
--
-- security_invoker makes the view apply the Row Level Security of customers and
-- jobs to whoever reads it, so only an owner (or the server's service role) sees
-- rows, the same as reading customers directly.
create view public.customer_repeat_status
with (security_invoker = true)
as
select
  c.id as customer_id,
  count(j.id)::integer as completed_job_count,
  count(j.id) >= 2 as is_repeat
from public.customers c
left join public.jobs j
  on j.customer_id = c.id
  and j.status = 'completed'
where c.deleted_at is null
group by c.id;

comment on view public.customer_repeat_status is
  'Repeat customer rule (SSPMW-379): Repeat means 2 or more completed jobs. Read this instead of re-counting jobs.';

-- Read only, and never for anonymous visitors.
revoke all on public.customer_repeat_status from public, anon, authenticated, service_role;
grant select on public.customer_repeat_status to authenticated, service_role;

