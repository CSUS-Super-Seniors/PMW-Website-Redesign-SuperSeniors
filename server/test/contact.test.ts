import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { ContactMessageData } from '@pmw/validation';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { SavedContactMessage } from '../src/contact.js';

const input = {
  name: 'Christine',
  email: 'christine@example.com',
  message: 'Do you repair desks?',
};
const path = '/api/contact-messages';
const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});

function setup(enabled = true) {
  const auth = {
    verifyToken: vi.fn(async () => ({ id: 'visitor' })),
    loadProfile: vi.fn(async () => ({ role: 'employee', status: 'active' })),
  };
  const rows: SavedContactMessage[] = [];
  const contact = {
    saveMessage: vi.fn(async (data: ContactMessageData) => {
      const row = { ...data, id: 'message-1', created_at: '2026-10-29T12:00:00Z' };
      rows.push(row);
      return row;
    }),
    sendNotification: vi.fn(async (_message: SavedContactMessage) => {
      void _message;
    }),
  };
  return { app: createApp(config, auth, enabled ? contact : undefined), auth, contact, rows };
}

describe('POST /api/contact-messages', () => {
  it('saves before emailing and accepts visitors without authentication', async () => {
    const { app, auth, contact, rows } = setup();
    contact.sendNotification.mockImplementationOnce(async (message) => {
      expect(rows).toEqual([message]);
    });
    const response = await request(app)
      .post(path)
      .set('Origin', 'http://localhost:5173')
      .send({ ...input, name: ' Christine ', email: ' christine@example.com ', phone: ' ' })
      .expect(201);
    expect(response.body).toEqual({ success: true });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(contact.saveMessage).toHaveBeenCalledExactlyOnceWith({ ...input, phone: null });
    expect(contact.sendNotification).toHaveBeenCalledExactlyOnceWith(rows[0]);
    expect(auth.verifyToken).not.toHaveBeenCalled();
    expect(auth.loadProfile).not.toHaveBeenCalled();
    expect(response.text).not.toContain(input.email);
    expect(response.text).not.toContain('message-1');
  });

  it.each([
    { name: 'Todd', phone: '(916) 555-0123', message: 'Please call me.' },
    { ...input, phone: '+1 916 555 0123' },
    { ...input, email: null, phone: '9165550123' },
  ])('accepts valid email-only, phone-only, or both contacts: %j', async (body) => {
    const { app, contact } = setup();
    await request(app).post(path).send(body).expect(201);
    expect(contact.saveMessage).toHaveBeenCalledTimes(1);
  });

  it.each([
    {},
    { ...input, name: '' },
    { ...input, name: '   ' },
    { ...input, name: null },
    { ...input, name: 42 },
    { ...input, name: 'a'.repeat(101) },
    { ...input, message: '' },
    { ...input, message: '  ' },
    { ...input, message: false },
    { ...input, message: 'a'.repeat(5001) },
    { ...input, email: undefined },
    { ...input, email: '', phone: '  ' },
    { ...input, email: null, phone: null },
    { ...input, email: 'invalid' },
    { ...input, email: 'a'.repeat(250) + '@example.com' },
    { ...input, email: ['christine@example.com'] },
    { ...input, phone: 'not-a-phone' },
    { ...input, phone: '9'.repeat(33) },
    { ...input, phone: 9165550123 },
    { ...input, phone: '9165550123', email: 'invalid' },
    { ...input, created_at: '1999-01-01' },
    { ...input, id: 'client-controlled' },
    { ...input, to: 'attacker@example.com' },
  ])('rejects invalid or extra fields without saving or emailing: %j', async (body) => {
    const { app, contact } = setup();
    const response = await request(app).post(path).send(body).expect(400);
    expect(response.body.success).toBe(false);
    expect(response.body.fieldErrors).toBeDefined();
    expect(response.body.formErrors).toBeDefined();
    expect(contact.saveMessage).not.toHaveBeenCalled();
    expect(contact.sendNotification).not.toHaveBeenCalled();
  });

  it.each(['null', '[]', 'false', '123', '"text"', '{'])(
    'rejects invalid top-level JSON %s without saving',
    async (body) => {
      const { app, contact } = setup();
      await request(app).post(path).set('Content-Type', 'application/json').send(body).expect(400);
      expect(contact.saveMessage).not.toHaveBeenCalled();
      expect(contact.sendNotification).not.toHaveBeenCalled();
    },
  );

  it('rejects missing bodies and non-JSON submissions', async () => {
    const { app, contact } = setup();
    await request(app).post(path).expect(400);
    await request(app).post(path).type('form').send(input).expect(400);
    expect(contact.saveMessage).not.toHaveBeenCalled();
  });

  it('rejects oversized requests and unlisted origins before saving', async () => {
    const { app, contact } = setup();
    await request(app)
      .post(path)
      .send({ ...input, message: 'a'.repeat(33 * 1024) })
      .expect(413);
    await request(app).post(path).set('Origin', 'https://evil.example').send(input).expect(403);
    expect(contact.saveMessage).not.toHaveBeenCalled();
    expect(contact.sendNotification).not.toHaveBeenCalled();
  });

  it('returns 503 without saving when contact email is not configured', async () => {
    const { app, contact } = setup(false);
    const response = await request(app).post(path).send(input).expect(503);
    expect(response.body.success).toBe(false);
    expect(contact.saveMessage).not.toHaveBeenCalled();
  });

  it('reports a database failure without attempting email or exposing private errors', async () => {
    const { app, contact, rows } = setup();
    contact.saveMessage.mockRejectedValueOnce(new Error('private database detail test-secret'));
    const response = await request(app).post(path).send(input).expect(503);
    expect(response.body.success).toBe(false);
    expect(response.text).not.toMatch(/private|test-secret/);
    expect(rows).toHaveLength(0);
    expect(contact.sendNotification).not.toHaveBeenCalled();
  });

  it('reports email failure while preserving the saved message', async () => {
    const { app, contact, rows } = setup();
    contact.sendNotification.mockRejectedValueOnce(new Error('private Resend API key'));
    const response = await request(app).post(path).send(input).expect(502);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('saved');
    expect(response.text).not.toMatch(/private|API key/);
    expect(rows).toHaveLength(1);
    expect(contact.saveMessage).toHaveBeenCalledTimes(1);
  });

  it('does not expose a public message listing or detail route', async () => {
    const { app, contact } = setup();
    await request(app).get(path).expect(401);
    await request(app).get(`${path}/message-1`).expect(401);
    expect(contact.saveMessage).not.toHaveBeenCalled();
  });
});
