import { describe, expect, it } from 'vitest';
import {
  estimateStep1Schema,
  issueOptions,
  mapEstimateStep1Errors,
  type EstimateStep1Input,
} from '../src/estimateStep1.js';

const validInput: EstimateStep1Input = {
  first_name: 'Zoë-Marie',
  last_name: "O'Connor 李",
  email: 'Zoe+repairs@example.com',
  phone: '(916) 555-0142',
  address: '123 Main St, Apt 2',
  item: 'Dining chair',
  issue_type: 'loose_joints',
  description: 'The back leg wobbles.',
};

function errorsFor(input: unknown) {
  const result = estimateStep1Schema.safeParse(input);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Expected validation to fail');
  return mapEstimateStep1Errors(result.error);
}

describe('Step 1 shared schema', () => {
  it('accepts Unicode names and email plus-addressing without changing submitted strings', () => {
    const submitted = {
      ...validInput,
      first_name: '  Zoë-Marie  ',
      last_name: '  李 明 D’Angelo  ',
      email: '  Zoe+repairs@Example.com  ',
      phone: '  +1 916 555 0142  ',
      address: '  123 Main St  ',
      city: '  Sacramento  ',
      item: '  Chair  ',
      description: '  A loose leg.  ',
      text_ok: true,
    };
    expect(estimateStep1Schema.parse(submitted)).toEqual(submitted);
  });

  it.each([
    '9165550142',
    '19165550142',
    '(916) 555-0142',
    '916-555-0142',
    '+1 916 555 0142',
    '1 (916) 555-0142',
    '+19165550142',
    '916.555.0142',
  ])('accepts US phone format %s', (phone) => {
    expect(estimateStep1Schema.safeParse({ ...validInput, phone }).success).toBe(true);
  });

  const requiredFields = [
    'first_name',
    'last_name',
    'email',
    'phone',
    'address',
    'item',
    'issue_type',
    'description',
  ] as const;

  describe.each(requiredFields)('%s is required', (field) => {
    it('rejects omission', () => {
      const submitted: Partial<EstimateStep1Input> = { ...validInput };
      delete submitted[field];
      expect(errorsFor(submitted).fieldErrors[field]).toEqual(expect.any(String));
    });

    it.each(['', ' ', '\t\n\u00a0'])('rejects blank value %j', (value) => {
      expect(errorsFor({ ...validInput, [field]: value }).fieldErrors[field]).toEqual(
        expect.any(String),
      );
    });

    it.each([null, 123, true, [], {}])('rejects incorrect JSON type %j', (value) => {
      expect(errorsFor({ ...validInput, [field]: value }).fieldErrors[field]).toEqual(
        expect.any(String),
      );
    });
  });

  it.each(['bad', 'a@', '@example.com', 'a@example', 'a b@example.com', 'a..b@example.com'])(
    'rejects invalid email %s',
    (email) => {
      expect(errorsFor({ ...validInput, email }).fieldErrors.email).toBe(
        'Enter a valid email address.',
      );
    },
  );

  it.each([
    '916-CALL-NOW',
    '916555014',
    '29165550142',
    '119165550142',
    '+44 916 555 0142',
    '9165550142 ext 1',
    '9165550142x1',
    '(916 555-0142',
    '916) 555-0142',
    '+9165550142',
    '++19165550142',
  ])('rejects invalid phone %s', (phone) => {
    expect(errorsFor({ ...validInput, phone }).fieldErrors.phone).toBe(
      'Enter a 10-digit US phone number, optionally starting with 1.',
    );
  });

  const textLimits = [
    ['first_name', 100],
    ['last_name', 100],
    ['address', 300],
    ['city', 100],
    ['item', 200],
    ['description', 1000],
  ] as const;

  it.each(textLimits)('enforces the %s length boundary of %i', (field, limit) => {
    expect(
      estimateStep1Schema.safeParse({ ...validInput, [field]: 'a'.repeat(limit) }).success,
    ).toBe(true);
    expect(
      errorsFor({ ...validInput, [field]: 'a'.repeat(limit + 1) }).fieldErrors[field],
    ).toContain(`${limit} characters or fewer`);
  });

  it('enforces the email length boundary of 254', () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
    expect(email).toHaveLength(254);
    expect(estimateStep1Schema.safeParse({ ...validInput, email }).success).toBe(true);
    expect(errorsFor({ ...validInput, email: `${email}d` }).fieldErrors.email).toBe(
      'Email must be 254 characters or fewer.',
    );
  });

  it('enforces the phone length boundary of 32 on the submitted string', () => {
    const phone = `${' '.repeat(22)}9165550142`;
    expect(phone).toHaveLength(32);
    expect(estimateStep1Schema.parse({ ...validInput, phone }).phone).toBe(phone);
    expect(errorsFor({ ...validInput, phone: ` ${phone}` }).fieldErrors.phone).toBe(
      'Phone number must be 32 characters or fewer.',
    );
  });

  it('defaults omitted text permission to false', () => {
    expect(estimateStep1Schema.parse(validInput).text_ok).toBe(false);
  });

  it.each([false, true])('accepts boolean text permission %s', (text_ok) => {
    expect(estimateStep1Schema.parse({ ...validInput, text_ok }).text_ok).toBe(text_ok);
  });

  it.each(['false', 'true', '', 0, 1, null, [], {}])(
    'rejects non-boolean text permission %j',
    (text_ok) => {
      expect(errorsFor({ ...validInput, text_ok }).fieldErrors.text_ok).toBe(
        'Text message permission must be true or false.',
      );
    },
  );

  it('allows city to be omitted without deriving it from the address', () => {
    const parsed = estimateStep1Schema.parse({ ...validInput, address: '123 Main St, Sacramento' });
    expect(parsed).not.toHaveProperty('city');
  });

  it.each(['', ' \t ', 'Sacramento'])('accepts optional city %j unchanged', (city) => {
    expect(estimateStep1Schema.parse({ ...validInput, city }).city).toBe(city);
  });

  it.each([null, 123, false, [], {}])('rejects incorrect city type %j', (city) => {
    expect(errorsFor({ ...validInput, city }).fieldErrors.city).toBe('City must be text.');
  });

  it.each(issueOptions)('accepts configured issue $value', ({ value }) => {
    expect(estimateStep1Schema.parse({ ...validInput, issue_type: value }).issue_type).toBe(value);
  });

  it.each(['unknown', 'Loose joints / wobbling', ' loose_joints '])(
    'rejects an issue outside the configuration: %s',
    (issue_type) => {
      expect(errorsFor({ ...validInput, issue_type }).fieldErrors.issue_type).toBe(
        'Select a problem from the list.',
      );
    },
  );

  it.each([undefined, null, [], 'text', '', 123, false])('rejects top-level body %j', (body) => {
    expect(errorsFor(body)).toEqual({
      fieldErrors: {},
      formErrors: ['Please provide the Step 1 form as a JSON object.'],
    });
  });

  it.each(['extra', 'preferred_contact', 'ssn', '__proto__'])(
    'rejects unknown field %s',
    (field) => {
      expect(errorsFor({ ...validInput, [field]: 'unexpected' })).toEqual({
        fieldErrors: {},
        formErrors: ['Some form fields are not recognized. Please refresh the page and try again.'],
      });
    },
  );

  it('maps multiple failures for one field to its first customer-facing message', () => {
    expect(errorsFor({ ...validInput, email: ' ', phone: ' ' })).toEqual({
      fieldErrors: { email: 'Email is required.', phone: 'Phone number is required.' },
      formErrors: [],
    });
  });

  it('keeps field errors and unknown-field form errors together', () => {
    expect(errorsFor({ ...validInput, description: '', unexpected: true })).toEqual({
      fieldErrors: { description: 'Description is required.' },
      formErrors: ['Some form fields are not recognized. Please refresh the page and try again.'],
    });
  });
});
