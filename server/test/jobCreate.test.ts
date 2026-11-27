import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { jobCreateSchema } from '@pmw/validation';
import { DEFAULT_JOB_STEPS, createJobCreateBackend } from '../src/jobCreate.js';

type Answer = { data: unknown; error: { message: string } | null };
interface Call {
  table: string;
  action: 'select' | 'insert' | 'delete';
  payload?: unknown;
  filters: unknown[][];
}

interface Chain extends PromiseLike<Answer> {
  select(columns?: string): Chain;
  insert(payload: unknown): Chain;
  delete(): Chain;
  eq(column: string, value: unknown): Chain;
  is(column: string, value: unknown): Chain;
  in(column: string, values: unknown[]): Chain;
  order(column: string, options?: unknown): Chain;
  limit(count: number): Chain;
  maybeSingle(): Promise<Answer>;
  single(): Promise<Answer>;
}

// A stand-in for the Supabase client. `answers` maps "table:action" to what that call
// returns, and every call is recorded so the tests can check what was sent.
function fakeClient(answers: Record<string, Answer | undefined>) {
  const calls: Call[] = [];
  const client = {
    from(table: string): Chain {
      const call: Call = { table, action: 'select', filters: [] };
      calls.push(call);
      const answer = () =>
        Promise.resolve(answers[`${table}:${call.action}`] ?? { data: null, error: null });
      const chain: Chain = {
        select: () => chain,
        insert: (payload) => {
          call.action = 'insert';
          call.payload = payload;
          return chain;
        },
        delete: () => {
          call.action = 'delete';
          return chain;
        },
        eq: (column, value) => {
          call.filters.push(['eq', column, value]);
          return chain;
        },
        is: (column, value) => {
          call.filters.push(['is', column, value]);
          return chain;
        },
        in: (column, values) => {
          call.filters.push(['in', column, values]);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: answer,
        single: answer,
        then(onfulfilled, onrejected) {
          return answer().then(onfulfilled, onrejected);
        },
      };
      return chain;
    },
  };
  return { client: client as unknown as Pick<SupabaseClient, 'from'>, calls };
}

const customerId = '5eed0001-0000-4000-8000-000000000001';
const fullJob = jobCreateSchema.parse({
  customer_id: customerId,
  item: 'Dining chairs',
  job_type: 'Repair',
  status: 'scheduled',
  start_date: '2026-10-12',
  due_date: '2026-10-20',
  notes: 'Loose joints.',
  lead_source: 'yelp',
  estimated_hours: 12.5,
});
const minimalJob = jobCreateSchema.parse({ customer_id: customerId, item: 'Dining chairs' });

const happyAnswers = {
  'customers:select': { data: { id: customerId, city: 'Carmichael' }, error: null },
  'jobs:select': { data: [], error: null },
  'jobs:insert': { data: { id: 'job-1', job_number: 'J-1013' }, error: null },
  'job_steps:insert': { data: null, error: null },
};

const find = (calls: Call[], table: string, action: Call['action']) =>
  calls.filter((call) => call.table === table && call.action === action);

describe('createJob', () => {
  it('saves the job and its three steps, with the due date on the last step', async () => {
    const { client, calls } = fakeClient(happyAnswers);
    const result = await createJobCreateBackend(client).createJob(fullJob);

    expect(result).toEqual({ outcome: 'created', job: { id: 'job-1', jobNumber: 'J-1013' } });
    expect(find(calls, 'jobs', 'insert')[0]!.payload).toEqual({
      customer_id: customerId,
      item: 'Dining chairs',
      job_type: 'Repair',
      status: 'scheduled',
      scheduled_date: '2026-10-12',
      notes: 'Loose joints.',
      lead_source: 'yelp',
      estimated_hours: 12.5,
      city: 'Carmichael',
    });
    expect(find(calls, 'job_steps', 'insert')[0]!.payload).toEqual([
      { job_id: 'job-1', body: DEFAULT_JOB_STEPS[0], position: 0, due_date: null },
      { job_id: 'job-1', body: DEFAULT_JOB_STEPS[1], position: 1, due_date: null },
      { job_id: 'job-1', body: DEFAULT_JOB_STEPS[2], position: 2, due_date: '2026-10-20' },
    ]);
  });

  it('only looks up customers that are not deleted', async () => {
    const { client, calls } = fakeClient(happyAnswers);
    await createJobCreateBackend(client).createJob(fullJob);
    expect(find(calls, 'customers', 'select')[0]!.filters).toEqual([
      ['eq', 'id', customerId],
      ['is', 'deleted_at', null],
    ]);
  });

  it('skips the conflict check and leaves every step undated when there are no dates', async () => {
    const { client, calls } = fakeClient(happyAnswers);
    await createJobCreateBackend(client).createJob(minimalJob);

    expect(find(calls, 'jobs', 'select')).toHaveLength(0);
    const steps = find(calls, 'job_steps', 'insert')[0]!.payload as { due_date: unknown }[];
    expect(steps.map((step) => step.due_date)).toEqual([null, null, null]);
    expect(find(calls, 'jobs', 'insert')[0]!.payload).toMatchObject({
      scheduled_date: null,
      job_type: null,
      notes: null,
      lead_source: null,
      estimated_hours: null,
    });
  });

  it('reports a customer that does not exist and saves nothing', async () => {
    const { client, calls } = fakeClient({
      ...happyAnswers,
      'customers:select': { data: null, error: null },
    });
    expect(await createJobCreateBackend(client).createJob(fullJob)).toEqual({
      outcome: 'customer-not-found',
    });
    expect(find(calls, 'jobs', 'insert')).toHaveLength(0);
  });

  it('reports a time conflict with the other job and saves nothing', async () => {
    const { client, calls } = fakeClient({
      ...happyAnswers,
      'jobs:select': {
        data: [
          {
            job_number: 'J-1002',
            item: 'Oak dining table',
            scheduled_date: '2026-10-12',
            customers: { first_name: 'Robert', last_name: 'Chen' },
          },
        ],
        error: null,
      },
    });

    expect(await createJobCreateBackend(client).createJob(fullJob)).toEqual({
      outcome: 'time-conflict',
      conflict: {
        jobNumber: 'J-1002',
        customerName: 'Robert Chen',
        item: 'Oak dining table',
        date: '2026-10-12',
      },
    });
    expect(find(calls, 'jobs', 'select')[0]!.filters).toEqual([
      ['eq', 'scheduled_date', '2026-10-12'],
      ['in', 'status', ['scheduled', 'in_progress']],
    ]);
    expect(find(calls, 'jobs', 'insert')).toHaveLength(0);
  });

  it('removes the job when its steps cannot be saved', async () => {
    const { client, calls } = fakeClient({
      ...happyAnswers,
      'job_steps:insert': { data: null, error: { message: 'database down' } },
    });
    await expect(createJobCreateBackend(client).createJob(fullJob)).rejects.toThrow(
      'Job steps could not be created',
    );
    expect(find(calls, 'jobs', 'delete')[0]!.filters).toEqual([['eq', 'id', 'job-1']]);
  });

  it('saves no steps when the job itself cannot be saved', async () => {
    const { client, calls } = fakeClient({
      ...happyAnswers,
      'jobs:insert': { data: null, error: { message: 'database down' } },
    });
    await expect(createJobCreateBackend(client).createJob(fullJob)).rejects.toThrow(
      'Job could not be created',
    );
    expect(find(calls, 'job_steps', 'insert')).toHaveLength(0);
  });

  it.each(['customers:select', 'jobs:select'])('fails when %s fails', async (key) => {
    const { client } = fakeClient({
      ...happyAnswers,
      [key]: { data: null, error: { message: 'database down' } },
    });
    await expect(createJobCreateBackend(client).createJob(fullJob)).rejects.toThrow();
  });
});

describe('listCustomerOptions', () => {
  it('lists customers that are not deleted, by name, with the city', async () => {
    const { client, calls } = fakeClient({
      'customers:select': {
        data: [
          { id: 'c1', first_name: 'Margaret', last_name: 'Lewis', city: 'Carmichael' },
          { id: 'c2', first_name: 'Robert', last_name: 'Chen', city: null },
        ],
        error: null,
      },
    });

    expect(await createJobCreateBackend(client).listCustomerOptions()).toEqual([
      { id: 'c1', name: 'Margaret Lewis', city: 'Carmichael' },
      { id: 'c2', name: 'Robert Chen', city: null },
    ]);
    expect(find(calls, 'customers', 'select')[0]!.filters).toEqual([['is', 'deleted_at', null]]);
  });

  it('returns an empty list when there are no customers', async () => {
    const { client } = fakeClient({ 'customers:select': { data: [], error: null } });
    expect(await createJobCreateBackend(client).listCustomerOptions()).toEqual([]);
  });

  it('fails when the lookup fails', async () => {
    const { client } = fakeClient({
      'customers:select': { data: null, error: { message: 'database down' } },
    });
    await expect(createJobCreateBackend(client).listCustomerOptions()).rejects.toThrow(
      'Customer options lookup failed',
    );
  });
});
