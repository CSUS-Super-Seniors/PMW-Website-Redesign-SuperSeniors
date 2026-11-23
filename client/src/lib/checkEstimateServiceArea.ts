import { SERVICE_AREA_RATE_LIMIT_MESSAGE, type ServiceAreaCheckResponse } from '@pmw/validation';

export type CheckServiceArea = (city: string, signal: AbortSignal) => Promise<boolean>;

/** Thrown when the visitor has checked too many times; its message is safe to show. */
export class ServiceAreaRateLimitedError extends Error {
  constructor() {
    super(SERVICE_AREA_RATE_LIMIT_MESSAGE);
    this.name = 'ServiceAreaRateLimitedError';
  }
}

/**
 * Asks the server whether a city is in the service area. Any failure throws, so an
 * unavailable check never lets the customer continue. Too many checks (429) throw
 * ServiceAreaRateLimitedError, so the form can ask the customer to wait.
 */
export const checkEstimateServiceArea: CheckServiceArea = async (city, signal) => {
  const response = await fetch('/api/estimates/service-area', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city }),
    signal,
  });
  if (response.status === 429) throw new ServiceAreaRateLimitedError();
  const result: Partial<ServiceAreaCheckResponse> = await response.json();
  if (!response.ok || typeof result.inServiceArea !== 'boolean') {
    throw new Error('Service-area checking is unavailable.');
  }
  return result.inServiceArea;
};
