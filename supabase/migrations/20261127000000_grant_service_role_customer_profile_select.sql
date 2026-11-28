-- The customer-profile backend reads these tables with service_role (SSPMW-350).
-- The security-invoker customer_repeat_status view also needs underlying reads.
-- Explicit grants avoid relying on project default privileges; RLS is unchanged.
grant select on table
  public.customers,
  public.customer_notes,
  public.jobs
to service_role;