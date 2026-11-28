import type { StaffInviteData, StaffInviteFieldErrors } from '@pmw/validation';
import { isStaffAccount, type StaffAccount } from './staff';

export type StaffInviteResult =
  /** `resent`: they were already invited and not signed up yet, so the link was sent again. */
  | { status: 'ok'; staff: StaffAccount; resent: boolean }
  /** The server refused a field (400), or the email already has an account (409). */
  | { status: 'invalid'; fieldErrors: StaffInviteFieldErrors }
  | { status: 'rate-limited' }
  | { status: 'unauthenticated' }
  | { status: 'no-access' }
  | { status: 'error' };

const FIELDS = ['fullName', 'email', 'role'] as const;

function readFieldErrors(body: unknown): StaffInviteFieldErrors {
  const raw =
    body && typeof body === 'object' ? (body as { fieldErrors?: unknown }).fieldErrors : null;
  const fieldErrors: StaffInviteFieldErrors = {};
  if (!raw || typeof raw !== 'object') return fieldErrors;
  for (const field of FIELDS) {
    const message = (raw as Record<string, unknown>)[field];
    if (typeof message === 'string') fieldErrors[field] = message;
  }
  return fieldErrors;
}

/** Asks the server to invite a new staff member (SSPMW-271). */
export async function inviteStaff(
  accessToken: string,
  invite: StaffInviteData,
): Promise<StaffInviteResult> {
  try {
    const response = await fetch('/api/staff/invite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(invite),
    });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'no-access' };
    if (response.status === 429) return { status: 'rate-limited' };
    if (response.status === 400 || response.status === 409) {
      const fieldErrors = readFieldErrors(await response.json().catch(() => null));
      return Object.keys(fieldErrors).length > 0
        ? { status: 'invalid', fieldErrors }
        : { status: 'error' };
    }
    if (!response.ok) return { status: 'error' };
    const body: unknown = await response.json();
    const { staff, resent } =
      body && typeof body === 'object' ? (body as { staff?: unknown; resent?: unknown }) : {};
    return isStaffAccount(staff)
      ? { status: 'ok', staff, resent: resent === true }
      : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}
