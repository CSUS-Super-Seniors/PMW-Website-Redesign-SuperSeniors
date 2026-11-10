import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInquiryBackend } from '../src/inquiries.js';

type Row = Record<string, unknown>;
type Action = 'select' | 'insert' | 'update' | 'delete';
type Result = { data: unknown; error: Error | null };

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Turns a Postgres ilike pattern into a regular expression: % is any text, _ is one
// character, and a backslash makes the next character literal.
function likeToRegExp(pattern: string) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '\\') {
      index += 1;
      source += escapeRegExp(pattern[index] ?? '');
    } else if (character === '%') {
      source += '.*';
    } else if (character === '_') {
      source += '.';
    } else {
      source += escapeRegExp(character);
    }
  }
  return new RegExp(`^${source}$`, 'i');
}

// A stand-in for the Supabase client that keeps three tables in memory.
// `failing` lists calls that should return an error, such as "jobs:insert".
function fakeDatabase(
  seed: { inquiries?: Row[]; customers?: Row[]; jobs?: Row[] },
  failing: string[] = [],
) {
  const tables: Record<string, Row[]> = {
    inquiries: seed.inquiries ?? [],
    customers: seed.customers ?? [],
    jobs: seed.jobs ?? [],
  };
  let counter = 0;
  let jobNumber = 1000;

  function from(table: string) {
    const rows = tables[table];
    let action: Action = 'select';
    let payload: Row = {};
    let columns: string[] | null = null;
    let sortByCreated = false;
    let max = Infinity;
    let mode: 'many' | 'single' | 'maybe' = 'many';
    const filters: Array<(row: Row) => boolean> = [];

    function run(): Result {
      if (failing.includes(`${table}:${action}`)) {
        return { data: null, error: new Error('database down') };
      }
      let matched: Row[];
      if (action === 'insert') {
        counter += 1;
        const row: Row = {
          id: `${table}-${counter}`,
          created_at: new Date(2030, 0, 1, 0, 0, counter).toISOString(),
          deleted_at: null,
          ...(table === 'jobs' ? { job_number: `J-${(jobNumber += 1)}` } : {}),
          ...payload,
        };
        rows.push(row);
        matched = [row];
      } else {
        matched = rows.filter((row) => filters.every((filter) => filter(row)));
        if (sortByCreated) {
          matched.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        }
        if (action === 'update') for (const row of matched) Object.assign(row, payload);
        if (action === 'delete') for (const row of matched) rows.splice(rows.indexOf(row), 1);
      }
      const picked = matched
        .slice(0, max)
        .map((row) =>
          columns ? Object.fromEntries(columns.map((column) => [column, row[column]])) : row,
        );
      if (mode === 'many') return { data: picked, error: null };
      if (picked.length === 0) {
        return mode === 'single'
          ? { data: null, error: new Error('no rows') }
          : { data: null, error: null };
      }
      return { data: picked[0], error: null };
    }

    const builder = {
      select(list?: string) {
        if (list) columns = list.split(',');
        return builder;
      },
      insert(row: Row) {
        action = 'insert';
        payload = row;
        return builder;
      },
      update(values: Row) {
        action = 'update';
        payload = values;
        return builder;
      },
      delete() {
        action = 'delete';
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      is(column: string, value: null) {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      ilike(column: string, pattern: string) {
        const expression = likeToRegExp(pattern);
        filters.push((row) => typeof row[column] === 'string' && expression.test(row[column]));
        return builder;
      },
      order(column: string) {
        sortByCreated = column === 'created_at';
        return builder;
      },
      limit(count: number) {
        max = count;
        return builder;
      },
      single() {
        mode = 'single';
        return builder;
      },
      maybeSingle() {
        mode = 'maybe';
        return builder;
      },
      then(onfulfilled: (value: Result) => unknown, onrejected?: (reason: unknown) => unknown) {
        return Promise.resolve(run()).then(onfulfilled, onrejected);
      },
    };
    return builder;
  }

  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, tables };
}

const INQUIRY_ID = '5eed0003-0000-4000-8000-000000001048';
const SECOND_INQUIRY_ID = '5eed0003-0000-4000-8000-000000001049';

function inquiry(overrides: Row = {}): Row {
  return {
    id: INQUIRY_ID,
    customer_id: null,
    first_name: 'Margaret',
    last_name: 'Lewis',
    email: 'Margaret@Example.com',
    phone: '(916) 555-0142',
    preferred_contact: null,
    text_ok: true,
    item: 'Dining chair',
    description: 'The chair rocks side to side.',
    address: '4821 Fair Oaks Blvd',
    city: 'Carmichael',
    lead_source: 'google',
    status: 'new',
    ...overrides,
  };
}

function customer(overrides: Row = {}): Row {
  return {
    id: 'customer-existing',
    first_name: 'Margaret',
    last_name: 'Lewis',
    email: 'margaret@example.com',
    phone: '(916) 555-0142',
    created_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function pick(row: Row, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, row[key]]));
}

