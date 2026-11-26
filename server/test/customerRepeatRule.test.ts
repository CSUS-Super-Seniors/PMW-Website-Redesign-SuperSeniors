import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REPEAT_COUNTED_JOB_STATUS, REPEAT_CUSTOMER_MIN_COMPLETED_JOBS } from '@pmw/validation';

// The repeat rule (SSPMW-379) lives in two places: the database view that every screen
// reads, and the shared constant the New/Repeat badge uses. This test fails if one of
// them changes without the other, so the badge can never disagree with is_repeat.
const MIGRATION = new URL(
  '../../supabase/migrations/20261125000000_customer_repeat_status.sql',
  import.meta.url,
);

async function viewSql() {
  const sql = await readFile(MIGRATION, 'utf8');
  // Drop comments so only the view definition is checked.
  return sql.replace(/--.*$/gm, '');
}

test('the view uses the same Repeat threshold as REPEAT_CUSTOMER_MIN_COMPLETED_JOBS', async () => {
  const sql = await viewSql();
  const threshold = /count\(j\.id\)\s*>=\s*(\d+)\s+as\s+is_repeat/i.exec(sql);

  assert.ok(threshold, 'the view should compute is_repeat as count(j.id) >= N');
  assert.equal(Number(threshold[1]), REPEAT_CUSTOMER_MIN_COMPLETED_JOBS);
});

test('the view counts only the job status in REPEAT_COUNTED_JOB_STATUS', async () => {
  const sql = await viewSql();
  const statuses = [...sql.matchAll(/j\.status\s*=\s*'([a-z_]+)'/gi)].map((match) => match[1]);

  assert.deepEqual(statuses, [REPEAT_COUNTED_JOB_STATUS]);
});
