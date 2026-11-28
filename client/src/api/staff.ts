import type { StaffRole } from '../auth/fetchStaffProfile';

export type StaffStatus = 'active' | 'inactive';

export interface StaffAccount {
  id: string;
  fullName: string;
  email: string | null;
  role: StaffRole;
  lastLoginAt: string | null;
  status: StaffStatus;
}

export type StaffListResult =
  | { status: 'ok'; staff: StaffAccount[] }
  | { status: 'unauthenticated' }
  | { status: 'no-access' }
  | { status: 'error' };

export type StaffMutationResult =
  | { status: 'ok' }
  | { status: 'unauthenticated' }
  | { status: 'no-access' }
  | { status: 'not-found' }
  | { status: 'conflict'; message?: string }
  | { status: 'error' };

function isStaffAccount(value: unknown): value is StaffAccount {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.fullName === 'string' &&
    (row.email === null || typeof row.email === 'string') &&
    (row.role === 'owner' || row.role === 'employee') &&
    (row.lastLoginAt === null || typeof row.lastLoginAt === 'string') &&
    (row.status === 'active' || row.status === 'inactive')
  );
}

export async function fetchStaffAccounts(accessToken: string): Promise<StaffListResult> {
  try {
    const response = await fetch('/api/staff', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'no-access' };
    if (!response.ok) return { status: 'error' };
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return { status: 'error' };
    const staff = (body as { staff?: unknown }).staff;
    if (!Array.isArray(staff) || !staff.every(isStaffAccount)) return { status: 'error' };
    return { status: 'ok', staff };
  } catch {
    return { status: 'error' };
  }
}

async function mutateStaffAccount(
  accessToken: string,
  staffId: string,
  method: 'PATCH' | 'DELETE',
  role?: StaffAccount['role'],
): Promise<StaffMutationResult> {
  try {
    const response = await fetch(`/api/staff/${encodeURIComponent(staffId)}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(method === 'PATCH' && { 'Content-Type': 'application/json' }),
      },
      ...(method === 'PATCH' && { body: JSON.stringify({ role }) }),
    });

    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'no-access' };
    if (response.status === 404) return { status: 'not-found' };

    if (response.status === 409) {
      let message: string | undefined;
      try {
        const body: unknown = await response.json();
        if (typeof body === 'object' && body !== null && 'error' in body) {
          message = typeof body.error === 'string' ? body.error : undefined;
        }
      } catch {
        // The status still conveys the conflict if the response has no JSON body.
      }
      return { status: 'conflict', ...(message && { message }) };
    }

    if (!response.ok) return { status: 'error' };

    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return { status: 'error' };

    if (method === 'PATCH') {
      const staff = 'staff' in body ? body.staff : undefined;
      if (
        typeof staff === 'object' &&
        staff !== null &&
        'id' in staff &&
        staff.id === staffId &&
        'role' in staff &&
        staff.role === role
      ) {
        return { status: 'ok' };
      }
      return { status: 'error' };
    }

    if (
      'removed' in body &&
      body.removed === true &&
      'revokedSessions' in body &&
      typeof body.revokedSessions === 'number' &&
      Number.isInteger(body.revokedSessions) &&
      body.revokedSessions >= 0
    ) {
      return { status: 'ok' };
    }
    return { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

export function changeStaffRole(
  accessToken: string,
  staffId: string,
  role: StaffAccount['role'],
): Promise<StaffMutationResult> {
  return mutateStaffAccount(accessToken, staffId, 'PATCH', role);
}

export function removeStaffAccount(
  accessToken: string,
  staffId: string,
): Promise<StaffMutationResult> {
  return mutateStaffAccount(accessToken, staffId, 'DELETE');
}
