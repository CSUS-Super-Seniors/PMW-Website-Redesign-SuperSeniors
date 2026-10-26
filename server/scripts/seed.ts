import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { checkSeedTarget } from '../src/lib/seedTarget.js';

// Loads supabase/seed.sql (the Figma sample data) into the local, dev or staging
// database. checkSeedTarget refuses production before any connection is made, and
// the client connects with the exact values it checked.

const SEED_FILE = new URL('../../supabase/seed.sql', import.meta.url);

// Counts the sample names and numbers. Expect 7, 5 and 5; a higher customer count
// usually means someone also added a customer with a sample name in the app.
const COUNT_QUERY = `
  select
    (select count(*)::int from public.customers
      where (first_name, last_name) in (('Margaret', 'Lewis'), ('Robert', 'Chen'),
        ('Dorothy', 'Alvarez'), ('Walter', 'Kim'), ('Linda', 'Martinez'),
        ('James', 'Wilson'), ('Carol', 'Smith'))) as customers,
    (select count(*)::int from public.inquiries
      where inquiry_number between 'INQ-1044' and 'INQ-1048') as inquiries,
    (select count(*)::int from public.jobs
      where job_number between 'J-1001' and 'J-1005') as jobs
`;

// Unique keys the seed can collide with when the app already used those numbers.
const NUMBER_KEYS = new Set(['jobs_job_number_key', 'inquiries_inquiry_number_key']);

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unexpected error.';

  const db = error as Error & { code?: string; detail?: string; constraint?: string };
  const lines = [db.message];
  if (db.detail) lines.push(db.detail);
  if (db.code === '23505' && db.constraint && NUMBER_KEYS.has(db.constraint)) {
    lines.push(
      'This database already has jobs or inquiries using the sample numbers (J-1001 to J-1005, INQ-1044 to INQ-1048). See README, Sample data.',
    );
  }
  return lines.join('\n');
}

async function main() {
  const target = checkSeedTarget(process.env);
  const sql = await readFile(SEED_FILE, 'utf8');

  console.log(
    target.kind === 'local'
      ? 'Seeding the local Supabase database...'
      : `Seeding Supabase project ${target.projectRef}...`,
  );

  const client = new pg.Client(target.connection);
  // A dropped connection is reported by the failing query below instead of crashing.
  client.on('error', () => {});
  await client.connect();

  try {
    try {
      // One transaction, so a failed seed leaves the database unchanged.
      await client.query('begin');
      await client.query(sql);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    }

    const { rows } = await client.query(COUNT_QUERY);
    console.log('Sample rows now in the database:', rows[0]);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${describeError(error)}`);
  process.exitCode = 1;
});
