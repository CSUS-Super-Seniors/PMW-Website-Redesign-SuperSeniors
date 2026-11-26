import type { SupabaseClient } from '@supabase/supabase-js';
import { STAFF_SET_PASSWORD_PATH, type StaffInviteData } from '@pmw/validation';
import type { StaffListItem } from './staff.js';

export type StaffInviteResult =
  /**
   * `resent` means the person was already invited and has not set a password yet.
   * Supabase emailed them a new link; their existing profile (and role) is kept.
   */
  | { outcome: 'invited'; staff: StaffListItem; resent: boolean }
  /** Supabase already has an account for this email (staff or not). */
  | { outcome: 'already-exists' }
  /** Supabase Auth's hourly email limit is used up, so no invite was sent. */
  | { outcome: 'rate-limited' };

/** Postgres unique_violation: a staff_profiles row with this id already exists. */
const UNIQUE_VIOLATION = '23505';

export interface StaffInviteBackend {
  inviteStaff(invite: StaffInviteData): Promise<StaffInviteResult>;
}

/**
 * Where the invite link sends the person. Built only from server configuration
 * (OWNER_PORTAL_ORIGIN), never from request headers. Without a usable origin the
 * link goes to the Supabase Site URL, and the client forwards it to Set password.
 */
export function setPasswordUrl(origin: string | undefined): string | undefined {
  if (!origin) return undefined;
  try {
    const url = new URL(origin);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.origin !== origin) return undefined;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return undefined;
    return `${url.origin}${STAFF_SET_PASSWORD_PATH}`;
  } catch {
    return undefined;
  }
}

/**
 * Invites a new staff member (SSPMW-271, E6). Supabase Auth creates the account and
 * emails the set-password link (through Resend SMTP, SSPMW-354), then the
 * staff_profiles row gives the account its role. This runs with the service role
 * key, so it must only be reached through the owner-only route.
 */
export function createStaffInviteBackend(
  client: Pick<SupabaseClient, 'from' | 'auth'>,
  { ownerPortalOrigin }: { ownerPortalOrigin?: string } = {},
): StaffInviteBackend {
  const redirectTo = setPasswordUrl(ownerPortalOrigin);
  return {
    async inviteStaff({ fullName, email, role }) {
      const { data, error } = await client.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { full_name: fullName },
      });
      if (error) {
        if (error.code === 'email_exists' || error.code === 'user_already_exists') {
          return { outcome: 'already-exists' };
        }
        if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
          return { outcome: 'rate-limited' };
        }
        throw new Error('Staff invite failed');
      }
      const user = data.user;
      if (!user) throw new Error('Staff invite failed');

      const { error: profileError } = await client
        .from('staff_profiles')
        .insert({ id: user.id, full_name: fullName, role, status: 'active' });
      if (profileError?.code === UNIQUE_VIOLATION) {
        // Supabase answers a second invite to someone who has not set a password yet
        // by emailing them a new link for the same account, so this person already
        // has a profile. Keep it as it is, and never delete their account.
        const { data: existing, error: readError } = await client
          .from('staff_profiles')
          .select('full_name,role,status')
          .eq('id', user.id)
          .single();
        if (readError || !existing) throw new Error('Staff profile lookup failed');
        return {
          outcome: 'invited',
          resent: true,
          staff: {
            id: user.id,
            fullName: existing.full_name,
            email: user.email ?? email,
            role: existing.role,
            lastLoginAt: null,
            status: existing.status,
          },
        };
      }
      if (profileError) {
        // Without a profile the account has no role and could never use the portal.
        // Remove it so the emailed link stops working and the owner can try again.
        const { error: deleteError } = await client.auth.admin.deleteUser(user.id);
        if (deleteError) {
          console.error('Could not remove an invited account after its profile failed', {
            userId: user.id,
          });
        }
        throw new Error('Staff profile could not be created');
      }

      return {
        outcome: 'invited',
        resent: false,
        staff: {
          id: user.id,
          fullName,
          email: user.email ?? email,
          role,
          lastLoginAt: null,
          status: 'active',
        },
      };
    },
  };
}
