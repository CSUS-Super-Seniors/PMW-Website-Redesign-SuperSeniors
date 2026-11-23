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
