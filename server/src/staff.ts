import type { SupabaseClient, User } from '@supabase/supabase-js';

export interface StaffListItem {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  lastLoginAt: string | null;
  status: string;
}

export interface StaffBackend {
  listStaff(): Promise<StaffListItem[]>;
  changeRole(
    actorId: string,
    staffId: string,
    role: 'owner' | 'employee',
  ): Promise<StaffMutationResult>;
  removeStaff(actorId: string, staffId: string): Promise<StaffMutationResult>;
}

export type StaffMutationResult =
  | { outcome: 'updated'; role: 'owner' | 'employee' }
  | { outcome: 'removed'; revokedSessions: number }
  | { outcome: 'not_found' | 'forbidden' | 'self_lockout' | 'last_owner' | 'invalid' };

const AUTH_PAGE_SIZE = 1000;

// Supabase returns auth users one page at a time; follow nextPage until it runs out.
async function loadAuthUsers(client: Pick<SupabaseClient, 'auth'>): Promise<User[]> {
  const users: User[] = [];
  let page: number | null = 1;
  while (page !== null) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
    if (error || !data) throw new Error('Staff email lookup failed');
    users.push(...data.users);
    page = data.nextPage;
  }
  return users;
}

export function createStaffBackend(
  client: Pick<SupabaseClient, 'from' | 'auth' | 'rpc'>,
): StaffBackend {
  async function mutateStaff(
    actorId: string,
    staffId: string,
    role: 'owner' | 'employee' | null,
    remove: boolean,
  ): Promise<StaffMutationResult> {
    const result = await client.rpc('manage_staff_profile', {
      p_actor_id: actorId,
      p_target_id: staffId,
      p_new_role: role,
      p_remove: remove,
    });
    if (result.error) throw new Error('Staff account change failed');

    const data: unknown = result.data;
    if (!data || typeof data !== 'object' || !('outcome' in data)) {
      throw new Error('Staff account change returned an invalid response');
    }

    if (
      data.outcome === 'updated' &&
      'role' in data &&
      (data.role === 'owner' || data.role === 'employee')
    ) {
      return { outcome: 'updated', role: data.role };
    }
    if (
      data.outcome === 'removed' &&
      'revoked_sessions' in data &&
      typeof data.revoked_sessions === 'number' &&
      Number.isInteger(data.revoked_sessions) &&
      data.revoked_sessions >= 0
    ) {
      return { outcome: 'removed', revokedSessions: data.revoked_sessions };
    }
    if (
      data.outcome === 'not_found' ||
      data.outcome === 'forbidden' ||
      data.outcome === 'self_lockout' ||
      data.outcome === 'last_owner' ||
      data.outcome === 'invalid'
    ) {
      return { outcome: data.outcome };
    }
    throw new Error('Staff account change returned an invalid response');
  }

  return {
    async listStaff() {
      const { data: profiles, error } = await client
        .from('staff_profiles')
        .select('id,full_name,role,status')
        .order('full_name');
      if (error || !profiles) throw new Error('Staff list lookup failed');

      // Email and last login live in Supabase Auth (auth.users), not in staff_profiles.
      const authUsers = new Map((await loadAuthUsers(client)).map((user) => [user.id, user]));

      return profiles.map((profile) => {
        const authUser = authUsers.get(profile.id);
        return {
          id: profile.id,
          fullName: profile.full_name,
          email: authUser?.email ?? null,
          lastLoginAt: authUser?.last_sign_in_at ?? null,
          role: profile.role,
          status: profile.status,
        };
      });
    },
    changeRole(actorId, staffId, role) {
      return mutateStaff(actorId, staffId, role, false);
    },
    removeStaff(actorId, staffId) {
      return mutateStaff(actorId, staffId, null, true);
    },
  };
}
