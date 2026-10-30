import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkSeedTarget } from '../src/lib/seedTarget.js';

// Runs supabase/seed.sql against local Supabase. It needs Postgres with every migration
// applied, so plain `npm test` skips it unless SEED_TEST_DATABASE_URL is set. CI's RLS
// job runs it with `npm run test:seed`. Everything, including the number sequence
// restarts, happens in one transaction that is never committed, so the database is
// left as it was.

const databaseUrl = process.env.SEED_TEST_DATABASE_URL;
const SEED_FILE = new URL('../../supabase/seed.sql', import.meta.url);

// `npm run test:seed` must really run it, so a missing URL fails instead of passing
// with every test skipped.
if (process.env.npm_lifecycle_event === 'test:seed' && !databaseUrl) {
  throw new Error(
    'Set SEED_TEST_DATABASE_URL to local Supabase (postgresql://postgres:postgres@127.0.0.1:54322/postgres) to run npm run test:seed.',
  );
}

const MARGARET = '5eed0001-0000-4000-8000-000000000001';
const J1001 = '5eed0004-0000-4000-8000-000000001001';
const J1001_FIRST_STEP = '5eed0005-0000-4000-8000-000000010010';
// Sample status is 'closed' (Figma: Declined).
const INQ1044 = '5eed0003-0000-4000-8000-000000001044';

// Sample rows by their fixed id prefix, so rows made in the app are never counted.
const SAMPLE_COUNTS = `
  select
    (select count(*)::int from public.customers where id::text like '5eed0001-%') as customers,
    (select count(*)::int from public.customer_notes where id::text like '5eed0002-%') as notes,
    (select count(*)::int from public.inquiries where id::text like '5eed0003-%') as inquiries,
    (select count(*)::int from public.jobs where id::text like '5eed0004-%') as jobs,
    (select count(*)::int from public.job_steps where id::text like '5eed0005-%') as steps
`;

const EXPECTED = { customers: 7, notes: 3, inquiries: 5, jobs: 5, steps: 15 };

