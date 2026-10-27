export type StaffRole = 'owner' | 'employee';

export type StaffProfileResult =
  { status: 'ok'; role: StaffRole } | { status: 'no-access' } | { status: 'unreachable' };

export async function fetchStaffProfile(accessToken: string): Promise<StaffProfileResult> {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401 || response.status === 403) return { status: 'no-access' };
    if (!response.ok) return { status: 'unreachable' };
    const body = await response.json();
    if (body.role === 'owner' || body.role === 'employee') return { status: 'ok', role: body.role };
  } catch {
    return { status: 'unreachable' };
  }

  return { status: 'no-access' };
}