test('a new customer is created and the job carries over the inquiry details', async () => {
  const db = fakeDatabase({ inquiries: [inquiry()] });

  const result = await createInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 1);
  const created = db.tables.customers[0];
  assert.deepEqual(
    pick(created, ['first_name', 'last_name', 'email', 'phone', 'address', 'city', 'lead_source']),
    {
      first_name: 'Margaret',
      last_name: 'Lewis',
      email: 'margaret@example.com',
      phone: '(916) 555-0142',
      address: '4821 Fair Oaks Blvd',
      city: 'Carmichael',
      lead_source: 'google',
    },
  );
  assert.equal(db.tables.jobs.length, 1);
  const job = db.tables.jobs[0];
  assert.deepEqual(
    pick(job, ['customer_id', 'inquiry_id', 'item', 'notes', 'lead_source', 'city']),
    {
      customer_id: created.id,
      inquiry_id: INQUIRY_ID,
      item: 'Dining chair',
      notes: 'The chair rocks side to side.',
      lead_source: 'google',
      city: 'Carmichael',
    },
  );
  assert.deepEqual(result, { outcome: 'accepted', job: { id: job.id, jobNumber: 'J-1001' } });
  assert.deepEqual(pick(db.tables.inquiries[0], ['status', 'customer_id']), {
    status: 'converted',
    customer_id: created.id,
  });
});

test('an existing customer is matched by email, ignoring case', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry({ phone: null })],
    customers: [customer({ email: 'MARGARET@example.com', phone: null })],
  });

  await createInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 1);
  assert.equal(db.tables.jobs[0].customer_id, 'customer-existing');
  assert.equal(db.tables.inquiries[0].customer_id, 'customer-existing');
});

test('an existing customer is matched by phone typed in another format', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry({ email: null, phone: '(916) 555-0142' })],
    customers: [customer({ email: null, phone: '+1 916-555-0142' })],
  });

  await createInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 1);
  assert.equal(db.tables.jobs[0].customer_id, 'customer-existing');
});

test('a phone that only shares the last four digits is not a match', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry({ email: null })],
    customers: [customer({ email: null, phone: '(530) 555-0142' })],
  });

  await createInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 2);
  assert.notEqual(db.tables.jobs[0].customer_id, 'customer-existing');
});

test('a deleted customer is ignored and a new one is created', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry()],
    customers: [customer({ deleted_at: '2026-06-01T00:00:00.000Z' })],
  });

  await createInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 2);
  assert.notEqual(db.tables.jobs[0].customer_id, 'customer-existing');
});

test('a customer already linked to the inquiry wins over a match', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry({ customer_id: 'customer-linked' })],
    customers: [customer()],
  });

  await createInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 1);
  assert.equal(db.tables.jobs[0].customer_id, 'customer-linked');
});

test('the same person submitting again gets one customer and two jobs', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry(), inquiry({ id: SECOND_INQUIRY_ID, item: 'Rocking chair' })],
  });
  const backend = createInquiryBackend(db.client);

  await backend.acceptInquiry(INQUIRY_ID);
  await backend.acceptInquiry(SECOND_INQUIRY_ID);

  assert.equal(db.tables.customers.length, 1);
  assert.equal(db.tables.jobs.length, 2);
  assert.equal(db.tables.jobs[0].customer_id, db.tables.jobs[1].customer_id);
});

test('accepting twice returns the same job and does not create another', async () => {
  const db = fakeDatabase({ inquiries: [inquiry()] });
  const backend = createInquiryBackend(db.client);

  const first = await backend.acceptInquiry(INQUIRY_ID);
  const second = await backend.acceptInquiry(INQUIRY_ID);

  assert.deepEqual(second, first);
  assert.equal(db.tables.jobs.length, 1);
  assert.equal(db.tables.customers.length, 1);
});

test('a declined inquiry cannot be accepted and nothing is created', async () => {
  const db = fakeDatabase({ inquiries: [inquiry({ status: 'closed' })] });

  const result = await createInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.deepEqual(result, { outcome: 'not-acceptable', status: 'closed' });
  assert.equal(db.tables.jobs.length, 0);
  assert.equal(db.tables.customers.length, 0);
});

test('an inquiry that does not exist is reported as not found', async () => {
  const db = fakeDatabase({});
  const result = await createInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);
  assert.deepEqual(result, { outcome: 'not-found' });
});

test('if the job cannot be created, the customer made for it is removed', async () => {
  const db = fakeDatabase({ inquiries: [inquiry()] }, ['jobs:insert']);

  await assert.rejects(createInquiryBackend(db.client).acceptInquiry(INQUIRY_ID), /Job could not/);

  assert.equal(db.tables.customers.length, 0);
  assert.equal(db.tables.inquiries[0].status, 'new');
});

test('if the job cannot be created, a matched customer is kept', async () => {
  const db = fakeDatabase({ inquiries: [inquiry()], customers: [customer()] }, ['jobs:insert']);

  await assert.rejects(createInquiryBackend(db.client).acceptInquiry(INQUIRY_ID), /Job could not/);

  assert.equal(db.tables.customers.length, 1);
  assert.equal(db.tables.inquiries[0].status, 'new');
});

test('a failed customer lookup stops the accept before anything is created', async () => {
  const db = fakeDatabase({ inquiries: [inquiry()] }, ['customers:select']);

  await assert.rejects(
    createInquiryBackend(db.client).acceptInquiry(INQUIRY_ID),
    /Customer lookup failed/,
  );

  assert.equal(db.tables.jobs.length, 0);
});
