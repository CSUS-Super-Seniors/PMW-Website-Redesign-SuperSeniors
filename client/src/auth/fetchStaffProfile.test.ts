import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStaffProfile } from './fetchStaffProfile';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchStaffProfile', () => {
  it('returns the role when the server answers ok', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ role: 'owner' }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    const result = await fetchStaffProfile('token-123');

    expect(result).toEqual({ status: 'ok', role: 'owner' });
    expect(fakeFetch).toHaveBeenCalledWith('/api/me', {
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('returns no-access when the server says 403', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fakeFetch);
    const result = await fetchStaffProfile('token-123');
    expect(result).toEqual({ status: 'no-access' });
  });

  it('returns unreachable when the server fails', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fakeFetch);
    const result = await fetchStaffProfile('token-123');
    expect(result).toEqual({ status: 'unreachable' });
  });

  it('returns no-access for an unknown role', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ role: 'admin' }),
    });
    vi.stubGlobal('fetch', fakeFetch);
    const result = await fetchStaffProfile('token-123');
    expect(result).toEqual({ status: 'no-access' });
  });

  it('returns unreachable when the network is down', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fakeFetch);
    const result = await fetchStaffProfile('token-123');
    expect(result).toEqual({ status: 'unreachable' });
  });
});
