import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const db = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));

vi.mock('../src/supabase.js', () => ({
  createSupabaseAdmin: () => ({ from: db.from }),
  createAuthBackend: () => ({
    verifyToken: vi.fn(),
    loadProfile: vi.fn(),
  }),
}));

const input = {
  name: 'Test Visitor',
  email: 'visitor@example.com',
  message: 'Can you repair a desk?',
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('CLIENT_ORIGINS', 'https://site.example');
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-secret');
  vi.stubEnv('RESEND_API_KEY', 'test-email-key');
  vi.stubEnv('RESEND_FROM_EMAIL', 'contact@example.com');
  vi.stubEnv('CONTACT_OWNER_EMAILS', 'owner@example.com');
  db.from.mockReturnValue({ insert: db.insert });
  db.insert.mockReturnValue({ select: db.select });
  db.select.mockReturnValue({ single: db.single });
  db.single.mockResolvedValue({
    data: { id: 'message-1', created_at: '2026-10-30T12:00:00Z' },
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Vercel startup contact wiring', () => {
  it('saves and emails a valid submission through the exported app', async () => {
    const email = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: 'email-1' })));
    vi.stubGlobal('fetch', email);
    const { default: app } = await import('../../api/index.js');

    const response = await request(app)
      .post('/api/contact-messages')
      .set('Origin', 'https://site.example')
      .send(input)
      .expect(201);

    expect(response.body).toEqual({ success: true });
    expect(db.from).toHaveBeenCalledWith('contact_messages');
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining(input));
    expect(email).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(String(email.mock.calls[0]?.[1]?.body));
    expect(body.to).toEqual(['owner@example.com']);
    expect(body.reply_to).toBe(input.email);
  });

  it('keeps health available and contact disabled when email is not configured', async () => {
    for (const key of ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'CONTACT_OWNER_EMAILS']) {
      vi.stubEnv(key, '');
    }
    const email = vi.fn();
    vi.stubGlobal('fetch', email);
    const { default: app } = await import('../../api/index.js');

    await request(app).get('/api/health').expect(200);
    await request(app).post('/api/contact-messages').send(input).expect(503);
    expect(db.from).not.toHaveBeenCalled();
    expect(email).not.toHaveBeenCalled();
  });
});
