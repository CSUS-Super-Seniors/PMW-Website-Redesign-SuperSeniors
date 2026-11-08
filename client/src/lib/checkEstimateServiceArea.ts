import type { ServiceAreaCheckResponse } from '@pmw/validation';

export type CheckServiceArea = (city: string, signal: AbortSignal) => Promise<boolean>;

/**
 * Asks the server whether a city is in the service area. Any failure throws, so an
 * unavailable check never lets the customer continue.
 */
export const checkEstimateServiceArea: CheckServiceArea = async (city, signal) => {
  const response = await fetch('/api/estimates/service-area', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city }),
    signal,
  });
  const result: Partial<ServiceAreaCheckResponse> = await response.json();
  if (!response.ok || typeof result.inServiceArea !== 'boolean') {
    throw new Error('Service-area checking is unavailable.');
  }
  return result.inServiceArea;
};
