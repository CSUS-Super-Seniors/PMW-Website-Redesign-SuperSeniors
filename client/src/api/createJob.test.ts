import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJob, fetchCustomerOptions } from './createJob';

function respond(status: number, body: unknown = {}) {
  const fakeFetch = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fakeFetch);
  return fakeFetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const customers = [{ id: 'c1', name: 'Margaret Lewis', city: 'Carmichael' }];

describe('fetchCustomerOptions', () => {
  it('asks with the bearer token and returns the customers', async () => {
    const fakeFetch = respond(200, { customers });
    expect(await fetchCustomerOptions('token-123')).toEqual({ status: 'ok', customers });
    expect(fakeFetch).toHaveBeenCalledWith('/api/job-customers', {
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it.each([
    [401, 'unauthenticated'],
    [403, 'no-access'],
    [503, 'error'],
  ])('maps HTTP %i to %s', async (code, status) => {
    respond(code);
    expect(await fetchCustomerOptions('token-123')).toEqual({ status });
  });

  it.each([
    ['no list', {}],
    ['a customer with no name', { customers: [{ id: 'c1', city: null }] }],
    ['a city that is not text', { customers: [{ id: 'c1', name: 'A B', city: 5 }] }],
  ])('treats %s as an error', async (_label, body) => {
    respond(200, body);
    expect(await fetchCustomerOptions('token-123')).toEqual({ status: 'error' });
  });

  it('reports an error when the request cannot be made', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect(await fetchCustomerOptions('token-123')).toEqual({ status: 'error' });
  });
});

describe('createJob', () => {
  const input = { customer_id: 'c1', item: 'Dining chairs', start_date: '2026-10-12' };

  it('sends the form as JSON with the bearer token and returns the new job', async () => {
    const fakeFetch = respond(201, { job: { id: 'job-1', jobNumber: 'J-1013' } });

    expect(await createJob('token-123', input)).toEqual({
      status: 'ok',
      job: { id: 'job-1', jobNumber: 'J-1013' },
    });
    const [url, init] = fakeFetch.mock.calls[0];
    expect(url).toBe('/api/jobs');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer token-123',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it('returns the field messages when the server refuses the form', async () => {
    respond(400, {
      error: 'Please check the job form.',
      fieldErrors: { item: 'Item is required.', start_date: 5 },
      formErrors: ['Some job fields are not recognized.', 7],
    });
    expect(await createJob('token-123', input)).toEqual({
      status: 'invalid',
      fieldErrors: { item: 'Item is required.' },
      formErrors: ['Some job fields are not recognized.'],
    });
  });

  it('returns the other job when there is a time conflict', async () => {
    const conflict = {
      jobNumber: 'J-1002',
      customerName: 'Robert Chen',
      item: 'Oak dining table',
      date: '2026-10-12',
    };
    respond(409, { error: 'Time conflict with another job.', conflict });
    expect(await createJob('token-123', input)).toEqual({ status: 'conflict', conflict });
  });

  it('treats a conflict without the other job as an error', async () => {
    respond(409, { error: 'Time conflict with another job.' });
    expect(await createJob('token-123', input)).toEqual({ status: 'error' });
  });

  it.each([
    [401, 'unauthenticated'],
    [403, 'no-access'],
    [503, 'error'],
  ])('maps HTTP %i to %s', async (code, status) => {
    respond(code);
    expect(await createJob('token-123', input)).toEqual({ status });
  });

  it('treats a created answer without a job number as an error', async () => {
    respond(201, { job: { id: 'job-1' } });
    expect(await createJob('token-123', input)).toEqual({ status: 'error' });
  });

  it('reports an error when the request cannot be made', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect(await createJob('token-123', input)).toEqual({ status: 'error' });
  });
});
