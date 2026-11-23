import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { checkSeedTarget } from '../src/lib/seedTarget.js';

const databaseUrl = process.env.JOB_NUMBER_TEST_DATABASE_URL;
const localSupabasePorts = [54322, 55322];

if (process.env.npm_lifecycle_event === 'test:job-number-db' && !databaseUrl) {
  throw new Error(
    'Set JOB_NUMBER_TEST_DATABASE_URL to local Supabase (port 55322 locally, 54322 in CI) to run test:job-number-db.',
  );
}

describe.skipIf(!databaseUrl)('job number sequence on local Postgres', { timeout: 30_000 }, () => {
  let pool: pg.Pool;
  const customerIds: string[] = [];

  async function createCustomer() {
    const id = randomUUID();
    customerIds.push(id);
    await pool.query(
      'insert into public.customers (id, first_name, last_name) values ($1, $2, $3)',
      [id, 'Job Number', `Test ${id}`],
    );
    return id;
  }

  async function insertJob(customerId: string) {
    const client = await pool.connect();
    try {
      return (
        await client.query(
          `insert into public.jobs (customer_id, item)
             values ($1, 'Sequence test item')
             returning id, job_number, status`,
          [customerId],
        )
      ).rows[0] as { id: string; job_number: string; status: string };
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    let target: ReturnType<typeof checkSeedTarget>;
    try {
      target = checkSeedTarget(
        { ...process.env, SEED_DATABASE_URL: databaseUrl },
        localSupabasePorts,
      );
    } catch (error) {
      throw new Error(`JOB_NUMBER_TEST_DATABASE_URL: ${(error as Error).message}`, {
        cause: error,
      });
    }
    if (target.kind !== 'local') {
      throw new Error('Job number tests require local Supabase, never a hosted project.');
    }
    pool = new pg.Pool({ ...target.connection, max: 8 });
    pool.on('error', () => {});
    await pool.query('select 1');
  });

  afterEach(async () => {
    if (!pool || customerIds.length === 0) return;
    await pool.query('delete from public.jobs where customer_id = any($1::uuid[])', [customerIds]);
    await pool.query('delete from public.customers where id = any($1::uuid[])', [customerIds]);
    customerIds.length = 0;
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('assigns the next J-number automatically', async () => {
    const customerId = await createCustomer();
    const job = await insertJob(customerId);

    expect(job.job_number).toMatch(/^J-\d+$/);
    expect(job.status).toBe('scheduled');
  });

  it('assigns unique job numbers to simultaneous inserts on separate connections', async () => {
    const customerId = await createCustomer();
    const clients = await Promise.all(Array.from({ length: 8 }, () => pool.connect()));
    try {
      const results = await Promise.all(
        clients.map((client) =>
          client.query(
            `insert into public.jobs (customer_id, item)
               values ($1, 'Concurrent sequence test')
               returning id, job_number, pg_backend_pid() as backend_pid`,
            [customerId],
          ),
        ),
      );
      const rows = results.map((result) => result.rows[0]);

      expect(new Set(rows.map((row) => row.backend_pid)).size).toBe(clients.length);
      expect(new Set(rows.map((row) => row.job_number)).size).toBe(clients.length);
      expect(rows.every((row) => /^J-\d+$/.test(row.job_number))).toBe(true);
    } finally {
      clients.forEach((client) => client.release());
    }
  });

  it('rejects a duplicate job number', async () => {
    const customerId = await createCustomer();
    const job = await insertJob(customerId);

    await expect(
      pool.query(
        `insert into public.jobs (customer_id, item, job_number)
           values ($1, 'Duplicate sequence test', $2)`,
        [customerId, job.job_number],
      ),
    ).rejects.toMatchObject({ code: '23505', constraint: 'jobs_job_number_key' });
  });

  it('preserves a cancelled job number and rejects changing an assigned number', async () => {
    const customerId = await createCustomer();
    const job = await insertJob(customerId);
    const cancelled = await pool.query(
      `update public.jobs set status = 'cancelled' where id = $1
         returning job_number, status`,
      [job.id],
    );

    expect(cancelled.rows[0]).toEqual({
      job_number: job.job_number,
      status: 'cancelled',
    });
    await expect(
      pool.query('update public.jobs set job_number = $2 where id = $1', [
        job.id,
        `J-${randomUUID()}`,
      ]),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'jobs_job_number_immutable',
    });
    expect(
      (await pool.query('select job_number from public.jobs where id = $1', [job.id])).rows[0]
        .job_number,
    ).toBe(job.job_number);
  });

  it('never reuses a job number after its job is deleted', async () => {
    const customerId = await createCustomer();
    const first = await insertJob(customerId);
    await pool.query('delete from public.jobs where id = $1', [first.id]);
    const next = await insertJob(customerId);

    expect(Number(next.job_number.slice(2))).toBeGreaterThan(Number(first.job_number.slice(2)));
  });
});
