import {
  estimateStep1Schema,
  type EstimateStep1Data,
  type EstimateStep1ValidationResponse,
} from '@pmw/validation';

/** Public, same-origin API; this endpoint validates without saving an inquiry. */
export async function validateEstimateStep1(
  details: EstimateStep1Data,
  signal: AbortSignal,
): Promise<EstimateStep1ValidationResponse> {
  const response = await fetch('/api/estimates/validate-step-1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
    signal,
  });
  const result: EstimateStep1ValidationResponse = await response.json();

  if (response.ok && result.valid === true) return result;
  if (
    response.status === 400 &&
    result.valid === false &&
    result.fieldErrors &&
    typeof result.fieldErrors === 'object' &&
    !Array.isArray(result.fieldErrors) &&
    Object.keys(result.fieldErrors).every((field) =>
      Object.hasOwn(estimateStep1Schema.shape, field),
    ) &&
    Object.values(result.fieldErrors).every((message) => typeof message === 'string') &&
    Array.isArray(result.formErrors) &&
    result.formErrors.every((message) => typeof message === 'string') &&
    (Object.keys(result.fieldErrors).length > 0 || result.formErrors.length > 0)
  ) {
    return result;
  }

  throw new Error('Unexpected Step 1 validation response');
}
