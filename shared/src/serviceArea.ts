import { z } from 'zod';

/** Shown on Step 1 and returned by the server when a city is not in `service_cities`. */
export const OUTSIDE_SERVICE_AREA_MESSAGE =
  'Sorry, this address is outside our service area, so we can’t take an online request for it.';

export const CITY_MAX_LENGTH = 100;

/** The city rule Step 1 and the service-area check share. */
export const cityField = z
  .string({
    error: (issue) => (issue.input === undefined ? 'City is required.' : 'City must be text.'),
  })
  .refine((value) => value.trim().length > 0, { error: 'City is required.' })
  .max(CITY_MAX_LENGTH, { error: `City must be ${CITY_MAX_LENGTH} characters or fewer.` });

export const serviceAreaCheckSchema = z.strictObject(
  { city: cityField },
  { error: 'Please provide the city as a JSON object.' },
);

export type ServiceAreaCheckInput = z.input<typeof serviceAreaCheckSchema>;

export interface ServiceAreaCheckResponse {
  inServiceArea: boolean;
}

/**
 * Compares cities the way a customer types them: capitalization, extra spaces and a
 * trailing state ("Carmichael, CA") do not matter.
 */
export function normalizeCityName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/,?\s+(ca|california)\.?$/i, '')
    .replace(/,$/, '')
    .trim()
    .toLowerCase();
}

export function isCityInServiceArea(city: string, serviceCities: readonly string[]): boolean {
  const wanted = normalizeCityName(city);
  if (!wanted) return false;
  return serviceCities.some((name) => normalizeCityName(name) === wanted);
}
