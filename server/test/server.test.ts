import { test } from 'vitest';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { AuthBackend } from '../src/supabase.js';
const env = {
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
};
const config = loadConfig(env);
function backend(role = 'employee', status = 'active'): AuthBackend {
  return {
    verifyToken: async (token) => (token === 'valid' ? { id: 'user-1' } : null),
    loadProfile: async () => ({ role, status }),
  };
}
test('health responds with Helmet headers and no secrets', async () => {
  const response = await request(createApp(config, backend())).get('/api/health').expect(200);
  assert.deepEqual(response.body, { status: 'ok' });
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.ok(!response.text.includes('test-secret'));
});
test('CORS allows listed origin and preflight', async () => {
  const app = createApp(config, backend());
  const response = await request(app)
    .get('/api/health')
    .set('Origin', env.CLIENT_ORIGINS)
    .expect(200);
  assert.equal(response.headers['access-control-allow-origin'], env.CLIENT_ORIGINS);
  await request(app)
    .options('/api/me')
    .set('Origin', env.CLIENT_ORIGINS)
    .set('Access-Control-Request-Method', 'GET')
    .expect(204);
});
test('CORS rejects unlisted origins before route handlers', async () => {
  const response = await request(createApp(config, backend()))
    .get('/api/health')
    .set('Origin', 'https://evil.example')
    .expect(403);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
});
test('missing, malformed and invalid tokens get 401', async () => {
  const app = createApp(config, backend());
  await request(app).get('/api/me').expect(401);
  for (const header of ['Basic valid', 'Bearer invalid', 'Bearer valid extra'])
    await request(app).get('/api/me').set('Authorization', header).expect(401);
});
test('employee cannot access owner route', async () => {
  await request(createApp(config, backend()))
    .get('/api/owner/check')
    .set('Authorization', 'Bearer valid')
    .expect(403);
});
test('employee is refused on every owner-only area', async () => {
  const app = createApp(config, backend('employee'));
  for (const path of [
    '/api/customers',
    '/api/reports',
    '/api/staff',
    '/api/inquiries',
    '/api/testimonials',
  ]) {
    await request(app).get(path).set('Authorization', 'Bearer valid').expect(403);
  }
});
test('employee can reach schedule, job detail and photo upload', async () => {
  const app = createApp(config, backend('employee'));
  await request(app).get('/api/schedule').set('Authorization', 'Bearer valid').expect(501);
  await request(app).get('/api/jobs/J-1001').set('Authorization', 'Bearer valid').expect(501);
  await request(app)
    .post('/api/jobs/J-1001/media')
    .set('Authorization', 'Bearer valid')
    .expect(501);
});
test('owner can access owner route and staff context is attached', async () => {
  const app = createApp(config, backend('owner'));
  await request(app).get('/api/owner/check').set('Authorization', 'Bearer valid').expect(200);
  const response = await request(app)
    .get('/api/me')
    .set('Authorization', 'Bearer valid')
    .expect(200);
  assert.deepEqual(response.body, { userId: 'user-1', role: 'owner', status: 'active' });
});
test('inactive, unknown role and missing profiles are denied', async () => {
  for (const b of [
    backend('employee', 'inactive'),
    backend('admin'),
    { ...backend(), loadProfile: async () => null },
  ]) {
    await request(createApp(config, b))
      .get('/api/me')
      .set('Authorization', 'Bearer valid')
      .expect(403);
  }
});
test('backend failures return sanitized 503', async () => {
  const b = {
    ...backend(),
    loadProfile: async () => {
      throw new Error('private detail');
    },
  };
  const response = await request(createApp(config, b))
    .get('/api/me')
    .set('Authorization', 'Bearer valid')
    .expect(503);
  assert.ok(!response.text.includes('private detail'));
});
test('configuration fails clearly for missing or invalid values', () => {
  assert.throws(() => loadConfig({}), /Missing required environment variables/);
  assert.throws(() => loadConfig({ ...env, PORT: '0' }), /PORT/);
  assert.throws(() => loadConfig({ ...env, CLIENT_ORIGINS: '*' }), /CLIENT_ORIGINS/);
  assert.throws(() => loadConfig({ ...env, SUPABASE_URL: 'bad' }), /SUPABASE_URL/);
});
test('malformed JSON is sanitized and routes stay under api', async () => {
  const app = createApp(config, backend());
  await request(app).post('/api/me').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).get('/health').expect(404);
});
