import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NewCustomerData } from '@pmw/validation';
import { createCustomer } from './createCustomer';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const customer: NewCustomerData = {
  first_name: 'Ana',
  last_name: 'Ruiz',
  email: null,
  phone: '916-555-0100',
  address: null,
  city: 'Fair Oaks',
  preferred_contact: null,
  text_ok: false,
  lead_source: 'yelp',
  next_follow_up_date: null,
};

describe('createCustomer', () => {
  it('posts the customer as JSON with the access token and returns the saved customer', async () => {
    const saved = { id: 'customer-1', firstName: 'Ana', lastName: 'Ruiz' };
    const fetchMock = stubFetch(201, { customer: saved });

    const result = await createCustomer('token-123', customer);

    expect(result).toEqual({ status: 'ok', customer: saved });
    expect(fetchMock).toHaveBeenCalledWith('/api/customers', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-123', 'Content-Type': 'application/json' },
      body: JSON.stringify(customer),
    });
  });

  it('returns the field and form errors from a 400', async () => {
    stubFetch(400, {
      error: 'Please check the customer details.',
      fieldErrors: { phone: 'Enter a 10-digit US phone number.', bogus: 3 },
      formErrors: ['Something else', 7],
    });

    expect(await createCustomer('token-123', customer)).toEqual({
      status: 'invalid',
      fieldErrors: { phone: 'Enter a 10-digit US phone number.' },
      formErrors: ['Something else'],
    });
  });

  it('returns the duplicate field and message from a 409', async () => {
    stubFetch(409, { error: 'A customer with this phone number already exists.', field: 'phone' });

    expect(await createCustomer('token-123', customer)).toEqual({
      status: 'duplicate',
      field: 'phone',
      message: 'A customer with this phone number already exists.',
    });
  });

  it.each([
    [401, 'unauthenticated'],
    [403, 'no-access'],
    [409, 'error'],
    [500, 'error'],
    [503, 'error'],
  ])('maps a %i response to %s', async (code, status) => {
    stubFetch(code);
    expect(await createCustomer('token-123', customer)).toEqual({ status });
  });

  it('treats a 201 without a customer as an error', async () => {
    stubFetch(201, { customer: { id: 'customer-1' } });
    expect(await createCustomer('token-123', customer)).toEqual({ status: 'error' });
  });

  it('treats a response that is not JSON as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    );
    expect(await createCustomer('token-123', customer)).toEqual({ status: 'error' });
  });

  it('treats a network failure as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await createCustomer('token-123', customer)).toEqual({ status: 'error' });
  });
});
