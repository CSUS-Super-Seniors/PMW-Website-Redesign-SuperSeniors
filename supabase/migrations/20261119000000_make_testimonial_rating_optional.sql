-- C8 does not collect ratings; L5 may add one later. Validate ratings when present.
alter table public.testimonials alter column rating drop not null;