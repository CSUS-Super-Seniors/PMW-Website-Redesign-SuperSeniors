import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Config } from './config.js';

export interface StaffProfile {
  role: string;
  status: string;
}

export interface AuthBackend {
  verifyToken(token: string): Promise<{ id: string } | null>;
  loadProfile(userId: string): Promise<StaffProfile | null>;
}

export function createSupabaseAdmin(config: Config): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function createAuthBackend(
  config: Config,
  client: SupabaseClient = createSupabaseAdmin(config),
): AuthBackend {
  return {
    async verifyToken(token) {
      const { data, error } = await client.auth.getUser(token);

      if (error) {
        if (error.status && error.status < 500) return null;
        throw new Error('Authentication service unavailable');
      }

      return data.user ? { id: data.user.id } : null;
    },

    async loadProfile(userId) {
      const { data, error } = await client
        .from('staff_profiles')
        .select('role,status')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw new Error('Staff profile lookup failed');

      return data;
    },
  };
}
