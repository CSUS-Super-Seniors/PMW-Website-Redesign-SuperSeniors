import { afterEach, describe, expect, it, vi } from 'vitest';
import { customerListQuery, fetchCustomers, type CustomerListParams } from './customers';

afterEach(() => {
  vi.unstubAllGlobals();
});

const margaret = {
  id: 'c-lewis',
  firstName: 'Margaret',
  lastName: 'Lewis',
  phone: '(916) 555-0142',
  city: 'Carmichael',
  email: 'margaret.lewis@email.com',
  jobCount: 3,
  lastJobDate: '2026-09-24',
  isRepeat: true,
};

const noFilters: CustomerListParams = {
  page: 1,
  pageSize: 10,
  search: '',
  status: '',
  from: '',
  to: '',
};

function fakeServer(status: number, body: unknown) {
  const fakeFetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fakeFetch);
  return fakeFetch;
}

describe('customerListQuery', () => {
  it('leaves out empty filters', () => {
    expect(customerListQuery(noFilters)).toBe('page=1&pageSize=10');
  });

  it('sends every filter, with the search trimmed and encoded', () => {
    expect(
      customerListQuery({
        page: 2,
        pageSize: 25,
        search: ' (916) 555 ',
        status: 'repeat',
        from: '2026-01-01',
        to: '2026-09-30',
      }),
    ).toBe('page=2&pageSize=25&search=%28916%29+555&status=repeat&from=2026-01-01&to=2026-09-30');
  });
});

describe('fetchCustomers', () => {
  it('sends the bearer token and returns the page', async () => {
    const fakeFetch = fakeServer(200, { customers: [margaret], total: 1, page: 1, pageSize: 10 });
    const result = await fetchCustomers('token-123', noFilters);
    expect(result).toEqual({
      status: 'ok',
      customers: [margaret],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    expect(fakeFetch).toHaveBeenCalledWith('/api/customers?page=1&pageSize=10', {
      headers: { Authorization: 'Bearer token-123' },
      signal: undefined,
    });
  });

  it.each([
    [401, 'unauthenticated'],
    [403, 'no-access'],
    [400, 'error'],
    [503, 'error'],
  ])('maps HTTP %i to %s', async (status, expected) => {
    fakeServer(status, { error: 'x' });
    expect(await fetchCustomers('token-123', noFilters)).toEqual({ status: expected });
  });

  it.each([
    ['a row with a missing field', { customers: [{ ...margaret, isRepeat: undefined }] }],
    ['a negative job count', { customers: [{ ...margaret, jobCount: -1 }] }],
    ['a total that is not a number', { total: '1' }],
  ])('treats %s as an error', async (_name, change) => {
    fakeServer(200, { customers: [margaret], total: 1, page: 1, pageSize: 10, ...change });
    expect(await fetchCustomers('token-123', noFilters)).toEqual({ status: 'error' });
  });

  it('treats a network failure as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await fetchCustomers('token-123', noFilters)).toEqual({ status: 'error' });
  });
});