describe.skipIf(!databaseUrl)('supabase/seed.sql on a real database', { timeout: 30_000 }, () => {
  let client: pg.Client | undefined;
  let seedSql: string;

  async function query(sql: string, params: unknown[] = []) {
    return (await client!.query(sql, params)).rows;
  }

  async function seed() {
    await client!.query(seedSql);
  }

  async function sampleCounts() {
    return (await query(SAMPLE_COUNTS))[0];
  }

  async function addAppJob() {
    const [job] = await query(
      `insert into public.jobs (customer_id, item) values ($1, 'App-made job')
       returning id, job_number`,
      [MARGARET],
    );
    return { id: job.id as string, number: Number(String(job.job_number).slice(2)) };
  }

  async function addAppInquiry() {
    const [inquiry] = await query(
      `insert into public.inquiries (first_name, last_name, email, item, description)
       values ('App', 'Visitor', 'app.visitor@example.com', 'Chair', 'Loose leg')
       returning id, inquiry_number`,
    );
    return { id: inquiry.id as string, number: Number(String(inquiry.inquiry_number).slice(4)) };
  }

  beforeAll(async () => {
    // Only ever local Supabase, checked with the same guard as `npm run db:seed`. It
    // checks the values pg actually connects with, so `?host=` overrides, PGOPTIONS and
    // localhost tunnels to a hosted project are refused.
    let target;
    try {
      target = checkSeedTarget({ ...process.env, SEED_DATABASE_URL: databaseUrl });
    } catch (error) {
      throw new Error(`SEED_TEST_DATABASE_URL: ${(error as Error).message}`, { cause: error });
    }
    if (target.kind !== 'local') {
      throw new Error('SEED_TEST_DATABASE_URL must be local Supabase, never a hosted project.');
    }
    seedSql = await readFile(SEED_FILE, 'utf8');

    client = new pg.Client(target.connection);
    // A dropped connection is reported by the failing query instead of crashing the run.
    client.on('error', () => {});
    await client.connect();
    await client.query('begin');
    // Start the numbers from scratch (next is 1001), like a fresh database, so the test
    // shows the seed itself moves them past the samples. Keep this first: setval and
    // nextval are normally never rolled back, and restarting the sequences in this
    // transaction is what makes the seed's setval calls and the test's inserts roll
    // back with everything else.
    await client.query('alter sequence public.job_number_seq restart with 1001');
    await client.query('alter sequence public.inquiry_number_seq restart with 1001');
  });

  // Each test gets its own savepoint, so a failure in one doesn't break the next.
  beforeEach(async () => {
    await client!.query('savepoint each_test');
  });

  afterEach(async () => {
    await client!.query('rollback to savepoint each_test');
  });

  afterAll(async () => {
    // Closing without a commit makes the server roll the transaction back, and any
    // statement still in flight fails instead of being saved.
    await client?.end().catch(() => {});
  });

  it('loads every sample row with its sample number once, and a rerun adds no copies', async () => {
    await seed();
    expect(await sampleCounts()).toEqual(EXPECTED);

    await seed();
    expect(await sampleCounts()).toEqual(EXPECTED);

    const [numbers] = await query(`
      select
        (select array_agg(job_number order by job_number) from public.jobs
          where id::text like '5eed0004-%') as jobs,
        (select array_agg(inquiry_number order by inquiry_number) from public.inquiries
          where id::text like '5eed0003-%') as inquiries`);
    expect(numbers.jobs).toEqual(['J-1001', 'J-1002', 'J-1003', 'J-1004', 'J-1005']);
    expect(numbers.inquiries).toEqual(['INQ-1044', 'INQ-1045', 'INQ-1046', 'INQ-1047', 'INQ-1048']);
  });

  it('puts edited sample rows back to their sample values', async () => {
    await seed();
    await query(
      `update public.customers set first_name = 'Changed', deleted_at = now() where id = $1`,
      [MARGARET],
    );
    await query(`update public.jobs set status = 'completed', amount = 250 where id = $1`, [J1001]);
    await query(`update public.job_steps set is_done = true where id = $1`, [J1001_FIRST_STEP]);
    await query(`update public.inquiries set status = 'new' where id = $1`, [INQ1044]);

    await seed();

    const [customer] = await query(
      `select first_name, deleted_at from public.customers where id = $1`,
      [MARGARET],
    );
    const [job] = await query(`select status, amount from public.jobs where id = $1`, [J1001]);
    const [step] = await query(`select is_done from public.job_steps where id = $1`, [
      J1001_FIRST_STEP,
    ]);
    const [inquiry] = await query(`select status from public.inquiries where id = $1`, [INQ1044]);
    expect(customer).toEqual({ first_name: 'Margaret', deleted_at: null });
    expect(job).toEqual({ status: 'in_progress', amount: null });
    expect(step.is_done).toBe(false);
    expect(inquiry.status).toBe('closed');
  });

  it('gives app rows numbers after the samples, and a rerun never moves the numbers back', async () => {
    await seed();
    const firstJob = await addAppJob();
    const firstInquiry = await addAppInquiry();

    // On a fresh database these are J-1006 and INQ-1049. A database with more app rows
    // gets higher numbers, but never one of the sample numbers.
    expect(firstJob.number).toBeGreaterThan(1005);
    expect(firstInquiry.number).toBeGreaterThan(1048);

    await seed();

    const secondJob = await addAppJob();
    const secondInquiry = await addAppInquiry();
    expect(secondJob.number).toBeGreaterThan(firstJob.number);
    expect(secondInquiry.number).toBeGreaterThan(firstInquiry.number);

    const [kept] = await query(
      `select
         (select count(*)::int from public.jobs where id = $1) as jobs,
         (select count(*)::int from public.inquiries where id = $2) as inquiries`,
      [firstJob.id, firstInquiry.id],
    );
    expect(kept).toEqual({ jobs: 1, inquiries: 1 });
    expect(await sampleCounts()).toEqual(EXPECTED);
  });
});
