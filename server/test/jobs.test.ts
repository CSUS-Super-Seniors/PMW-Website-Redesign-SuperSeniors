import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createJobBackend, jobSearchFilter, parseJobListQuery } from '../src/jobs.js';

describe('parseJobListQuery', () => {
  it('uses defaults when nothing is given', () => {
    expect(parseJobListQuery({})).toEqual({
      ok: true,
      page: 1,
      pageSize: 10,
      status: null,
      search: null,
    });
  });

  it('reads a status, a search and paging', () => {
    expect(
      parseJobListQuery({
        status: 'in_progress',
        q: '  Margaret   Lewis ',
        page: '2',
        pageSize: '5',
      }),
    ).toEqual({ ok: true, page: 2, pageSize: 5, status: 'in_progress', search: 'Margaret Lewis' });
  });

  it('treats a blank search as no search', () => {
    expect(parseJobListQuery({ q: '   ' })).toMatchObject({ ok: true, search: null });
  });

  it.each([
    { status: 'planning' },
    { status: ['scheduled'] },
    { page: '0' },
    { page: 'abc' },
    { pageSize: '4' },
    { pageSize: '21' },
    { q: ['a', 'b'] },
    { q: 'a'.repeat(101) },
    { q: 'bad\u0000text' },
  ])('refuses %o', (query) => {
    expect(parseJobListQuery(query)).toMatchObject({ ok: false });
  });
});

describe('jobSearchFilter', () => {
  const id = '00000000-0000-4000-8000-000000000001';

  it('searches item, job type and job number, plus matching customers', () => {
    expect(jobSearchFilter('repair', [id])).toBe(
      `item.ilike."%repair%",job_type.ilike."%repair%",job_number.ilike."%repair%",customer_id.in.(${id})`,
    );
  });

  it('keeps commas and parentheses inside the quotes so they cannot add filters', () => {
    const filter = jobSearchFilter('a),status.eq.x', []);
    expect(filter).toBe(
      'item.ilike."%a),status.eq.x%",job_type.ilike."%a),status.eq.x%",job_number.ilike."%a),status.eq.x%"',
    );
  });

  it('escapes LIKE wildcards, backslashes and quotes', () => {
    expect(jobSearchFilter('50%_"', []).split(',')[0]).toBe(String.raw`item.ilike."%50\\%\\_\"%"`);
  });

  it('drops customer ids that are not uuids', () => {
    expect(jobSearchFilter('x', ['1),status.eq.x'])).not.toContain('customer_id');
  });
});

type Answer = {
  data: unknown;
  error: { code: string; message: string } | null;
  count: number | null;
};

// Records every chained call and answers each `from(table)` with the next queued
// answer for that table (the last one repeats).
function fakeClient(answers: Record<string, Answer[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    const queue = answers[table];
    if (!queue) throw new Error(`Unexpected table ${table}`);
    const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
    const builder: object = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === 'then') {
            return (resolve: (value: Answer) => unknown) => Promise.resolve(answer).then(resolve);
          }
          return (...args: unknown[]) => {
            calls.push({ table, method: String(property), args });
            return builder;
          };
        },
      },
    );
    return builder;
  });
  const backend = createJobBackend({ from } as unknown as Pick<SupabaseClient, 'from'>);
  return { backend, calls };
}

const customerId = '00000000-0000-4000-8000-0000000000c1';

