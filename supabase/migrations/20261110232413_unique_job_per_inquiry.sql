-- One job per inquiry. Accepting an estimate request creates a job, and two owners pressing
-- Accept at the same moment must not create two. Jobs without an inquiry are not limited.
create unique index jobs_inquiry_id_key on public.jobs (inquiry_id) where inquiry_id is not null;