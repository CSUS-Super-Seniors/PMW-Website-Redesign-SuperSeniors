import type { EstimateStep1Data } from '@pmw/validation';

/** SSPMW-24 supplies this check. Unavailable never means approved. */
export async function checkEstimateServiceArea(details: EstimateStep1Data): Promise<boolean> {
  const response = await fetch('/api/estimates/service-area', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  });
  const result = await response.json();
  if (!response.ok || typeof result.inServiceArea !== 'boolean')
    throw new Error('Service-area checking is unavailable.');
  return result.inServiceArea;
}
