import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const db = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../src/supabase.js', () => ({
  createSupabaseAdmin: () => ({ from: db.from, rpc: db.rpc }),
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
  vi.stubEnv('OWNER_PORTAL_ORIGIN', 'https://owner-preview.example');
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
  it('wires final estimate saving and both emails through the exported app', async () => {
    db.from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () =>
          table === 'service_cities'
            ? Promise.resolve({ data: [{ name: 'Carmichael' }], error: null })
            : { maybeSingle: async () => ({ data: null, error: null }) },
      }),
    }));
    db.rpc.mockResolvedValue({
      data: {
        id: '60000000-0000-4000-8000-000000000002',
        inquiry_number: 'INQ-1049',
        created_at: '2026-11-11T12:00:00Z',
        created: true,
      },
      error: null,
    });
    const email = vi.fn<typeof fetch>(async () => Response.json({ id: 'email-id' }));
    vi.stubGlobal('fetch', email);
    const { default: app } = await import('../../api/index.js');
    await request(app)
      .post('/api/estimates')
      .set('Host', 'untrusted.example')
      .send({
        submission_id: '60000000-0000-4000-8000-000000000001',
        first_name: 'Test',
        last_name: 'Visitor',
        email: 'visitor@example.com',
        phone: '9165550142',
        address: '123 Main St',
        city: 'Carmichael',
        item: 'Chair',
        issue_type: 'loose_joints',
        description: 'Loose leg',
        lead_source: 'google',
        pmw_extra: '',
      })
      .expect(201, { success: true, inquiry_number: 'INQ-1049' });
    expect(db.rpc).toHaveBeenCalledWith(
      'submit_estimate_request',
      expect.objectContaining({
        p_details: expect.objectContaining({ lead_source: 'google' }),
        p_storage_paths: [],
      }),
    );
    expect(email).toHaveBeenCalledTimes(2);
    const owner = JSON.parse(String(email.mock.calls[1][1]?.body));
    expect(owner.to).toEqual(['owner@example.com']);
    expect(owner.text).toContain(
      'https://owner-preview.example/portal/inquiries/60000000-0000-4000-8000-000000000002',
    );
    expect(owner.text).not.toContain('untrusted.example');
    expect(owner.attachments).toBeUndefined();
  });
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

  it('wires the service-area check to the service_cities table', async () => {
    const eq = vi.fn(async () => ({ data: [{ name: 'Carmichael' }], error: null }));
    db.from.mockImplementation((table: string) =>
      table === 'service_cities' ? { select: () => ({ eq }) } : { insert: db.insert },
    );
    const { default: app } = await import('../../api/index.js');

    const inside = await request(app)
      .post('/api/estimates/service-area')
      .send({ city: 'Carmichael' })
      .expect(200);
    expect(inside.body).toEqual({ inServiceArea: true });
    const outside = await request(app)
      .post('/api/estimates/service-area')
      .send({ city: 'Davis' })
      .expect(200);
    expect(outside.body).toEqual({ inServiceArea: false });
    expect(db.from).toHaveBeenCalledWith('service_cities');
    expect(eq).toHaveBeenCalledWith('is_active', true);
  });

  it('trusts the one Vercel proxy so each visitor gets their own estimate rate limit', async () => {
    vi.stubEnv('ESTIMATE_RATE_LIMIT_MAX', '1');
    const { default: app } = await import('../../api/index.js');
    const from = (ip: string) =>
      request(app).post('/api/estimates').set('X-Forwarded-For', ip).send({ item: 'Chair' });

    await from('203.0.113.1').expect(400);
    await from('203.0.113.1').expect(429);
    await from('203.0.113.2').expect(400);
  });
});

describe('Vercel photo rate limiting', () => {
  it('gives different forwarded client IPs independent request limits', async () => {
    const { default: app } = await import('../../api/index.js');
    for (let i = 0; i < 60; i++) {
      await request(app)
        .post('/api/estimates/photos/session')
        .set('X-Forwarded-For', '192.0.2.1')
        .expect(201);
    }
    const limited = await request(app)
      .post('/api/estimates/photos/session')
      .set('X-Forwarded-For', '192.0.2.1')
      .expect(429);
    expect(limited.headers['retry-after']).toBe('60');
    await request(app)
      .post('/api/estimates/photos/session')
      .set('X-Forwarded-For', '192.0.2.2')
      .expect(201);
    // Additional, untrusted left-hand entries cannot create a fresh bucket.
    await request(app)
      .post('/api/estimates/photos/session')
      .set('X-Forwarded-For', '198.51.100.9, 192.0.2.1')
      .expect(429);
  });
});
