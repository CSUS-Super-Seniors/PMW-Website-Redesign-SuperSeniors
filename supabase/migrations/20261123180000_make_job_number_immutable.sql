alter table public.jobs
  add constraint jobs_job_number_format_check
  check (job_number ~ '^J-[0-9]+$');

create function public.prevent_job_number_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.job_number is distinct from old.job_number then
    raise exception 'Job number cannot be changed after assignment.'
      using errcode = 'check_violation', constraint = 'jobs_job_number_immutable';
  end if;

  return new;
end;
$$;

create trigger jobs_job_number_immutable
before update of job_number on public.jobs
for each row
execute function public.prevent_job_number_change();
