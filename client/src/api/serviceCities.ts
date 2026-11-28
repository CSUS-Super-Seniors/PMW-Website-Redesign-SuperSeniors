import { serviceCitiesResponseSchema, type ServiceCity } from '@pmw/validation';

export type FetchServiceCities = (signal: AbortSignal) => Promise<ServiceCity[]>;

/** No persisted cache or sample fallback: each mount/retry reads the current list. */
export const fetchServiceCities: FetchServiceCities = async (signal) => {
  const response = await fetch('/api/service-cities', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Service cities are unavailable.');
  return serviceCitiesResponseSchema.parse(await response.json()).cities;
};
