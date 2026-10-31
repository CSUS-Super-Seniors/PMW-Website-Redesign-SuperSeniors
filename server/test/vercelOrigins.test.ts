import { test, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { withVercelOrigins } from '../src/vercelOrigins.js';

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});
const env = {
  VERCEL_URL: 'pmw-deployment.vercel.app',
  VERCEL_BRANCH_URL: 'pmw-git-preview.vercel.app',
  VERCEL_PROJECT_PRODUCTION_URL: 'pmw.vercel.app',
};
const backend = {
  verifyToken: async () => null,
  loadProfile: async () => null,
};

test.each(Object.values(env))('allows exact Vercel origin %s', async (host) => {
  const app = createApp(withVercelOrigins(config, env), backend);
  const origin = `https://${host}`;
  const response = await request(app).get('/api/health').set('Origin', origin).expect(200);
  expect(response.headers['access-control-allow-origin']).toBe(origin);
  await request(app)
    .options('/api/estimates/validate-step-1')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .expect(204);
});

test('rejects unrelated origins, including other Vercel deployments', async () => {
  const app = createApp(withVercelOrigins(config, env), backend);
  for (const origin of ['https://evil.example', 'https://unrelated.vercel.app']) {
    const response = await request(app).get('/api/health').set('Origin', origin).expect(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  }
});

test('preserves configured origins without mutating config and ignores blank hosts', () => {
  const result = withVercelOrigins(config, { VERCEL_URL: '  ' });
  expect(result).toEqual(config);
  expect(result.clientOrigins).not.toBe(config.clientOrigins);
  expect(withVercelOrigins(config, {}).clientOrigins).toEqual(config.clientOrigins);
});

test('deduplicates deployment aliases', () => {
  const result = withVercelOrigins(config, {
    VERCEL_URL: 'pmw.vercel.app',
    VERCEL_BRANCH_URL: 'pmw.vercel.app',
  });
  expect(result.clientOrigins).toEqual(['http://localhost:5173', 'https://pmw.vercel.app']);
  expect(config.clientOrigins).toEqual(['http://localhost:5173']);
});
