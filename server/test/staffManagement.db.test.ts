import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { checkSeedTarget } from '../src/lib/seedTarget.js';

const databaseUrl = process.env.STAFF_MANAGEMENT_TEST_DATABASE_URL;
const localSupabasePorts = [54322, 55322];

if (process.env.npm_lifecycle_event === 'test:staff-management-db' && !databaseUrl) {
  throw new Error(
    'Set STAFF_MANAGEMENT_TEST_DATABASE_URL to local Supabase (port 55322 locally, 54322 in CI) to run test:staff-management-db.',
  );
}

describe.skipIf(!databaseUrl)(
  'staff profile management on local Supabase',
  { timeout: 30_000 },
  () => {
    let pool: pg.Pool;
    const userIds: string[] = [];

    async function createStaff(role: 'owner' | 'employee') {
      const id = randomUUID();
      userIds.push(id);
      await pool.query(
        `insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
         values ($1, 'authenticated', 'authenticated', $2, '{}'::jsonb, '{}'::jsonb)`,
        [id, `staff-${id}@example.local`],
      );
      await pool.query(
        `insert into public.staff_profiles (id, full_name, role, status)
         values ($1, 'SSPMW-294 Test', $2, 'active')`,
        [id, role],
      );
      return id;
    }

    async function callManagement(
      actorId: string,
      targetId: string,
      newRole: 'owner' | 'employee' | null,
      remove: boolean,
    ) {
      return (
        await pool.query(`select public.manage_staff_profile($1, $2, $3, $4) as result`, [
          actorId,
          targetId,
          newRole,
          remove,
        ])
      ).rows[0].result as Record<string, unknown>;
    }

    beforeAll(async () => {
      let target: ReturnType<typeof checkSeedTarget>;
      try {
        target = checkSeedTarget(
          { ...process.env, SEED_DATABASE_URL: databaseUrl },
          localSupabasePorts,
        );
      } catch (error) {
        throw new Error(`STAFF_MANAGEMENT_TEST_DATABASE_URL: ${(error as Error).message}`, {
          cause: error,
        });
      }
      if (target.kind !== 'local') {
        throw new Error('Staff management tests require local Supabase, never a hosted project.');
      }
      pool = new pg.Pool({ ...target.connection, max: 4 });
      pool.on('error', () => {});
      await pool.query('select 1');
    });

    afterEach(async () => {
      if (pool && userIds.length) {
        await pool.query('delete from auth.users where id = any($1::uuid[])', [userIds]);
        userIds.length = 0;
      }
    });

    afterAll(async () => {
      await pool?.end();
    });

    it('updates roles between owner and employee', async () => {
      const actorId = await createStaff('owner');
      const targetId = await createStaff('employee');

      expect(await callManagement(actorId, targetId, 'owner', false)).toEqual({
        outcome: 'updated',
        role: 'owner',
      });
      expect(await callManagement(actorId, targetId, 'employee', false)).toEqual({
        outcome: 'updated',
        role: 'employee',
      });
      expect(
        (await pool.query('select role from public.staff_profiles where id = $1', [targetId]))
          .rows[0].role,
      ).toBe('employee');
    });

    it('marks a removed employee inactive and deletes all their Auth sessions only', async () => {
      const actorId = await createStaff('owner');
      const targetId = await createStaff('employee');
      const otherId = await createStaff('employee');
      const sessionIds = [randomUUID(), randomUUID()];
      await pool.query(
        `insert into auth.sessions (id, user_id, aal) values
         ($1, $3, 'aal1'), ($2, $3, 'aal1')`,
        [...sessionIds, targetId],
      );
      const otherSessionId = randomUUID();
      await pool.query(`insert into auth.sessions (id, user_id, aal) values ($1, $2, 'aal1')`, [
        otherSessionId,
        otherId,
      ]);

      expect(await callManagement(actorId, targetId, null, true)).toEqual({
        outcome: 'removed',
        revoked_sessions: 2,
      });
      expect(
        (await pool.query('select status from public.staff_profiles where id = $1', [targetId]))
          .rows[0].status,
      ).toBe('inactive');
      expect(
        Number(
          (await pool.query('select count(*) from auth.sessions where user_id = $1', [targetId]))
            .rows[0].count,
        ),
      ).toBe(0);
      expect(
        (await pool.query('select id from auth.sessions where user_id = $1', [otherId])).rows,
      ).toEqual([{ id: otherSessionId }]);
    });

    it('prevents an owner from removing or demoting their own account', async () => {
      const ownerId = await createStaff('owner');

      expect(await callManagement(ownerId, ownerId, null, true)).toEqual({
        outcome: 'self_lockout',
      });
      expect(await callManagement(ownerId, ownerId, 'employee', false)).toEqual({
        outcome: 'self_lockout',
      });
      expect(
        (
          await pool.query('select role, status from public.staff_profiles where id = $1', [
            ownerId,
          ])
        ).rows[0],
      ).toEqual({ role: 'owner', status: 'active' });
    });

    it('serializes simultaneous owner demotions so at least one active owner remains', async () => {
      const ownerOne = await createStaff('owner');
      const ownerTwo = await createStaff('owner');

      const results = await Promise.all([
        callManagement(ownerOne, ownerTwo, 'employee', false),
        callManagement(ownerTwo, ownerOne, 'employee', false),
      ]);

      expect([
        ['forbidden', 'updated'],
        ['updated', 'updated'],
      ]).toContainEqual(results.map((result) => result.outcome).sort());
      expect(
        Number(
          (
            await pool.query(
              `select count(*) from public.staff_profiles
               where status = 'active' and role = 'owner'`,
            )
          ).rows[0].count,
        ),
      ).toBeGreaterThanOrEqual(1);
    });

    it('exposes staff management only to the service role', async () => {
      const privileges = (
        await pool.query(
          `select
             has_function_privilege('service_role',
               'public.manage_staff_profile(uuid,uuid,text,boolean)', 'EXECUTE') as service_role,
             has_function_privilege('authenticated',
               'public.manage_staff_profile(uuid,uuid,text,boolean)', 'EXECUTE') as authenticated,
             has_function_privilege('anon',
               'public.manage_staff_profile(uuid,uuid,text,boolean)', 'EXECUTE') as anon`,
        )
      ).rows[0];

      expect(privileges).toEqual({ service_role: true, authenticated: false, anon: false });
    });
  },
);
