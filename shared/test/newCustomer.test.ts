import { describe, expect, it } from 'vitest';
import {
  isCalendarDate,
  mapNewCustomerErrors,
  newCustomerSchema,
  type NewCustomerInput,
} from '../src/newCustomer.js';

function valid(overrides: Partial<Record<keyof NewCustomerInput, unknown>> = {}) {
  return {
    first_name: 'Margaret',
    last_name: 'Lewis',
    email: 'margaret@example.com',
    phone: '(916) 555-0142',
    address: '4821 Fair Oaks Blvd',
    city: 'Carmichael',
    preferred_contact: 'email',
    text_ok: true,
    lead_source: 'referral',
    next_follow_up_date: '2026-12-01',
    ...overrides,
  };
}

function errorsFor(input: unknown) {
  const result = newCustomerSchema.safeParse(input);
  if (result.success) throw new Error('expected the input to be refused');
  return mapNewCustomerErrors(result.error);
}

describe('newCustomerSchema', () => {
  it('accepts a full customer and trims the text', () => {
    const result = newCustomerSchema.parse(
      valid({ first_name: '  Margaret ', city: ' Carmichael ' }),
    );

    expect(result).toEqual({
      first_name: 'Margaret',
      last_name: 'Lewis',
      email: 'margaret@example.com',
      phone: '(916) 555-0142',
      address: '4821 Fair Oaks Blvd',
      city: 'Carmichael',
      preferred_contact: 'email',
      text_ok: true,
      lead_source: 'referral',
      next_follow_up_date: '2026-12-01',
    });
  });

  it('accepts a name and phone only, and fills the rest with empty values', () => {
    const result = newCustomerSchema.parse({
      first_name: 'Ana',
      last_name: 'Ruiz',
      phone: '916-555-0100',
    });

    expect(result).toEqual({
      first_name: 'Ana',
      last_name: 'Ruiz',
      email: null,
      phone: '916-555-0100',
      address: null,
      city: null,
      preferred_contact: null,
      text_ok: false,
      lead_source: null,
      next_follow_up_date: null,
    });
  });

  it('treats blank form values as not filled in', () => {
    const result = newCustomerSchema.parse(
      valid({
        address: '   ',
        city: '',
        preferred_contact: '',
        lead_source: '',
        next_follow_up_date: '',
      }),
    );

    expect(result).toMatchObject({
      address: null,
      city: null,
      preferred_contact: null,
      lead_source: null,
      next_follow_up_date: null,
    });
  });

  it('requires first and last name', () => {
    expect(errorsFor(valid({ first_name: '  ', last_name: undefined })).fieldErrors).toMatchObject({
      first_name: 'First name is required.',
      last_name: 'Last name is required.',
    });
  });

  it('requires a phone number or an email address', () => {
    const { fieldErrors } = errorsFor(valid({ email: '', phone: '', preferred_contact: null }));

    expect(fieldErrors.email).toBe('Enter a phone number or an email address.');
    expect(fieldErrors.phone).toBe('Enter a phone number or an email address.');
  });

  it.each(['margaret', 'margaret@', '@example.com', 'a b@example.com'])(
    'refuses the email %s',
    (email) => {
      expect(errorsFor(valid({ email })).fieldErrors.email).toBe('Enter a valid email address.');
    },
  );

  it.each(['555-0142', '12345', '(916) 555-01422', '916-555-014a', '2 916 555 0142'])(
    'refuses the phone %s',
    (phone) => {
      expect(errorsFor(valid({ phone })).fieldErrors.phone).toBe(
        'Enter a 10-digit US phone number, optionally starting with 1.',
      );
    },
  );

  it.each(['(916) 555-0142', '916.555.0142', '9165550142', '+1 916-555-0142', '1 916 555 0142'])(
    'accepts the phone %s',
    (phone) => {
      expect(newCustomerSchema.safeParse(valid({ phone })).success).toBe(true);
    },
  );

  it('refuses a preferred contact or lead source that is not in the list', () => {
    const { fieldErrors } = errorsFor(valid({ preferred_contact: 'fax', lead_source: 'tv' }));

    expect(fieldErrors.preferred_contact).toBe('Select a preferred contact method from the list.');
    expect(fieldErrors.lead_source).toBe('Select how you heard about us from the list.');
  });

  it('needs the detail that matches the preferred contact', () => {
    expect(errorsFor(valid({ preferred_contact: 'email', email: '' })).fieldErrors.email).toBe(
      'Enter an email address to use email as the preferred contact.',
    );
    expect(errorsFor(valid({ preferred_contact: 'phone', phone: null })).fieldErrors.phone).toBe(
      'Enter a phone number to use calls or texts as the preferred contact.',
    );
    expect(
      errorsFor(valid({ preferred_contact: 'text', text_ok: false })).fieldErrors.text_ok,
    ).toBe('Check "OK to text" to use text messages as the preferred contact.');
  });

  it('refuses a follow-up date that is not a real date', () => {
    expect(errorsFor(valid({ next_follow_up_date: '2026-02-30' })).fieldErrors).toMatchObject({
      next_follow_up_date: 'Enter a real date.',
    });
    expect(errorsFor(valid({ next_follow_up_date: '12/01/2026' })).fieldErrors).toMatchObject({
      next_follow_up_date: 'Enter a real date.',
    });
  });

  it('refuses text that is too long', () => {
    const { fieldErrors } = errorsFor(
      valid({ first_name: 'a'.repeat(101), address: 'b'.repeat(301), city: 'c'.repeat(101) }),
    );

    expect(fieldErrors.first_name).toBe('First name must be 100 characters or fewer.');
    expect(fieldErrors.address).toBe('Address must be 300 characters or fewer.');
    expect(fieldErrors.city).toBe('City must be 100 characters or fewer.');
  });

  it('refuses wrong types', () => {
    const { fieldErrors } = errorsFor(valid({ first_name: 42, text_ok: 'yes' }));

    expect(fieldErrors.first_name).toBe('First name must be text.');
    expect(fieldErrors.text_ok).toBe('Text OK must be true or false.');
  });

  it('refuses fields it does not know, such as a Social Security number', () => {
    expect(errorsFor(valid({ ssn: '123-45-6789' } as never)).formErrors).toEqual([
      'Some form fields are not recognized. Please refresh the page and try again.',
    ]);
  });

  it('refuses a body that is not an object', () => {
    for (const body of [null, 'Margaret', [], 7]) {
      expect(errorsFor(body).formErrors).toEqual(['Please provide the customer as a JSON object.']);
    }
  });
});

describe('isCalendarDate', () => {
  it.each([
    ['2026-12-01', true],
    ['2028-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['1899-12-31', false],
    ['', false],
  ])('%s -> %s', (value, expected) => {
    expect(isCalendarDate(value)).toBe(expected);
  });
});
