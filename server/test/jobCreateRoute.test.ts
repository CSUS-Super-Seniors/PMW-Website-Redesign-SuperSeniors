import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { JobCreateData } from '@pmw/validation';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { CreateJobResult, JobCreateBackend } from '../src/jobCreate.js';
import type { AuthBackend } from '../src/supabase.js';

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});

function authBackend(role = 'owner'): AuthBackend {
  return {
    verifyToken: async (token) => (token === 'valid' ? { id: 'user-1' } : null),
    loadProfile: async () => ({ role, status: 'active' }),
  };
}

// Records every job it is asked to create, and answers with a result or an error.
function fakeJobs(answer: CreateJobResult | Error) {
  const calls: JobCreateData[] = [];
  const backend: JobCreateBackend = {
    createJob: async (input) => {
      calls.push(input);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return { backend, calls };
}

const created: CreateJobResult = {
  outcome: 'created',
  job: { id: 'job-uuid', jobNumber: 'J-1013' },
};
const customerId = '5eed0001-0000-4000-8000-000000000001';
const valid = {
  customer_id: customerId,
  item: 'Dining chairs',
  start_date: '2026-10-12',
  due_date: '2026-10-20',
};

function postJob(backend: JobCreateBackend | undefined, body: unknown, role = 'owner') {
  return request(createApp(config, authBackend(role), undefined, { jobCreate: backend }))
    .post('/api/jobs')
    .set('Authorization', 'Bearer valid')
    .send(body as object);
}

beforeEach(() => {
  // Only the clock is faked. "Today" is October 1, 2026, 11 AM in Sacramento.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T18:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('POST /api/jobs', () => {
  it('lets an owner create a job and returns its number', async () => {
    const { backend, calls } = fakeJobs(created);
    const response = await postJob(backend, { ...valid, item: '  Dining chairs ' }).expect(201);

    expect(response.body).toEqual({ job: { id: 'job-uuid', jobNumber: 'J-1013' } });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(calls).toEqual([
      {
        customer_id: customerId,
        item: 'Dining chairs',
        job_type: null,
        status: 'scheduled',
        start_date: '2026-10-12',
        due_date: '2026-10-20',
        notes: null,
        lead_source: null,
        estimated_hours: null,
      },
    ]);
  });

  it('refuses an employee and creates nothing', async () => {
    const { backend, calls } = fakeJobs(created);
    await postJob(backend, valid, 'employee').expect(403);
    expect(calls).toEqual([]);
  });

  it('refuses a request without a valid token', async () => {
    const { backend, calls } = fakeJobs(created);
    const app = createApp(config, authBackend(), undefined, { jobCreate: backend });
    await request(app).post('/api/jobs').send(valid).expect(401);
    await request(app)
      .post('/api/jobs')
      .set('Authorization', 'Bearer nope')
      .send(valid)
      .expect(401);
    expect(calls).toEqual([]);
  });

  it('refuses invalid input with a message for each field', async () => {
    const { backend, calls } = fakeJobs(created);
    const response = await postJob(backend, { item: ' ', estimated_hours: -1 }).expect(400);

    expect(response.body).toEqual({
      error: 'Please check the job form.',
      fieldErrors: {
        customer_id: 'Customer is required.',
        item: 'Item is required.',
        estimated_hours: 'Estimated hours cannot be negative.',
      },
      formErrors: [],
    });
    expect(calls).toEqual([]);
  });

  it('refuses fields the form does not have, such as a job number', async () => {
    const { backend, calls } = fakeJobs(created);
    const response = await postJob(backend, { ...valid, job_number: 'J-9999' }).expect(400);
    expect(response.body.formErrors).toEqual(['Some job fields are not recognized.']);
    expect(calls).toEqual([]);
  });

  it('refuses a body that is not JSON', async () => {
    const { backend, calls } = fakeJobs(created);
    await request(createApp(config, authBackend(), undefined, { jobCreate: backend }))
      .post('/api/jobs')
      .set('Authorization', 'Bearer valid')
      .set('Content-Type', 'application/json')
      .send('{"item":')
      .expect(400);
    expect(calls).toEqual([]);
  });

  it('refuses a start date before today and accepts today', async () => {
    const { backend, calls } = fakeJobs(created);
    const response = await postJob(backend, { ...valid, start_date: '2026-09-30' }).expect(400);
    expect(response.body.fieldErrors).toEqual({ start_date: 'Start date cannot be in the past.' });
    expect(calls).toEqual([]);

    await postJob(backend, { ...valid, start_date: '2026-10-01', due_date: null }).expect(201);
    expect(calls).toHaveLength(1);
  });

  it('counts today by the Sacramento date, not the server clock', async () => {
    const { backend } = fakeJobs(created);
    const startsYesterday = { ...valid, start_date: '2026-10-01', due_date: null };

    // 11:59 PM on October 1 in Sacramento, but already October 2 in UTC.
    vi.setSystemTime(new Date('2026-10-02T06:59:00Z'));
    await postJob(backend, startsYesterday).expect(201);

    // One minute later it is October 2 in Sacramento, so October 1 is in the past.
    vi.setSystemTime(new Date('2026-10-02T07:00:00Z'));
    await postJob(backend, startsYesterday).expect(400);
  });

  it('points at the customer field when the customer does not exist', async () => {
    const { backend } = fakeJobs({ outcome: 'customer-not-found' });
    const response = await postJob(backend, valid).expect(400);
    expect(response.body.fieldErrors).toEqual({ customer_id: 'Choose a customer from the list.' });
  });

  it('answers 409 with the other job when there is a time conflict', async () => {
    const conflict = {
      jobNumber: 'J-1002',
      customerName: 'Robert Chen',
      item: 'Oak dining table',
      date: '2026-10-12',
    };
    const { backend } = fakeJobs({ outcome: 'time-conflict', conflict });
    const response = await postJob(backend, valid).expect(409);
    expect(response.body).toEqual({ error: 'Time conflict with another job.', conflict });
  });

  it('answers 503 without leaking database details when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { backend } = fakeJobs(new Error('connection to db.secret.example refused'));
    const response = await postJob(backend, valid).expect(503);
    expect(response.text).not.toContain('secret');
    expect(response.body.error).toBe('The job could not be saved. Please try again.');
  });

  it('answers 503 when no backend is configured', async () => {
    await postJob(undefined, valid).expect(503);
  });
});
