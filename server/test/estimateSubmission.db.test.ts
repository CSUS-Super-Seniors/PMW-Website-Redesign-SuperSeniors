import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { checkSeedTarget } from '../src/lib/seedTarget.js';

const databaseUrl = process.env.SUBMISSION_TEST_DATABASE_URL;
if (process.env.npm_lifecycle_event === 'test:submission-db' && !databaseUrl) {
  throw new Error(
    'Set SUBMISSION_TEST_DATABASE_URL to local Supabase before running test:submission-db.',
  );
}
const details = {
  first_name: '  Zoë 李  ',
  last_name: 'O’Connor',
  email: 'Zoe+repairs@Example.com',
  phone: '(916) 555-0142',
  text_ok: true,
  address: ' 123 Main St ',
  city: 'Carmichael',
  item: 'Dining chair',
  issue_type: 'loose_joints',
  description: 'A wobbly leg.',
  lead_source: 'referral',
};

// Real transactions are required here: mocks cannot prove atomicity or number
// uniqueness between simultaneous requests on separate database connections.
describe.skipIf(!databaseUrl)(
  'atomic estimate submission on local Postgres',
  { timeout: 30_000 },
  () => {
    let pool: pg.Pool;
    const ids: string[] = [];
    function id() {
      const value = randomUUID();
      ids.push(value);
      return value;
    }
    async function submit(
      submissionId: string,
      hash = 'a'.repeat(64),
      session: string | null = null,
      paths: string[] = [],
      fields = details,
    ) {
      const client = await pool.connect();
      try {
        await client.query('set role service_role');
        return (
          await client.query(
            'select public.submit_estimate_request($1, $2, $3::jsonb, $4, $5::text[]) as saved',
            [submissionId, hash, JSON.stringify(fields), session, paths],
          )
        ).rows[0].saved;
      } finally {
        client.release();
      }
    }
    beforeAll(async () => {
      const target = checkSeedTarget({ ...process.env, SEED_DATABASE_URL: databaseUrl });
      if (target.kind !== 'local')
        throw new Error('Submission database tests require local Supabase.');
      pool = new pg.Pool({ ...target.connection, max: 8 });
      pool.on('error', () => {});
      await pool.query('select 1');
    });
    afterEach(async () => {
      // Only this run's randomly identified inquiries are removed; photo links cascade.
      if (pool && ids.length)
        await pool.query('delete from public.inquiries where submission_id = any($1::uuid[])', [
          ids,
        ]);
      ids.length = 0;
    });
    afterAll(async () => {
      await pool?.end();
    });

    it('saves unchanged fields, New status, server area approval, finalized photos and no customer', async () => {
      const submissionId = id();
      const session = randomUUID();
      const path = `estimate-uploads/1900000000/${session}/photo.jpg`;
      const saved = await submit(submissionId, 'a'.repeat(64), session, [path]);
      const row = (await pool.query('select * from public.inquiries where id = $1', [saved.id]))
        .rows[0];
      expect(row).toMatchObject({
        ...details,
        status: 'new',
        in_service_area: true,
        customer_id: null,
        photo_upload_session_id: session,
        photos_finalized: true,
      });
      expect(saved.inquiry_number).toMatch(/^INQ-\d+$/);
      expect(row.created_at).toBeInstanceOf(Date);
      expect(
        (
          await pool.query('select storage_path from public.inquiry_photos where inquiry_id = $1', [
            saved.id,
          ])
        ).rows,
      ).toEqual([{ storage_path: path }]);
    });

    it('gives simultaneous distinct requests unique INQ numbers', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => submit(id())));
      expect(new Set(results.map((saved) => saved.inquiry_number)).size).toBe(8);
      expect(results.every((saved) => saved.created)).toBe(true);
    });

    it.each(['google', 'referral', 'social_media', 'yelp', 'other'])(
      'persists lead source %s',
      async (lead_source) => {
        const saved = await submit(id(), 'a'.repeat(64), null, [], { ...details, lead_source });
        expect(
          (await pool.query('select lead_source from public.inquiries where id = $1', [saved.id]))
            .rows[0].lead_source,
        ).toBe(lead_source);
      },
    );

    it('commits one inquiry for simultaneous retries and rejects an edited retry', async () => {
      const submissionId = id();
      const results = await Promise.all(Array.from({ length: 8 }, () => submit(submissionId)));
      expect(new Set(results.map((saved) => saved.id)).size).toBe(1);
      expect(results.filter((saved) => saved.created)).toHaveLength(1);
      await expect(submit(submissionId, 'b'.repeat(64))).rejects.toMatchObject({ code: 'PT409' });
      expect(
        Number(
          (
            await pool.query('select count(*) from public.inquiries where submission_id = $1', [
              submissionId,
            ])
          ).rows[0].count,
        ),
      ).toBe(1);
    });

    it('rolls the entire new inquiry back when a photo is already attached elsewhere', async () => {
      const session = randomUUID();
      const path = `estimate-uploads/1900000000/${session}/photo.jpg`;
      const first = await submit(id(), 'a'.repeat(64), session, [path]);
      const secondId = id();
      await expect(submit(secondId, 'a'.repeat(64), session, [path])).rejects.toThrow();
      expect(
        (await pool.query('select id from public.inquiries where submission_id = $1', [secondId]))
          .rows,
      ).toEqual([]);
      expect(
        (
          await pool.query('select inquiry_id from public.inquiry_photos where storage_path = $1', [
            path,
          ])
        ).rows,
      ).toEqual([{ inquiry_id: first.id }]);
    });

    it('never reuses the INQ number of a deleted inquiry', async () => {
      const first = await submit(id());
      await pool.query('delete from public.inquiries where id = $1', [first.id]);
      const next = await submit(id());
      expect(Number(next.inquiry_number.slice(4))).toBeGreaterThan(
        Number(first.inquiry_number.slice(4)),
      );
    });
  },
);
