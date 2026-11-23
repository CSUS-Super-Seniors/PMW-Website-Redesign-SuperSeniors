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
}

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

export function createStaffBackend(client: Pick<SupabaseClient, 'from' | 'auth'>): StaffBackend {
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
  };
}
