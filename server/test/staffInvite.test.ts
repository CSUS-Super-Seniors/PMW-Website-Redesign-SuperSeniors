import { afterEach, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffInviteData } from '@pmw/validation';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { AuthBackend } from '../src/supabase.js';
import {
  createStaffInviteBackend,
  setPasswordUrl,
  type StaffInviteBackend,
  type StaffInviteResult,
} from '../src/staffInvite.js';

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});

function auth(role: string, status = 'active'): AuthBackend {
  return {
    verifyToken: async (token) => (token === 'valid' ? { id: 'owner-1' } : null),
    loadProfile: async () => ({ role, status }),
  };
}

const valid = { fullName: 'Sam Rivera', email: 'Sam@Example.com', role: 'employee' };

const invitedSam = {
  id: 'user-sam',
  fullName: 'Sam Rivera',
  email: 'sam@example.com',
  role: 'employee',
  lastLoginAt: null,
  status: 'active',
};

function inviteBackend(
  result: StaffInviteResult | Error = { outcome: 'invited', staff: invitedSam, resent: false },
) {
  const calls: StaffInviteData[] = [];
  const staffInvite: StaffInviteBackend = {
    inviteStaff: async (invite) => {
      calls.push(invite);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { staffInvite, calls };
}

function post(role: string, backend: StaffInviteBackend | undefined, body: unknown) {
  return request(createApp(config, auth(role), undefined, { staffInvite: backend }))
    .post('/api/staff/invite')
    .set('Authorization', 'Bearer valid')
    .send(body as object);
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('an owner invites a valid person and gets the new list row back', async () => {
  const { staffInvite, calls } = inviteBackend();
  const response = await post('owner', staffInvite, valid).expect(201);
  assert.deepEqual(response.body, { staff: invitedSam, resent: false });
  assert.equal(response.headers['cache-control'], 'no-store');
  // The server checks and cleans the body itself before inviting.
  assert.deepEqual(calls, [{ fullName: 'Sam Rivera', email: 'sam@example.com', role: 'employee' }]);
});

test('a resent invite is reported to the owner', async () => {
  const { staffInvite } = inviteBackend({ outcome: 'invited', staff: invitedSam, resent: true });
  const response = await post('owner', staffInvite, valid).expect(201);
  assert.deepEqual(response.body, { staff: invitedSam, resent: true });
});

test('an employee calling the invite route is refused and nothing is sent', async () => {
  const { staffInvite, calls } = inviteBackend();
  const response = await post('employee', staffInvite, valid).expect(403);
  assert.deepEqual(response.body, { error: 'Insufficient permissions' });
  assert.equal(calls.length, 0);
});

test('inactive staff and missing tokens are refused before inviting', async () => {
  const { staffInvite, calls } = inviteBackend();
  await request(createApp(config, auth('owner', 'inactive'), undefined, { staffInvite }))
    .post('/api/staff/invite')
    .set('Authorization', 'Bearer valid')
    .send(valid)
    .expect(403);
  await request(createApp(config, auth('owner'), undefined, { staffInvite }))
    .post('/api/staff/invite')
    .send(valid)
    .expect(401);
  assert.equal(calls.length, 0);
});

test.each([
  [
    'missing fields',
    { fullName: '', email: '', role: '' },
    { fullName: 'Enter a name.', email: 'Enter an email address.', role: 'Choose a role.' },
  ],
  [
    'an invalid email',
    { ...valid, email: 'sam@example' },
    { email: 'Enter a valid email address, like name@example.com.' },
  ],
  ['an unknown role', { ...valid, role: 'admin' }, { role: 'Choose a role.' }],
])('%s get 400 with field errors and no invite', async (_name, body, fieldErrors) => {
  const { staffInvite, calls } = inviteBackend();
  const response = await post('owner', staffInvite, body).expect(400);
  assert.deepEqual(response.body.fieldErrors, fieldErrors);
  assert.equal(calls.length, 0);
});

test('extra fields such as a status or id are refused', async () => {
  const { staffInvite, calls } = inviteBackend();
  const response = await post('owner', staffInvite, { ...valid, id: 'someone-else' }).expect(400);
  assert.equal(response.body.formErrors.length, 1);
  assert.equal(calls.length, 0);
});

test('an email that already has an account gets 409 on the email field', async () => {
  const { staffInvite } = inviteBackend({ outcome: 'already-exists' });
  const response = await post('owner', staffInvite, valid).expect(409);
  assert.deepEqual(response.body.fieldErrors, {
    email: 'An account with this email already exists.',
  });
});

test('a used up email limit gets 429', async () => {
  const { staffInvite } = inviteBackend({ outcome: 'rate-limited' });
  await post('owner', staffInvite, valid).expect(429);
});

test('a failed invite gets 503 and logs no personal details', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { staffInvite } = inviteBackend(new Error('Staff invite failed'));
  const response = await post('owner', staffInvite, valid).expect(503);
  assert.deepEqual(response.body, { error: 'The invite could not be sent. Please try again.' });
  assert.ok(!JSON.stringify(log.mock.calls).includes('sam@example.com'));
  assert.ok(!JSON.stringify(log.mock.calls).includes('Sam Rivera'));
});

test('a missing invite backend answers 503', async () => {
  await post('owner', undefined, valid).expect(503);
});

// --- Backend: the calls it makes to Supabase ---

type AdminError = { code?: string; status?: number; message: string } | null;

function fakeSupabase({
  inviteError = null as AdminError,
  insertError = null as { code?: string; message: string } | null,
  deleteError = null as { message: string } | null,
  existing = null as { full_name: string; role: string; status: string } | null,
} = {}) {
  const invites: { email: string; options: unknown }[] = [];
  const inserts: unknown[] = [];
  const deletes: string[] = [];
  const client = {
    auth: {
      admin: {
        inviteUserByEmail: async (email: string, options: unknown) => {
          invites.push({ email, options });
          if (inviteError) return { data: { user: null }, error: inviteError };
          return { data: { user: { id: 'user-sam', email } }, error: null };
        },
        deleteUser: async (id: string) => {
          deletes.push(id);
          return { data: {}, error: deleteError };
        },
      },
    },
    from: (table: string) => {
      assert.equal(table, 'staff_profiles');
      return {
        insert: async (row: unknown) => {
          inserts.push(row);
          return { error: insertError };
        },
        select: () => ({
          eq: (column: string, id: string) => {
            assert.equal(column, 'id');
            assert.equal(id, 'user-sam');
            return {
              single: async () =>
                existing
                  ? { data: existing, error: null }
                  : { data: null, error: { message: 'not found' } },
            };
          },
        }),
      };
    },
  } as unknown as Pick<SupabaseClient, 'from' | 'auth'>;
  return { client, invites, inserts, deletes };
}

const sam: StaffInviteData = { fullName: 'Sam Rivera', email: 'sam@example.com', role: 'employee' };

test('the backend invites through the Admin API and adds an active profile with the role', async () => {
  const fake = fakeSupabase();
  const backend = createStaffInviteBackend(fake.client, {
    ownerPortalOrigin: 'https://pmw.example',
  });
  assert.deepEqual(await backend.inviteStaff(sam), {
    outcome: 'invited',
    resent: false,
    staff: invitedSam,
  });
  assert.deepEqual(fake.invites, [
    {
      email: 'sam@example.com',
      options: {
        redirectTo: 'https://pmw.example/staff/set-password',
        data: { full_name: 'Sam Rivera' },
      },
    },
  ]);
  assert.deepEqual(fake.inserts, [
    { id: 'user-sam', full_name: 'Sam Rivera', role: 'employee', status: 'active' },
  ]);
});

test('the backend reports an existing account without adding a profile', async () => {
  const fake = fakeSupabase({
    inviteError: { code: 'email_exists', status: 422, message: 'exists' },
  });
  assert.deepEqual(await createStaffInviteBackend(fake.client).inviteStaff(sam), {
    outcome: 'already-exists',
  });
  assert.equal(fake.inserts.length, 0);
});

test('the backend reports the email limit without adding a profile', async () => {
  const fake = fakeSupabase({
    inviteError: { code: 'over_email_send_rate_limit', status: 429, message: 'limit' },
  });
  assert.deepEqual(await createStaffInviteBackend(fake.client).inviteStaff(sam), {
    outcome: 'rate-limited',
  });
  assert.equal(fake.inserts.length, 0);
});

test('the backend throws when Supabase cannot send the invite', async () => {
  const fake = fakeSupabase({ inviteError: { status: 500, message: 'smtp down' } });
  await assert.rejects(createStaffInviteBackend(fake.client).inviteStaff(sam), /invite failed/);
  assert.equal(fake.inserts.length, 0);
});

test('a failed profile insert removes the new account so its link stops working', async () => {
  const fake = fakeSupabase({ insertError: { message: 'permission denied' } });
  await assert.rejects(createStaffInviteBackend(fake.client).inviteStaff(sam), /profile/);
  assert.deepEqual(fake.deletes, ['user-sam']);
});

test('a second invite to someone still pending keeps their account and profile', async () => {
  // Supabase emails a new link to an invited person who has not set a password,
  // and returns the same account, so the profile insert hits the existing row.
  const fake = fakeSupabase({
    insertError: { code: '23505', message: 'duplicate key' },
    existing: { full_name: 'Sam Rivera', role: 'employee', status: 'active' },
  });
  const result = await createStaffInviteBackend(fake.client).inviteStaff({
    ...sam,
    fullName: 'Samuel',
    role: 'owner',
  });
  assert.deepEqual(result, { outcome: 'invited', resent: true, staff: invitedSam });
  assert.deepEqual(fake.deletes, [], 'The pending account must never be deleted.');
});

test('a pending invite whose profile cannot be read fails without deleting the account', async () => {
  const fake = fakeSupabase({ insertError: { code: '23505', message: 'duplicate key' } });
  await assert.rejects(createStaffInviteBackend(fake.client).inviteStaff(sam), /lookup/);
  assert.deepEqual(fake.deletes, []);
});

test('set-password links use only a safe configured origin', () => {
  assert.equal(setPasswordUrl('https://pmw.example'), 'https://pmw.example/staff/set-password');
  assert.equal(setPasswordUrl('http://localhost:5173'), 'http://localhost:5173/staff/set-password');
  for (const origin of [undefined, '', 'http://pmw.example', 'https://pmw.example/', 'nonsense']) {
    assert.equal(setPasswordUrl(origin), undefined, String(origin));
  }
});
