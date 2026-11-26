import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJobs } from './jobs';

afterEach(() => {
  vi.unstubAllGlobals();
});

const entryBench = {
  id: 'job-1',
  jobNumber: 'J-1001',
  customerName: 'Margaret Lewis',
  item: 'Entry bench',
  jobType: 'Repair',
  status: 'in_progress',
  startDate: '2026-10-01',
  dueDate: null,
};

const page = { jobs: [entryBench], total: 1, page: 1, pageSize: 10 };
const query = { page: 1, pageSize: 10, status: null, search: '' } as const;

function fakeServer(status: number, body: unknown) {
  const fakeFetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fakeFetch);
  return fakeFetch;
}

describe('fetchJobs', () => {
  it('sends the paging only when no filter is set, with the bearer token', async () => {
    const fakeFetch = fakeServer(200, page);

    expect(await fetchJobs('token-123', query)).toEqual({ status: 'ok', ...page });
    expect(fakeFetch).toHaveBeenCalledWith('/api/jobs?page=1&pageSize=10', {
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('adds the status and the search, encoded', async () => {
    const fakeFetch = fakeServer(200, { ...page, page: 2, pageSize: 5 });

    await fetchJobs('t', { page: 2, pageSize: 5, status: 'completed', search: 'a&b c' });

    expect(fakeFetch.mock.calls[0]![0]).toBe(
      '/api/jobs?page=2&pageSize=5&status=completed&q=a%26b+c',
    );
  });

  it('maps 401, 403 and other failures', async () => {
    fakeServer(401, {});
    expect(await fetchJobs('t', query)).toEqual({ status: 'unauthenticated' });
    fakeServer(403, {});
    expect(await fetchJobs('t', query)).toEqual({ status: 'no-access' });
    fakeServer(503, {});
    expect(await fetchJobs('t', query)).toEqual({ status: 'error' });
  });

  it('treats an unexpected body as an error', async () => {
    fakeServer(200, { ...page, jobs: [{ ...entryBench, status: 'planning' }] });
    expect(await fetchJobs('t', query)).toEqual({ status: 'error' });
    fakeServer(200, { ...page, total: -1 });
    expect(await fetchJobs('t', query)).toEqual({ status: 'error' });
  });

  it('treats a network failure as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchJobs('t', query)).toEqual({ status: 'error' });
  });
});
