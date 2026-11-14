import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAcceptInquiryBackend, jobMediaPath } from '../src/acceptInquiry.js';

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
  seed: {
    inquiries?: Row[];
    customers?: Row[];
    jobs?: Row[];
    inquiry_photos?: Row[];
    job_media?: Row[];
    files?: string[];
  },
  failing: string[] = [],
  hooks: { beforeInsert?: (table: string, tables: Record<string, Row[]>) => void } = {},
) {
  const tables: Record<string, Row[]> = {
    inquiries: seed.inquiries ?? [],
    customers: seed.customers ?? [],
    jobs: seed.jobs ?? [],
    inquiry_photos: seed.inquiry_photos ?? [],
    job_media: seed.job_media ?? [],
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
        hooks.beforeInsert?.(table, tables);
        // Mirrors the unique index from the unique_job_per_inquiry migration.
        if (
          table === 'jobs' &&
          payload.inquiry_id &&
          rows.some((row) => row.inquiry_id === payload.inquiry_id)
        ) {
          return {
            data: null,
            error: Object.assign(new Error('duplicate key value violates unique constraint'), {
              code: '23505',
            }),
          };
        }
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

  // Files are tracked as "bucket/path" strings.
  const files = new Set(seed.files ?? []);
  const storage = {
    from(bucket: string) {
      return {
        async copy(source: string, destination: string, options?: { destinationBucket?: string }) {
          if (failing.includes('storage:copy')) {
            return { data: null, error: new Error('storage down') };
          }
          if (!files.has(`${bucket}/${source}`)) {
            return { data: null, error: new Error('Object not found') };
          }
          const target = `${options?.destinationBucket ?? bucket}/${destination}`;
          if (files.has(target)) {
            return { data: null, error: new Error('The resource already exists') };
          }
          files.add(target);
          return { data: { path: destination }, error: null };
        },
      };
    },
  };

  return {
    client: { from, storage } as unknown as Pick<SupabaseClient, 'from' | 'storage'>,
    tables,
    files,
  };
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

  const result = await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

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

  await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 1);
  assert.equal(db.tables.jobs[0].customer_id, 'customer-existing');
  assert.equal(db.tables.inquiries[0].customer_id, 'customer-existing');
});

test('an existing customer is matched by phone typed in another format', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry({ email: null, phone: '(916) 555-0142' })],
    customers: [customer({ email: null, phone: '+1 916-555-0142' })],
  });

  await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 1);
  assert.equal(db.tables.jobs[0].customer_id, 'customer-existing');
});

test('a phone that only shares the last four digits is not a match', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry({ email: null })],
    customers: [customer({ email: null, phone: '(530) 555-0142' })],
  });

  await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 2);
  assert.notEqual(db.tables.jobs[0].customer_id, 'customer-existing');
});

test('a deleted customer is ignored and a new one is created', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry()],
    customers: [customer({ deleted_at: '2026-06-01T00:00:00.000Z' })],
  });

  await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 2);
  assert.notEqual(db.tables.jobs[0].customer_id, 'customer-existing');
});

test('a customer already linked to the inquiry wins over a match', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry({ customer_id: 'customer-linked' })],
    customers: [
      customer(),
      customer({ id: 'customer-linked', email: 'other@example.com', phone: null }),
    ],
  });

  await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 2);
  assert.equal(db.tables.jobs[0].customer_id, 'customer-linked');
});

test('the same person submitting again gets one customer and two jobs', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry(), inquiry({ id: SECOND_INQUIRY_ID, item: 'Rocking chair' })],
  });
  const backend = createAcceptInquiryBackend(db.client);

  await backend.acceptInquiry(INQUIRY_ID);
  await backend.acceptInquiry(SECOND_INQUIRY_ID);

  assert.equal(db.tables.customers.length, 1);
  assert.equal(db.tables.jobs.length, 2);
  assert.equal(db.tables.jobs[0].customer_id, db.tables.jobs[1].customer_id);
});

test('accepting twice returns the same job and does not create another', async () => {
  const db = fakeDatabase({ inquiries: [inquiry()] });
  const backend = createAcceptInquiryBackend(db.client);

  const first = await backend.acceptInquiry(INQUIRY_ID);
  const second = await backend.acceptInquiry(INQUIRY_ID);

  assert.deepEqual(second, first);
  assert.equal(db.tables.jobs.length, 1);
  assert.equal(db.tables.customers.length, 1);
});

