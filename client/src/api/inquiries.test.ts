import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchInquiries } from './inquiries';

afterEach(() => {
  vi.unstubAllGlobals();
});

const margaret = {
  id: 'inquiry-1',
  inquiryNumber: 'INQ-1048',
  customerName: 'Margaret Lewis',
  item: 'Dining chair',
  city: 'Carmichael',
  status: 'new',
  submittedAt: '2026-10-01T17:18:00+00:00',
};

const page = { inquiries: [margaret], total: 1, page: 1, pageSize: 10 };

function fakeServer(status: number, body: unknown) {
  const fakeFetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fakeFetch);
  return fakeFetch;
}

describe('fetchInquiries', () => {
  it('asks for the page and page size and sends the bearer token', async () => {
    const fakeFetch = fakeServer(200, { ...page, page: 2, pageSize: 5 });

    const result = await fetchInquiries('token-123', { page: 2, pageSize: 5 });

    expect(result).toEqual({ status: 'ok', ...page, page: 2, pageSize: 5 });
    expect(fakeFetch).toHaveBeenCalledWith('/api/inquiries?page=2&pageSize=5', {
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('accepts a missing city and every status', async () => {
    const rows = ['new', 'contacted', 'converted', 'closed'].map((status, index) => ({
      ...margaret,
      id: `inquiry-${index}`,
      city: index === 0 ? null : margaret.city,
      status,
    }));
    fakeServer(200, { ...page, inquiries: rows, total: 4 });

    expect(await fetchInquiries('token-123', { page: 1, pageSize: 10 })).toEqual({
      status: 'ok',
      ...page,
      inquiries: rows,
      total: 4,
    });
  });

  it('returns an empty page', async () => {
    fakeServer(200, { ...page, inquiries: [], total: 0 });
    expect(await fetchInquiries('token-123', { page: 1, pageSize: 10 })).toEqual({
      status: 'ok',
      ...page,
      inquiries: [],
      total: 0,
    });
  });

  it('returns unauthenticated when the server says 401', async () => {
    fakeServer(401, {});
    expect(await fetchInquiries('t', { page: 1, pageSize: 10 })).toEqual({
      status: 'unauthenticated',
    });
  });

  it('returns no-access when the server refuses an employee with 403', async () => {
    fakeServer(403, { error: 'Insufficient permissions' });
    expect(await fetchInquiries('t', { page: 1, pageSize: 10 })).toEqual({ status: 'no-access' });
  });

  it.each([400, 500, 503])('returns error when the server says %i', async (status) => {
    fakeServer(status, { error: 'Estimate requests are temporarily unavailable.' });
    expect(await fetchInquiries('t', { page: 1, pageSize: 10 })).toEqual({ status: 'error' });
  });

  it('returns error when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await fetchInquiries('t', { page: 1, pageSize: 10 })).toEqual({ status: 'error' });
  });

  it.each([
    ['the body is not an object', null],
    ['no inquiries field', { total: 1, page: 1, pageSize: 10 }],
    ['inquiries is not a list', { ...page, inquiries: 'nope' }],
    ['a row is missing the item', { ...page, inquiries: [{ ...margaret, item: undefined }] }],
    ['a row has an unknown status', { ...page, inquiries: [{ ...margaret, status: 'archived' }] }],
    ['total is missing', { ...page, total: undefined }],
    ['total is negative', { ...page, total: -1 }],
    ['page is zero', { ...page, page: 0 }],
    ['pageSize is a string', { ...page, pageSize: '10' }],
  ])('returns error for a malformed response (%s)', async (_name, body) => {
    fakeServer(200, body);
    expect(await fetchInquiries('t', { page: 1, pageSize: 10 })).toEqual({ status: 'error' });
  });
});
