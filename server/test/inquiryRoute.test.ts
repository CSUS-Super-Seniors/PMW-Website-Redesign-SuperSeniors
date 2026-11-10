import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { AcceptInquiryResult, InquiryBackend } from '../src/inquiries.js';
import type { AuthBackend } from '../src/supabase.js';

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});

const inquiryId = '5eed0003-0000-4000-8000-000000001048';
const acceptPath = `/api/inquiries/${inquiryId}/accept`;

function authBackend(role = 'owner'): AuthBackend {
  return {
    verifyToken: async (token) => (token === 'valid' ? { id: 'user-1' } : null),
    loadProfile: async () => ({ role, status: 'active' }),
  };
}

// Records every id it is asked to accept, and answers with a result or an error.
function fakeInquiries(answer: AcceptInquiryResult | Error) {
  const calls: string[] = [];
  const backend: InquiryBackend = {
    acceptInquiry: async (id) => {
      calls.push(id);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return { backend, calls };
}

const accepted: AcceptInquiryResult = {
  outcome: 'accepted',
  job: { id: 'job-uuid', jobNumber: 'J-1001' },
};

test('owner accepts an inquiry and gets the new job back', async () => {
  const { backend, calls } = fakeInquiries(accepted);
  const response = await request(
    createApp(config, authBackend('owner'), undefined, { inquiries: backend }),
  )
    .post(acceptPath)
    .set('Authorization', 'Bearer valid')
    .expect(200);

  assert.deepEqual(response.body, { job: { id: 'job-uuid', jobNumber: 'J-1001' } });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(calls, [inquiryId]);
});

test('an employee is refused and nothing is accepted', async () => {
  const { backend, calls } = fakeInquiries(accepted);
  await request(createApp(config, authBackend('employee'), undefined, { inquiries: backend }))
    .post(acceptPath)
    .set('Authorization', 'Bearer valid')
    .expect(403);
  assert.deepEqual(calls, []);
});

test('a request without a valid token gets 401 and nothing is accepted', async () => {
  const { backend, calls } = fakeInquiries(accepted);
  const app = createApp(config, authBackend('owner'), undefined, { inquiries: backend });
  await request(app).post(acceptPath).expect(401);
  await request(app).post(acceptPath).set('Authorization', 'Bearer invalid').expect(401);
  assert.deepEqual(calls, []);
});

test('an id that is not a UUID is a 404 and never reaches the backend', async () => {
  const { backend, calls } = fakeInquiries(accepted);
  await request(createApp(config, authBackend('owner'), undefined, { inquiries: backend }))
    .post('/api/inquiries/INQ-1048/accept')
    .set('Authorization', 'Bearer valid')
    .expect(404);
  assert.deepEqual(calls, []);
});

test('an inquiry that does not exist is a 404', async () => {
  const { backend } = fakeInquiries({ outcome: 'not-found' });
  await request(createApp(config, authBackend('owner'), undefined, { inquiries: backend }))
    .post(acceptPath)
    .set('Authorization', 'Bearer valid')
    .expect(404);
});

test('an inquiry that was already declined is a 409', async () => {
  const { backend } = fakeInquiries({ outcome: 'not-acceptable', status: 'closed' });
  const response = await request(
    createApp(config, authBackend('owner'), undefined, { inquiries: backend }),
  )
    .post(acceptPath)
    .set('Authorization', 'Bearer valid')
    .expect(409);
  assert.match(response.body.error, /already accepted or declined/);
});

test('a backend failure is a 503 that does not leak the cause, and is logged', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { backend } = fakeInquiries(
      new Error('password authentication failed for user postgres'),
    );
    const response = await request(
      createApp(config, authBackend('owner'), undefined, { inquiries: backend }),
    )
      .post(acceptPath)
      .set('Authorization', 'Bearer valid')
      .expect(503);

    assert.ok(!response.text.includes('postgres'));
    assert.equal(logged.mock.calls.length, 1);
    assert.deepEqual(logged.mock.calls[0], [
      'Accept inquiry failed',
      { inquiryId, reason: 'password authentication failed for user postgres' },
    ]);
  } finally {
    logged.mockRestore();
  }
});

test('accepting is a 503 when no inquiry backend is configured', async () => {
  await request(createApp(config, authBackend('owner')))
    .post(acceptPath)
    .set('Authorization', 'Bearer valid')
    .expect(503);
});
