import type { RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OUTSIDE_SERVICE_AREA_MESSAGE, cityField, isCityInServiceArea } from '@pmw/validation';

export interface ServiceAreaBackend {
  /** Rejects when the city list can't be read. Unavailable never means approved. */
  isInServiceArea(city: string): Promise<boolean>;
}

/**
 * Reads the active cities on every check, so adding or turning off a city in
 * `service_cities` changes the result with no code change or redeploy.
 */
export function createServiceAreaBackend(client: Pick<SupabaseClient, 'from'>): ServiceAreaBackend {
  return {
    async isInServiceArea(city) {
      const { data, error } = await client
        .from('service_cities')
        .select('name')
        .eq('is_active', true);
      if (error || !Array.isArray(data)) throw new Error('Service cities could not be loaded.');
      const names = data
        .map((row: { name?: unknown }) => row.name)
        .filter((name): name is string => typeof name === 'string');
      return isCityInServiceArea(city, names);
    },
  };
}

export const SERVICE_AREA_UNAVAILABLE_MESSAGE =
  'We could not check your service area right now. Please try again or call us.';

/**
 * Guard for the estimate submit route (SSPMW-70). Mount it after the JSON body is
 * parsed and validated. An outside-area city is refused with 422 even when the
 * browser check was skipped. On success `res.locals.inServiceArea` is `true`, which
 * the route stores on the inquiry's `in_service_area` column.
 */
export function requireServiceArea(backend: ServiceAreaBackend | undefined): RequestHandler {
  return async (req, res, next) => {
    const city = cityField.safeParse((req.body as { city?: unknown } | undefined)?.city);
    if (!city.success) {
      res.status(400).json({ error: city.error.issues[0]?.message ?? 'City is required.' });
      return;
    }
    if (!backend) {
      res.status(503).json({ error: SERVICE_AREA_UNAVAILABLE_MESSAGE });
      return;
    }
    let inServiceArea: boolean;
    try {
      inServiceArea = await backend.isInServiceArea(city.data);
    } catch {
      res.status(503).json({ error: SERVICE_AREA_UNAVAILABLE_MESSAGE });
      return;
    }
    if (!inServiceArea) {
      res.status(422).json({ error: OUTSIDE_SERVICE_AREA_MESSAGE, code: 'outside_service_area' });
      return;
    }
    res.locals.inServiceArea = true;
    next();
  };
}
