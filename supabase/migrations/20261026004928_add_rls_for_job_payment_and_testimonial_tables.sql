-- Job side access. The owner can do everything. Employees can read jobs and
-- their steps and add job media, and nothing else. The public can only see
-- gallery media and approved testimonials. Tables or actions with no policy for
-- a role are blocked by RLS. Uses private.current_staff_role() from the
-- customer, inquiry and contact RLS migration.
-- The helper is wrapped in a select so it runs once per query, not once per row.

-- Owner full access
create policy "Owners have full access to jobs"
on public.jobs
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');

create policy "Owners have full access to job steps"
on public.job_steps
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');

create policy "Owners have full access to job media"
on public.job_media
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');

create policy "Owners have full access to job history"
on public.job_history
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');

create policy "Owners have full access to payments"
on public.payments
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');

create policy "Owners have full access to testimonials"
on public.testimonials
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');

create policy "Owners have full access to staff profiles"
on public.staff_profiles
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');

create policy "Owners have full access to service cities"
on public.service_cities
for all
to authenticated
using ((select private.current_staff_role()) = 'owner')
with check ((select private.current_staff_role()) = 'owner');

-- Employee field access. No policies on job_history, payments, testimonials or
-- staff_profiles, so employees cannot read or change them.
create policy "Employees can read jobs"
on public.jobs
for select
to authenticated
using ((select private.current_staff_role()) = 'employee');

create policy "Employees can read job steps"
on public.job_steps
for select
to authenticated
using ((select private.current_staff_role()) = 'employee');

-- Employees see a job's photos and videos, including the ones they just added.
create policy "Employees can read job media"
on public.job_media
for select
to authenticated
using ((select private.current_staff_role()) = 'employee');

-- Only the owner decides what goes in the public gallery.
create policy "Employees can add job media"
on public.job_media
for insert
to authenticated
with check (
  (select private.current_staff_role()) = 'employee'
  and not in_gallery
);

-- Public site. Gallery media and testimonials are for anonymous visitors only.
-- Signed-in users go through the staff policies above, so a login with no
-- staff_profiles row sees nothing and employees cannot read reviewer emails.
create policy "Anonymous visitors can read gallery media"
on public.job_media
for select
to anon
using (in_gallery);

create policy "Anonymous visitors can read published testimonials"
on public.testimonials
for select
to anon
using (status = 'approved' and can_publish);

create policy "Anyone can read active service cities"
on public.service_cities
for select
to anon, authenticated
using (is_active);

-- RLS limits rows, not columns. Anonymous visitors only get the columns the
-- public site shows, so reviewer emails and job ids stay private. Queries from
-- anon must name these columns instead of using select *.
revoke select on public.job_media from anon;
grant select (id, kind, stage, storage_path, duration_seconds, created_at)
  on public.job_media to anon;

revoke select on public.testimonials from anon;
grant select (id, name, city, service, rating, body, submitted_at)
  on public.testimonials to anon;