const jobRows = [
  {
    id: '00000000-0000-4000-8000-000000000002',
    job_number: 'J-1002',
    item: 'Dining table',
    job_type: 'Repair',
    status: 'in_progress',
    scheduled_date: '2026-11-01',
    customers: { first_name: 'Margaret', last_name: 'Lewis' },
    job_steps: [
      { position: 2, due_date: '2026-11-20' },
      { position: 1, due_date: '2026-11-05' },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000000001',
    job_number: 'J-1001',
    item: 'Bookshelf',
    job_type: null,
    status: 'scheduled',
    scheduled_date: null,
    customers: { first_name: 'Sam', last_name: 'Cho' },
    job_steps: [],
  },
];

const defaults = { page: 1, pageSize: 10, status: null, search: null };

describe('job backend', () => {
  it('maps rows and takes the due date from the last checklist step', async () => {
    const { backend } = fakeClient({ jobs: [{ data: jobRows, error: null, count: 2 }] });
    const { jobs, total } = await backend.listJobs(defaults);

    expect(total).toBe(2);
    expect(jobs).toEqual([
      {
        id: jobRows[0]!.id,
        jobNumber: 'J-1002',
        customerName: 'Margaret Lewis',
        item: 'Dining table',
        jobType: 'Repair',
        status: 'in_progress',
        startDate: '2026-11-01',
        dueDate: '2026-11-20',
      },
      {
        id: jobRows[1]!.id,
        jobNumber: 'J-1001',
        customerName: 'Sam Cho',
        item: 'Bookshelf',
        jobType: null,
        status: 'scheduled',
        startDate: null,
        dueDate: null,
      },
    ]);
  });

  it('orders newest first with an id tiebreaker and asks for the right rows', async () => {
    const { backend, calls } = fakeClient({ jobs: [{ data: [], error: null, count: 0 }] });
    await backend.listJobs({ ...defaults, page: 3, pageSize: 5 });

    expect(calls.filter((call) => call.method === 'order').map((call) => call.args)).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(calls.find((call) => call.method === 'range')?.args).toEqual([10, 14]);
    expect(calls.some((call) => call.table === 'customers')).toBe(false);
  });

  it('filters by status', async () => {
    const { backend, calls } = fakeClient({ jobs: [{ data: [], error: null, count: 0 }] });
    await backend.listJobs({ ...defaults, status: 'completed' });
    expect(calls.find((call) => call.method === 'eq')?.args).toEqual(['status', 'completed']);
  });

  it('searches jobs and customers, and each name word must match', async () => {
    const { backend, calls } = fakeClient({
      customers: [{ data: [{ id: customerId }], error: null, count: null }],
      jobs: [{ data: jobRows.slice(0, 1), error: null, count: 1 }],
    });
    const { total } = await backend.listJobs({ ...defaults, search: 'Margaret Lewis' });

    expect(total).toBe(1);
    const customerFilters = calls
      .filter((call) => call.table === 'customers' && call.method === 'or')
      .map((call) => call.args[0]);
    expect(customerFilters).toEqual([
      'first_name.ilike."%Margaret%",last_name.ilike."%Margaret%"',
      'first_name.ilike."%Lewis%",last_name.ilike."%Lewis%"',
    ]);
    const jobFilter = calls.find((call) => call.table === 'jobs' && call.method === 'or')?.args[0];
    expect(jobFilter).toContain('item.ilike."%Margaret Lewis%"');
    expect(jobFilter).toContain(`customer_id.in.(${customerId})`);
  });

  it('reports the real total when the page is past the end', async () => {
    const { backend } = fakeClient({
      jobs: [
        {
          data: null,
          error: { code: 'PGRST103', message: 'Requested range not satisfiable' },
          count: null,
        },
        { data: [], error: null, count: 3 },
      ],
    });
    expect(await backend.listJobs({ ...defaults, page: 9 })).toEqual({ jobs: [], total: 3 });
  });

  it('throws a generic error when the database fails', async () => {
    const { backend } = fakeClient({
      jobs: [{ data: null, error: { code: '42501', message: 'secret detail' }, count: null }],
    });
    await expect(backend.listJobs(defaults)).rejects.toThrow('Job list lookup failed');
  });

  it('throws when the customer lookup fails', async () => {
    const { backend } = fakeClient({
      customers: [{ data: null, error: { code: 'X', message: 'boom' }, count: null }],
      jobs: [{ data: [], error: null, count: 0 }],
    });
    await expect(backend.listJobs({ ...defaults, search: 'x' })).rejects.toThrow(
      'Customer search failed',
    );
  });
});
