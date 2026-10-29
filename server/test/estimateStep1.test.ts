import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { EstimateStep1Input } from '@pmw/validation';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const validInput: EstimateStep1Input = {
  first_name: 'Zoë-Marie',
  last_name: "O'Connor 李",
  email: 'Zoe+repairs@example.com',
  phone: '+1 916 555 0142',
  address: '123 Main St',
  item: 'Dining chair',
  issue_type: 'loose_joints',
  description: 'The back leg wobbles.',
};
const path = '/api/estimates/validate-step-1';

function setup() {
  const backend = {
    verifyToken: vi.fn(() => Promise.reject(new Error('Authentication must not be called'))),
    loadProfile: vi.fn(() => Promise.reject(new Error('Profiles must not be loaded'))),
  };
  const app = createApp(
    loadConfig({
      CLIENT_ORIGINS: 'http://localhost:5173',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
    }),
    backend,
  );
  return { app, backend };
}

describe('POST /api/estimates/validate-step-1', () => {
  it('accepts a public request without authentication and only acknowledges validation', async () => {
    const { app, backend } = setup();
    const response = await request(app)
      .post(path)
      .set('Origin', 'http://localhost:5173')
      .send(validInput)
      .expect(200);
    expect(response.body).toEqual({ valid: true });
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(backend.verifyToken).not.toHaveBeenCalled();
    expect(backend.loadProfile).not.toHaveBeenCalled();
  });

  it('returns one string per invalid field without calling authentication', async () => {
    const { app, backend } = setup();
    const response = await request(app)
      .post(path)
      .send({ ...validInput, email: ' ', text_ok: 'false', issue_type: '' })
      .expect(400);
    expect(response.body).toEqual({
      valid: false,
      fieldErrors: {
        email: 'Email is required.',
        text_ok: 'Text message permission must be true or false.',
        issue_type: 'Select a problem from the list.',
      },
      formErrors: [],
    });
    expect(backend.verifyToken).not.toHaveBeenCalled();
    expect(backend.loadProfile).not.toHaveBeenCalled();
  });

  it('rejects unknown fields at form level', async () => {
    const { app } = setup();
    const response = await request(app)
      .post(path)
      .send({ ...validInput, preferred_contact: 'email' })
      .expect(400);
    expect(response.body).toEqual({
      valid: false,
      fieldErrors: {},
      formErrors: ['Some form fields are not recognized. Please refresh the page and try again.'],
    });
  });

  it.each(['null', '[]', '"text"', '123', 'false'])(
    'rejects top-level JSON %s at form level',
    async (body) => {
      const { app } = setup();
      const response = await request(app)
        .post(path)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(400);
      expect(response.body).toEqual({
        valid: false,
        fieldErrors: {},
        formErrors: ['Please provide the Step 1 form as a JSON object.'],
      });
    },
  );

  it('rejects a missing body at form level', async () => {
    const { app } = setup();
    const response = await request(app).post(path).expect(400);
    expect(response.body).toEqual({
      valid: false,
      fieldErrors: {},
      formErrors: ['Please provide the Step 1 form as a JSON object.'],
    });
  });

  it('keeps the existing malformed-JSON response', async () => {
    const { app } = setup();
    const response = await request(app)
      .post(path)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(response.body).toEqual({ error: 'Invalid JSON' });
  });

  it('keeps the existing 1 MB request limit and response', async () => {
    const { app } = setup();
    const response = await request(app)
      .post(path)
      .send({ ...validInput, description: 'a'.repeat(1024 * 1024) })
      .expect(413);
    expect(response.body).toEqual({ error: 'Request too large' });
  });

  it('retains strict parsing on existing routes', async () => {
    const { app } = setup();
    const response = await request(app)
      .post('/api/me')
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(400);
    expect(response.body).toEqual({ error: 'Invalid JSON' });
  });
});
