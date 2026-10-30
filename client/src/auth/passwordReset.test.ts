import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import {
  handleRecoveryEvent,
  isValidEmail,
  readResetLink,
  recoveryFlag,
  requestPasswordReset,
  updatePassword,
  userIdFromAccessToken,
} from './passwordReset';
import { fakeAccessToken } from './testTokens';

const auth = {
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
};

vi.mock('./supabaseClient', () => ({ getSupabase: () => ({ auth }) }));

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function apiError(status: number, code: string) {
  return new AuthApiError('Request failed', status, code);
}

describe('isValidEmail', () => {
  it('accepts a full email address', () => {
    expect(isValidEmail('girlie@example.com')).toBe(true);
  });

  it.each(['girlie@example', 'girlie.example.com', 'girlie @example.com', ''])(
    'rejects %j',
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );
});

describe('requestPasswordReset', () => {
  it('asks Supabase for a reset email that comes back to the Reset password page', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await expect(requestPasswordReset('girlie@example.com')).resolves.toBe('success');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('girlie@example.com', {
      redirectTo: `${window.location.origin}/staff/reset-password`,
    });
  });

  it('shows the link sent state when a link was just sent to that account', async () => {
    // Only existing accounts hit this limit, so an error here would reveal who is on staff.
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: apiError(429, 'over_email_send_rate_limit'),
    });

    await expect(requestPasswordReset('girlie@example.com')).resolves.toBe('success');
  });

  it('reports the general request rate limit', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: apiError(429, 'over_request_rate_limit'),
    });

    await expect(requestPasswordReset('girlie@example.com')).resolves.toBe('rate-limited');
  });

  it.each([
    [new AuthRetryableFetchError('Failed to fetch', 0), 'unreachable'],
    [new AuthRetryableFetchError('Service unavailable', 503), 'unreachable'],
    // auth-js turns a 500 (for example the email could not be sent) into a retryable error.
    [new AuthRetryableFetchError('Error sending recovery email', 500), 'failed'],
    [apiError(400, 'validation_failed'), 'failed'],
  ] as const)('maps %s to %s', async (error, expected) => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: null, error });

    await expect(requestPasswordReset('girlie@example.com')).resolves.toBe(expected);
  });

  it('reports unreachable when the call throws', async () => {
    auth.resetPasswordForEmail.mockRejectedValue(new Error('offline'));

    await expect(requestPasswordReset('girlie@example.com')).resolves.toBe('unreachable');
  });
});

describe('updatePassword', () => {
  it('saves the new password', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });

    await expect(updatePassword('new-password-123')).resolves.toBe('success');
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password-123' });
  });

  it.each([
    [apiError(422, 'same_password'), 'same-password'],
    [apiError(422, 'weak_password'), 'weak-password'],
    [new AuthSessionMissingError(), 'expired'],
    [apiError(401, 'session_not_found'), 'expired'],
    [apiError(403, 'session_expired'), 'expired'],
    [new AuthRetryableFetchError('Failed to fetch', 0), 'unreachable'],
    [new AuthRetryableFetchError('Internal server error', 500), 'failed'],
    [apiError(400, 'unexpected_failure'), 'failed'],
  ] as const)('maps %s to %s', async (error, expected) => {
    auth.updateUser.mockResolvedValue({ data: { user: null }, error });

    await expect(updatePassword('new-password-123')).resolves.toBe(expected);
  });

  it('reports unreachable when the call throws', async () => {
    auth.updateUser.mockRejectedValue(new Error('offline'));

    await expect(updatePassword('new-password-123')).resolves.toBe('unreachable');
  });
});

describe('userIdFromAccessToken', () => {
  it('reads the user id from a token', () => {
    expect(userIdFromAccessToken(fakeAccessToken('user-123'))).toBe('user-123');
  });

  it.each(['', 'not-a-token', 'a.!!!.c', `a.${btoa('{"role":"x"}')}.c`])(
    'returns null for %j',
    (token) => {
      expect(userIdFromAccessToken(token)).toBeNull();
    },
  );
});

describe('readResetLink', () => {
  const page = 'http://localhost:5173/staff/reset-password';
  const token = fakeAccessToken('user-123');

  it('finds a recovery link and the account it was sent to', () => {
    expect(readResetLink(`${page}#access_token=${token}&refresh_token=def&type=recovery`)).toEqual({
      kind: 'recovery',
      userId: 'user-123',
    });
  });

  it('finds an expired link in the hash', () => {
    expect(
      readResetLink(
        `${page}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
      ),
    ).toEqual({ kind: 'error' });
  });

  it('finds an expired link in the query', () => {
    expect(readResetLink(`${page}?error=access_denied&error_code=otp_expired`)).toEqual({
      kind: 'error',
    });
  });

  it('ignores a recovery link without a readable token', () => {
    expect(readResetLink(`${page}#access_token=abc&type=recovery`)).toEqual({ kind: 'none' });
  });

  it('treats a sign-in link that is not a recovery link as none', () => {
    expect(readResetLink(`${page}#access_token=${token}&type=magiclink`)).toEqual({
      kind: 'none',
    });
  });

  it('returns none for a plain visit', () => {
    expect(readResetLink(page)).toEqual({ kind: 'none' });
  });
});

describe('recoveryFlag', () => {
  it('remembers the account for the tab and can be cleared', () => {
    expect(recoveryFlag.get()).toBeNull();
    recoveryFlag.set('user-123');
    expect(recoveryFlag.get()).toBe('user-123');
    recoveryFlag.clear();
    expect(recoveryFlag.get()).toBeNull();
  });

  it('keeps working when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => recoveryFlag.set('user-123')).not.toThrow();
    expect(recoveryFlag.get()).toBeNull();
    expect(() => recoveryFlag.clear()).not.toThrow();
  });
});

describe('handleRecoveryEvent', () => {
  const session = { user: { id: 'girlie' } } as unknown as Session;

  it('remembers the account and opens the reset page when a link lands elsewhere', () => {
    const location = { pathname: '/', replace: vi.fn() };

    handleRecoveryEvent('PASSWORD_RECOVERY', session, location);

    expect(recoveryFlag.get()).toBe('girlie');
    expect(location.replace).toHaveBeenCalledWith('/staff/reset-password');
  });

  it('stays put when the link already opened the reset page', () => {
    const location = { pathname: '/staff/reset-password', replace: vi.fn() };

    handleRecoveryEvent('PASSWORD_RECOVERY', session, location);

    expect(recoveryFlag.get()).toBe('girlie');
    expect(location.replace).not.toHaveBeenCalled();
  });

  it('forgets the reset link when the person signs out', () => {
    recoveryFlag.set('girlie');

    handleRecoveryEvent('SIGNED_OUT', null, { pathname: '/', replace: vi.fn() });

    expect(recoveryFlag.get()).toBeNull();
  });

  it('ignores every other auth event', () => {
    const location = { pathname: '/', replace: vi.fn() };

    handleRecoveryEvent('SIGNED_IN', session, location);

    expect(recoveryFlag.get()).toBeNull();
    expect(location.replace).not.toHaveBeenCalled();
  });
});