test('a declined inquiry cannot be accepted and nothing is created', async () => {
  const db = fakeDatabase({ inquiries: [inquiry({ status: 'closed' })] });

  const result = await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.deepEqual(result, { outcome: 'not-acceptable', status: 'closed' });
  assert.equal(db.tables.jobs.length, 0);
  assert.equal(db.tables.customers.length, 0);
});

test('an inquiry that does not exist is reported as not found', async () => {
  const db = fakeDatabase({});
  const result = await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);
  assert.deepEqual(result, { outcome: 'not-found' });
});

test('if the job cannot be created, the customer made for it is removed', async () => {
  const db = fakeDatabase({ inquiries: [inquiry()] }, ['jobs:insert']);

  await assert.rejects(
    createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID),
    /Job could not/,
  );

  assert.equal(db.tables.customers.length, 0);
  assert.equal(db.tables.inquiries[0].status, 'new');
});

test('if the job cannot be created, a matched customer is kept', async () => {
  const db = fakeDatabase({ inquiries: [inquiry()], customers: [customer()] }, ['jobs:insert']);

  await assert.rejects(
    createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID),
    /Job could not/,
  );

  assert.equal(db.tables.customers.length, 1);
  assert.equal(db.tables.inquiries[0].status, 'new');
});

test('a failed customer lookup stops the accept before anything is created', async () => {
  const db = fakeDatabase({ inquiries: [inquiry()] }, ['customers:select']);

  await assert.rejects(
    createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID),
    /Customer lookup failed/,
  );

  assert.equal(db.tables.jobs.length, 0);
});

const PHOTO_ID = '5eed0004-0000-4000-8000-000000000001';
const SECOND_PHOTO_ID = '5eed0004-0000-4000-8000-000000000002';
const FRONT_PHOTO = { id: PHOTO_ID, storage_path: 'abc/front.jpg' };
const SIDE_PHOTO = { id: SECOND_PHOTO_ID, storage_path: 'abc/side.PNG' };

function inquiryPhoto(photo: { id: string; storage_path: string }, second: number): Row {
  return {
    ...photo,
    inquiry_id: INQUIRY_ID,
    created_at: `2026-10-01T10:00:0${second}.000Z`,
  };
}

function withPhotos(failing: string[] = []) {
  return fakeDatabase(
    {
      inquiries: [inquiry()],
      inquiry_photos: [inquiryPhoto(FRONT_PHOTO, 1), inquiryPhoto(SIDE_PHOTO, 2)],
      files: ['inquiry photos/abc/front.jpg', 'inquiry photos/abc/side.PNG'],
    },
    failing,
  );
}

test('the inquiry photos are copied into the job media', async () => {
  const db = withPhotos();

  const result = await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  const job = db.tables.jobs[0];
  const jobId = job.id as string;
  const front = jobMediaPath(jobId, FRONT_PHOTO);
  const side = jobMediaPath(jobId, SIDE_PHOTO);
  assert.deepEqual(result, { outcome: 'accepted', job: { id: jobId, jobNumber: 'J-1001' } });
  assert.deepEqual(
    db.tables.job_media.map((row) => pick(row, ['job_id', 'kind', 'stage', 'storage_path'])),
    [
      { job_id: jobId, kind: 'photo', stage: 'before', storage_path: front },
      { job_id: jobId, kind: 'photo', stage: 'before', storage_path: side },
    ],
  );
  assert.ok(db.files.has(`job media/${front}`));
  assert.ok(db.files.has(`job media/${side}`));
  // The originals stay where they were.
  assert.ok(db.files.has('inquiry photos/abc/front.jpg'));
  assert.ok(db.files.has('inquiry photos/abc/side.PNG'));
  assert.equal(db.tables.inquiries[0].status, 'converted');
});

test('an inquiry with no photos is accepted without any job media', async () => {
  const db = fakeDatabase({ inquiries: [inquiry()] });

  const result = await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(result.outcome, 'accepted');
  assert.equal(db.tables.job_media.length, 0);
});

test('accepting twice does not copy the photos twice', async () => {
  const db = withPhotos();
  const backend = createAcceptInquiryBackend(db.client);

  await backend.acceptInquiry(INQUIRY_ID);
  await backend.acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.job_media.length, 2);
  assert.equal(db.tables.jobs.length, 1);
});

