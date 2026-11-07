import type { SupabaseClient } from '@supabase/supabase-js';

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

export function createStaffBackend(client: Pick<SupabaseClient, 'from' | 'auth'>): StaffBackend {
  return {
    async listStaff() {
      const { data: profiles, error } = await client
        .from('staff_profiles')
        .select('id,full_name,role,status,last_login_at')
        .order('full_name');
      if (error || !profiles) throw new Error('Staff list lookup failed');

      // Email is not in staff_profiles; it lives in Supabase Auth (auth.users).
      const { data: authData, error: authError } = await client.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (authError || !authData) throw new Error('Staff email lookup failed');

      const emails = new Map(authData.users.map((user) => [user.id, user.email ?? null]));

      return profiles.map((profile) => ({
        id: profile.id,
        fullName: profile.full_name,
        email: emails.get(profile.id) ?? null,
        role: profile.role,
        lastLoginAt: profile.last_login_at,
        status: profile.status,
      }));
    },
  };
}
