import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createStaffBackend } from '../src/staff.js';

type StaffClient = Pick<SupabaseClient, 'from' | 'auth'>;

interface Profile {
  id: string;
  full_name: string;
  role: string;
  status: string;
}

interface AuthUser {
  id: string;
  email?: string;
  last_sign_in_at?: string;
}

// A stand-in for the Supabase client. It answers the two calls createStaffBackend makes.
function fakeClient(options: {
  profiles?: Profile[];
  profileError?: boolean;
  authPages?: AuthUser[][];
  authError?: boolean;
}) {
  const { profiles = [], profileError = false, authPages = [[]], authError = false } = options;
  const requestedPages: number[] = [];
  const client = {
    from: (table: string) => {
      assert.equal(table, 'staff_profiles');
      return {
        select: () => ({
          order: async () =>
            profileError
              ? { data: null, error: new Error('database down') }
              : { data: profiles, error: null },
        }),
      };
    },
    auth: {
      admin: {
        listUsers: async ({ page }: { page: number }) => {
          requestedPages.push(page);
          if (authError) return { data: null, error: new Error('auth down') };
          return {
            data: {
              users: authPages[page - 1] ?? [],
              nextPage: page < authPages.length ? page + 1 : null,
            },
            error: null,
          };
        },
      },
    },
  } as unknown as StaffClient;
  return { client, requestedPages };
}

const ana: Profile = { id: 'a', full_name: 'Ana Reyes', role: 'owner', status: 'active' };
const ben: Profile = { id: 'b', full_name: 'Ben Cho', role: 'employee', status: 'inactive' };
const cy: Profile = { id: 'c', full_name: 'Cy Park', role: 'employee', status: 'active' };

test('combines each profile with its email and last sign-in from Supabase Auth', async () => {
  const { client, requestedPages } = fakeClient({
    profiles: [ana, ben, cy],
    authPages: [
      [
        { id: 'a', email: 'ana@example.com', last_sign_in_at: '2026-11-06T18:30:00.000Z' },
        { id: 'b', email: 'ben@example.com' },
      ],
    ],
  });

  const staff = await createStaffBackend(client).listStaff();

  assert.deepEqual(staff, [
    {
      id: 'a',
      fullName: 'Ana Reyes',
      email: 'ana@example.com',
      lastLoginAt: '2026-11-06T18:30:00.000Z',
      role: 'owner',
      status: 'active',
    },
    {
      id: 'b',
      fullName: 'Ben Cho',
      email: 'ben@example.com',
      lastLoginAt: null,
      role: 'employee',
      status: 'inactive',
    },
    {
      id: 'c',
      fullName: 'Cy Park',
      email: null,
      lastLoginAt: null,
      role: 'employee',
      status: 'active',
    },
  ]);
  assert.deepEqual(requestedPages, [1]);
});

test('reads every page of auth users, not just the first', async () => {
  const { client, requestedPages } = fakeClient({
    profiles: [ana, ben],
    authPages: [[{ id: 'a', email: 'ana@example.com' }], [{ id: 'b', email: 'ben@example.com' }]],
  });

  const staff = await createStaffBackend(client).listStaff();

  assert.deepEqual(
    staff.map((person) => person.email),
    ['ana@example.com', 'ben@example.com'],
  );
  assert.deepEqual(requestedPages, [1, 2]);
});

test('returns an empty list when there are no staff profiles', async () => {
  const { client } = fakeClient({ profiles: [] });
  assert.deepEqual(await createStaffBackend(client).listStaff(), []);
});

test('fails, and does not ask Auth for users, when the profile lookup fails', async () => {
  const { client, requestedPages } = fakeClient({ profileError: true });

  await assert.rejects(createStaffBackend(client).listStaff(), /Staff list lookup failed/);
  assert.deepEqual(requestedPages, []);
});

test('fails when the Auth lookup fails', async () => {
  const { client } = fakeClient({ profiles: [ana], authError: true });

  await assert.rejects(createStaffBackend(client).listStaff(), /Staff email lookup failed/);
});