test('a failed copy leaves the inquiry open, and a retry finishes the job', async () => {
  const failing = ['storage:copy'];
  const db = withPhotos(failing);
  const backend = createAcceptInquiryBackend(db.client);

  await assert.rejects(backend.acceptInquiry(INQUIRY_ID), /could not be copied/);
  assert.equal(db.tables.inquiries[0].status, 'new');
  assert.equal(db.tables.job_media.length, 0);

  failing.length = 0;
  const result = await backend.acceptInquiry(INQUIRY_ID);

  assert.equal(result.outcome, 'accepted');
  assert.equal(db.tables.jobs.length, 1);
  assert.equal(db.tables.job_media.length, 2);
  assert.equal(db.tables.inquiries[0].status, 'converted');
});

test('a file copied before a failed save is reused when the retry saves its row', async () => {
  const failing = ['job_media:insert'];
  const db = withPhotos(failing);
  const backend = createAcceptInquiryBackend(db.client);

  await assert.rejects(backend.acceptInquiry(INQUIRY_ID), /Job media could not be saved/);
  assert.equal(db.tables.job_media.length, 0);

  failing.length = 0;
  await backend.acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.job_media.length, 2);
  assert.equal(db.tables.inquiries[0].status, 'converted');
});

test('jobMediaPath keeps the file extension in lower case and tolerates none', () => {
  assert.equal(jobMediaPath('job-1', SIDE_PHOTO), `job-1/before/inquiry-${SECOND_PHOTO_ID}.png`);
  assert.equal(
    jobMediaPath('job-1', { id: PHOTO_ID, storage_path: 'abc/noextension' }),
    `job-1/before/inquiry-${PHOTO_ID}`,
  );
});

test('if another Accept creates the job first, that job is used and our new customer is removed', async () => {
  const db = fakeDatabase({ inquiries: [inquiry()] }, [], {
    beforeInsert: (table, tables) => {
      // Simulates a second owner finishing between our lookup and our insert.
      if (table !== 'jobs' || tables.jobs.length > 0) return;
      tables.customers.push(
        customer({ id: 'customer-winner', email: 'winner@example.com', phone: null }),
      );
      tables.jobs.push({
        id: 'job-winner',
        job_number: 'J-1999',
        customer_id: 'customer-winner',
        inquiry_id: INQUIRY_ID,
        created_at: '2026-11-10T00:00:00.000Z',
      });
    },
  });

  const result = await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.deepEqual(result, {
    outcome: 'accepted',
    job: { id: 'job-winner', jobNumber: 'J-1999' },
  });
  assert.equal(db.tables.jobs.length, 1);
  assert.deepEqual(
    db.tables.customers.map((row) => row.id),
    ['customer-winner'],
  );
  assert.deepEqual(pick(db.tables.inquiries[0], ['status', 'customer_id']), {
    status: 'converted',
    customer_id: 'customer-winner',
  });
});

test('a linked customer who was deleted is not used, and a new customer is created', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry({ customer_id: 'customer-linked' })],
    customers: [
      customer({
        id: 'customer-linked',
        email: 'other@example.com',
        phone: null,
        deleted_at: '2026-06-01T00:00:00.000Z',
      }),
    ],
  });

  await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 2);
  assert.notEqual(db.tables.jobs[0].customer_id, 'customer-linked');
});

test('a deleted linked customer falls back to an active customer with the same email', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry({ customer_id: 'customer-linked' })],
    customers: [
      customer(),
      customer({
        id: 'customer-linked',
        email: 'other@example.com',
        phone: null,
        deleted_at: '2026-06-01T00:00:00.000Z',
      }),
    ],
  });

  await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.equal(db.tables.customers.length, 2);
  assert.equal(db.tables.jobs[0].customer_id, 'customer-existing');
});

test('a declined inquiry is not accepted even if a stray job points at it', async () => {
  const db = fakeDatabase({
    inquiries: [inquiry({ status: 'closed' })],
    customers: [customer()],
    jobs: [
      {
        id: 'job-stray',
        job_number: 'J-1500',
        customer_id: 'customer-existing',
        inquiry_id: INQUIRY_ID,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  });

  const result = await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.deepEqual(result, { outcome: 'not-acceptable', status: 'closed' });
  assert.equal(db.tables.inquiries[0].status, 'closed');
  assert.equal(db.tables.jobs.length, 1);
});

test('an inquiry marked accepted but with no job cannot be accepted', async () => {
  const db = fakeDatabase({ inquiries: [inquiry({ status: 'converted' })] });

  const result = await createAcceptInquiryBackend(db.client).acceptInquiry(INQUIRY_ID);

  assert.deepEqual(result, { outcome: 'not-acceptable', status: 'converted' });
  assert.equal(db.tables.jobs.length, 0);
});
