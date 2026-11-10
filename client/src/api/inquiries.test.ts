import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptInquiry } from './inquiries';

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

describe('acceptInquiry', () => {
  it('posts to the accept route with the access token and returns the job', async () => {
    const fetchMock = stubFetch(200, { job: { id: 'job-1', jobNumber: 'J-1001' } });

    const result = await acceptInquiry('token-123', 'inq-1');

    expect(result).toEqual({ status: 'ok', job: { id: 'job-1', jobNumber: 'J-1001' } });
    expect(fetchMock).toHaveBeenCalledWith('/api/inquiries/inq-1/accept', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it.each([
    [401, 'unauthenticated'],
    [403, 'no-access'],
    [404, 'not-found'],
    [409, 'not-acceptable'],
    [503, 'error'],
  ])('maps a %i response to %s', async (code, status) => {
    stubFetch(code);
    expect(await acceptInquiry('token-123', 'inq-1')).toEqual({ status });
  });

  it('treats a success response without a job as an error', async () => {
    stubFetch(200, { job: { id: 'job-1' } });
    expect(await acceptInquiry('token-123', 'inq-1')).toEqual({ status: 'error' });
  });

  it('treats a network failure as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await acceptInquiry('token-123', 'inq-1')).toEqual({ status: 'error' });
  });

  it('encodes the inquiry id in the URL', async () => {
    const fetchMock = stubFetch(404);
    await acceptInquiry('token-123', 'a/b');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/inquiries/a%2Fb/accept');
  });
});
