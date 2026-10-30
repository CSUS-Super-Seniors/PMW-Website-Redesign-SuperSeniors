import { expect, it } from 'vitest';
import {
  estimateStep1Schema,
  issueOptions,
  mapEstimateStep1Errors,
  type EstimateStep1Input,
} from '@pmw/validation';

it('can consume the shared Step 1 schema, dropdown options and field errors in the browser', () => {
  const input: EstimateStep1Input = {
    first_name: 'Ana',
    last_name: 'García',
    email: 'ana+chair@example.com',
    phone: '(916) 555-0142',
    address: '123 Main St',
    item: 'Chair',
    issue_type: issueOptions[0].value,
    description: 'One leg is loose.',
  };
  expect(estimateStep1Schema.parse(input).text_ok).toBe(false);
  expect(issueOptions[0].label).toBe('Loose joints / wobbling');

  const invalid = estimateStep1Schema.safeParse({ ...input, issue_type: '' });
  expect(invalid.success).toBe(false);
  if (invalid.success) throw new Error('Expected the placeholder to fail validation');
  expect(mapEstimateStep1Errors(invalid.error)).toEqual({
    fieldErrors: { issue_type: 'Select a problem from the list.' },
    formErrors: [],
  });
});
