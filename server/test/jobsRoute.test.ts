import { test } from 'vitest';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { JobBackend, JobListOptions, JobPage } from '../src/jobs.js';
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

// Records every list request and answers with a page or an error.
function fakeJobs(answer: JobPage | Error) {
  const calls: JobListOptions[] = [];
  const backend: JobBackend = {
    listJobs: async (options) => {
      calls.push(options);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return { backend, calls };
}

const page: JobPage = {
  jobs: [
    {
      id: 'job-uuid',
      jobNumber: 'J-1001',
      customerName: 'Margaret Lewis',
      item: 'Dining table',
      jobType: 'Repair',
      status: 'in_progress',
      startDate: '2026-11-01',
      dueDate: '2026-11-20',
    },
  ],
  total: 1,
};

test('an owner gets the jobs list with paging details', async () => {
  const { backend, calls } = fakeJobs(page);
  const response = await request(
    createApp(config, authBackend('owner'), undefined, { jobs: backend }),
  )
    .get('/api/jobs?status=in_progress&q=lewis')
    .set('Authorization', 'Bearer valid')
    .expect(200);

  assert.deepEqual(response.body, { ...page, page: 1, pageSize: 10 });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(calls, [{ page: 1, pageSize: 10, status: 'in_progress', search: 'lewis' }]);
});

test('an employee can read the jobs list too', async () => {
  const { backend } = fakeJobs(page);
  await request(createApp(config, authBackend('employee'), undefined, { jobs: backend }))
    .get('/api/jobs')
    .set('Authorization', 'Bearer valid')
    .expect(200);
});

test('a request without a valid token gets 401 and nothing is read', async () => {
  const { backend, calls } = fakeJobs(page);
  const app = createApp(config, authBackend('owner'), undefined, { jobs: backend });
  await request(app).get('/api/jobs').expect(401);
  await request(app).get('/api/jobs').set('Authorization', 'Bearer invalid').expect(401);
  assert.deepEqual(calls, []);
});

test('bad query values are a 400 and never reach the backend', async () => {
  const { backend, calls } = fakeJobs(page);
  const app = createApp(config, authBackend('owner'), undefined, { jobs: backend });
  for (const path of [
    '/api/jobs?status=planning',
    '/api/jobs?page=0',
    '/api/jobs?pageSize=100',
    '/api/jobs?q=a&q=b',
  ]) {
    await request(app).get(path).set('Authorization', 'Bearer valid').expect(400);
  }
  assert.deepEqual(calls, []);
});

test('a backend failure is a 503 that does not leak the cause', async () => {
  const { backend } = fakeJobs(new Error('password authentication failed for user postgres'));
  const response = await request(
    createApp(config, authBackend('owner'), undefined, { jobs: backend }),
  )
    .get('/api/jobs')
    .set('Authorization', 'Bearer valid')
    .expect(503);
  assert.doesNotMatch(JSON.stringify(response.body), /password|postgres/);
});

test('the route answers 503 when no jobs backend is configured', async () => {
  await request(createApp(config, authBackend('owner')))
    .get('/api/jobs')
    .set('Authorization', 'Bearer valid')
    .expect(503);
});
