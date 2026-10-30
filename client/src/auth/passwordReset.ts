import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  type AuthChangeEvent,
  type AuthError,
  type Session,
} from '@supabase/supabase-js';
import { routes } from '../config/site';
import { getSupabase } from './supabaseClient';

export type ResetRequestResult = 'success' | 'rate-limited' | 'unreachable' | 'failed';
export type UpdatePasswordResult =
  'success' | 'same-password' | 'weak-password' | 'expired' | 'unreachable' | 'failed';

/**
 * What the link that opened the Reset password page says. A recovery link
 * carries the id of the person it was sent to, so the page can check that the
 * signed-in session really came from that link.
 */
export type ResetLink = { kind: 'recovery'; userId: string } | { kind: 'error' } | { kind: 'none' };

/** Staff passwords need at least this many characters. Keep in sync with supabase/config.toml. */
export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

/**
 * auth-js reports a network failure as status 0, and 500-504 and 520-530 as
 * retryable errors too. Only treat the network and gateway cases as "could not
 * reach"; a 500 or 501 is the server failing, so the page says it failed.
 */
function isUnreachable(error: AuthError): boolean {
  return isAuthRetryableFetchError(error) && error.status !== 500 && error.status !== 501;
}

/**
 * Asks Supabase Auth to email a reset link (sent through Resend, SSPMW-354).
 * Supabase answers an unknown email with success, so the page shows the same
 * link sent state either way. A 500 (the email could not be sent) still shows
 * an error: it only happens for real accounts, but hiding an email outage would
 * leave staff waiting for a link that never comes.
 */
export async function requestPasswordReset(email: string): Promise<ResetRequestResult> {
  try {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${routes.staffResetPassword}`,
    });
    if (!error) return 'success';
    if (isUnreachable(error)) return 'unreachable';
    // Supabase only checks this limit after finding the account (a link was just
    // sent, or the project's hourly email limit is used up), so an error here
    // would reveal who is on staff. Show the link sent state instead.
    if (error.code === 'over_email_send_rate_limit') return 'success';
    if (error.status === 429) return 'rate-limited';
    return 'failed';
  } catch {
    return 'unreachable';
  }
}

/** Saves a new password for the person signed in by the reset link. */
export async function updatePassword(password: string): Promise<UpdatePasswordResult> {
  try {
    const { error } = await getSupabase().auth.updateUser({ password });
    if (!error) return 'success';
    if (isUnreachable(error)) return 'unreachable';
    if (error.code === 'same_password') return 'same-password';
    if (error.code === 'weak_password') return 'weak-password';
    // No session, or the reset session ran out: the person needs a new link.
    if (isAuthSessionMissingError(error)) return 'expired';
    if (isAuthApiError(error) && (error.status === 401 || error.status === 403)) return 'expired';
    return 'failed';
  } catch {
    return 'unreachable';
  }
}

/** Reads the user id (`sub`) from a Supabase access token without checking it. */
export function userIdFromAccessToken(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const sub: unknown = JSON.parse(json).sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

/**
 * Reads the reset link from the address bar. Supabase sends people back with
 * `#access_token=...&type=recovery` on success, or `error_code=otp_expired` (in
 * the hash or the query) when the link is expired or already used. This relies
 * on the implicit flow pinned in supabaseClient.ts.
 *
 * Read it on the first render: Supabase clears the hash once it has signed the
 * person in.
 */
export function readResetLink(href: string): ResetLink {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const query = url.searchParams;
  const hasError = ['error', 'error_code', 'error_description'].some(
    (key) => hash.has(key) || query.has(key),
  );
  if (hasError) return { kind: 'error' };
  if (hash.get('type') !== 'recovery') return { kind: 'none' };
  const userId = userIdFromAccessToken(hash.get('access_token') ?? '');
  return userId ? { kind: 'recovery', userId } : { kind: 'none' };
}

const RECOVERY_KEY = 'pmw-password-recovery';

/**
 * Remembers, for this tab only, which account arrived from a reset link, so
 * reloading the Reset password page keeps the form instead of the expired state.
 * The page only trusts it when the signed-in session belongs to the same account.
 */
export const recoveryFlag = {
  set(userId: string) {
    try {
      window.sessionStorage.setItem(RECOVERY_KEY, userId);
    } catch {
      // Storage can be blocked (private mode). The form still works until a reload.
    }
  },
  get(): string | null {
    try {
      return window.sessionStorage.getItem(RECOVERY_KEY);
    } catch {
      return null;
    }
  },
  clear() {
    try {
      window.sessionStorage.removeItem(RECOVERY_KEY);
    } catch {
      // Nothing to clear if storage is blocked.
    }
  },
};

/**
 * Called for every Supabase auth event. When a reset link signs someone in,
 * remember the account and make sure they are on the Reset password page. The
 * link can land elsewhere, for example when a hosted project's Redirect URLs do
 * not list the reset page and Supabase falls back to the Site URL.
 */
export function handleRecoveryEvent(
  event: AuthChangeEvent,
  session: Session | null,
  location: Pick<Location, 'pathname' | 'replace'> = window.location,
) {
  if (event === 'SIGNED_OUT') {
    recoveryFlag.clear();
    return;
  }
  if (event !== 'PASSWORD_RECOVERY' || !session) return;
  recoveryFlag.set(session.user.id);
  if (location.pathname !== routes.staffResetPassword) location.replace(routes.staffResetPassword);
}
