import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeStaffRole, fetchStaffAccounts, removeStaffAccount } from './staff';

afterEach(() => {
  vi.unstubAllGlobals();
});

const todd = {
  id: 'user-1',
  fullName: 'Todd Peterson',
  email: 'todd@example.com',
  role: 'owner',
  lastLoginAt: '2026-11-06T18:30:00.000Z',
  status: 'active',
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

describe('fetchStaffAccounts', () => {
  it('returns the staff list and sends the bearer token', async () => {
    const fakeFetch = fakeServer(200, { staff: [todd] });

    const result = await fetchStaffAccounts('token-123');

    expect(result).toEqual({ status: 'ok', staff: [todd] });
    expect(fakeFetch).toHaveBeenCalledWith('/api/staff', {
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  describe('staff account mutations', () => {
    it('sends a role change to the staff API', async () => {
      const fakeFetch = fakeServer(200, { staff: { id: 'user-2', role: 'owner' } });

      expect(await changeStaffRole('token-123', 'user-2', 'owner')).toEqual({ status: 'ok' });
      expect(fakeFetch).toHaveBeenCalledWith('/api/staff/user-2', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'owner' }),
      });
    });

    it('sends a removal request and validates the confirmation response', async () => {
      const fakeFetch = fakeServer(200, { removed: true, revokedSessions: 2 });

      expect(await removeStaffAccount('token-123', 'user-2')).toEqual({ status: 'ok' });
      expect(fakeFetch).toHaveBeenCalledWith('/api/staff/user-2', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer token-123' },
      });
    });

    it.each([
      [401, {}, { status: 'unauthenticated' }],
      [403, {}, { status: 'no-access' }],
      [404, {}, { status: 'not-found' }],
      [
        409,
        { error: 'The last active owner cannot be removed.' },
        { status: 'conflict', message: 'The last active owner cannot be removed.' },
      ],
      [500, {}, { status: 'error' }],
    ] as const)('maps HTTP %s to a visible mutation result', async (status, body, expected) => {
      fakeServer(status, body);
      expect(await removeStaffAccount('token-123', 'user-2')).toEqual(expected);
    });

    it('returns an error when the network is down or the success response is invalid', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      expect(await removeStaffAccount('token-123', 'user-2')).toEqual({ status: 'error' });

      fakeServer(200, { removed: true });
      expect(await removeStaffAccount('token-123', 'user-2')).toEqual({ status: 'error' });
    });
  });

  it('accepts a missing email and a missing last login', async () => {
    const sam = { ...todd, id: 'user-2', email: null, lastLoginAt: null, role: 'employee' };
    fakeServer(200, { staff: [sam] });

    expect(await fetchStaffAccounts('token-123')).toEqual({ status: 'ok', staff: [sam] });
  });

  it('returns unauthenticated when the server says 401', async () => {
    fakeServer(401, {});
    expect(await fetchStaffAccounts('token-123')).toEqual({ status: 'unauthenticated' });
  });

  it('returns no-access when the server says 403', async () => {
    fakeServer(403, {});
    expect(await fetchStaffAccounts('token-123')).toEqual({ status: 'no-access' });
  });

  it('returns error when the server fails', async () => {
    fakeServer(503, { error: 'Staff list is temporarily unavailable.' });
    expect(await fetchStaffAccounts('token-123')).toEqual({ status: 'error' });
  });

  it('returns error when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await fetchStaffAccounts('token-123')).toEqual({ status: 'error' });
  });

  it.each([
    ['no staff field', {}],
    ['staff is not a list', { staff: 'nope' }],
    ['a row is missing a field', { staff: [{ ...todd, fullName: undefined }] }],
    ['a row has an unknown role', { staff: [{ ...todd, role: 'admin' }] }],
    ['a row has an unknown status', { staff: [{ ...todd, status: 'invited' }] }],
    ['the body is not an object', null],
  ])('returns error for a malformed response (%s)', async (_name, body) => {
    fakeServer(200, body);
    expect(await fetchStaffAccounts('token-123')).toEqual({ status: 'error' });
  });
});
