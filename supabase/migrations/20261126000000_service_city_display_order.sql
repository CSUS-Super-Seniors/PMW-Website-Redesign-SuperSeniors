-- SSPMW-234/240: presentation metadata only. Preserve all existing city data and
-- eligibility; the provisional Figma ordering belongs in the development seed.
alter table public.service_cities
  add column display_order integer,
  add constraint service_cities_display_order_check
    check (display_order is null or display_order >= 0);
