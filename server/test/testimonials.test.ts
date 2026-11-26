import { afterEach, describe, expect, it, vi } from 'vitest';
import { TESTIMONIAL_HONEYPOT_FIELD } from '@pmw/validation';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createApp } from '../src/app.js';
import { createTestimonialsBackend } from '../src/testimonials.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});
const auth = { verifyToken: vi.fn(), loadProfile: vi.fn() };
const valid = {
  name: 'Alex Example',
  email: 'alex@example.com',
  city: 'Carmichael',
  service: 'Refinishing',
  body: 'Great repair.',
  can_publish: true,
};

afterEach(() => vi.restoreAllMocks());

describe('public testimonial API', () => {
  it('submits without authentication and forces Pending', async () => {
    const submit = vi.fn(async () => {});
    const app = createApp(config, auth, undefined, {
      testimonials: { submit, listApproved: async () => [] },
    });
    const response = await request(app).post('/api/public/testimonials').send(valid).expect(201);
    expect(response.body).toEqual({ success: true });
    expect(submit).toHaveBeenCalledExactlyOnceWith({ ...valid, photo_contact_ok: false });
    expect(auth.verifyToken).not.toHaveBeenCalled();
    expect(auth.loadProfile).not.toHaveBeenCalled();
  });

  it.each(['', ' \t '])(
    'strips an empty honeypot %j before validation and saving',
    async (value) => {
      const submit = vi.fn(async () => {});
      const app = createApp(config, auth, undefined, {
        testimonials: { submit, listApproved: async () => [] },
      });
      await request(app)
        .post('/api/public/testimonials')
        .send({ ...valid, [TESTIMONIAL_HONEYPOT_FIELD]: value })
        .expect(201);
      expect(submit).toHaveBeenCalledExactlyOnceWith({ ...valid, photo_contact_ok: false });
    },
  );

  it.each(['https://spam.example', 0, false, null, ['spam'], { spam: true }])(
    'discards a filled honeypot %j without saving or logging customer content',
    async (value) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const submit = vi.fn();
      const app = createApp(config, auth, undefined, {
        testimonials: { submit, listApproved: async () => [] },
      });
      const response = await request(app)
        .post('/api/public/testimonials')
        .send({ ...valid, [TESTIMONIAL_HONEYPOT_FIELD]: value })
        .expect(201);
      expect(response.body).toEqual({ success: true });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(submit).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledExactlyOnceWith('Testimonial submission dropped by honeypot');
    },
  );

  it('counts trapped bots toward the existing five-per-minute submission limit', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const submit = vi.fn();
    const app = createApp(config, auth, undefined, {
      testimonials: { submit, listApproved: async () => [] },
    });
    for (let index = 0; index < 5; index++) {
      await request(app)
        .post('/api/public/testimonials')
        .send({ ...valid, [TESTIMONIAL_HONEYPOT_FIELD]: 'spam' })
        .expect(201);
    }
    const blocked = await request(app).post('/api/public/testimonials').send(valid).expect(429);
    expect(blocked.body.error).toBe('Too many submissions. Please wait a minute and try again.');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(submit).not.toHaveBeenCalled();
  });

  it('limits list reads per visitor, resets after one minute, and keeps the submit allowance separate', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const submit = vi.fn(async () => {});
    const listApproved = vi.fn(async () => []);
    const app = createApp({ ...config, trustProxyHops: 1 }, auth, undefined, {
      testimonials: { submit, listApproved },
    });
    const read = (ip = '203.0.113.1') =>
      request(app).get('/api/public/testimonials').set('X-Forwarded-For', ip);
    for (let index = 0; index < 60; index++) await read().expect(200);
    const blocked = await read().expect(429);
    expect(blocked.body.error).toBe(
      'Too many testimonial requests. Please wait a minute and try again.',
    );
    expect(blocked.headers['retry-after']).toBe('60');
    expect(blocked.headers['cache-control']).toBe('no-store');
    expect(listApproved).toHaveBeenCalledTimes(60);
    await read('203.0.113.2').expect(200);
    await request(app)
      .post('/api/public/testimonials')
      .set('X-Forwarded-For', '203.0.113.1')
      .send(valid)
      .expect(201);
    expect(submit).toHaveBeenCalledOnce();
    now.mockReturnValue(60_000);
    await read().expect(200);
    expect(listApproved).toHaveBeenCalledTimes(62);
  });

  it.each([
    { ...valid, body: 'x'.repeat(501) },
    { ...valid, body: 'x'.repeat(500) + ' ' },
    { ...valid, can_publish: false },
    { ...valid, email: 'bad' },
    { ...valid, status: 'approved' },
    { ...valid, city: 42 },
    { ...valid, service: false },
    { ...valid, city: 'x'.repeat(101) },
    { ...valid, service: 'x'.repeat(201) },
  ])('rejects invalid input without saving: %j', async (body) => {
    const submit = vi.fn();
    const app = createApp(config, auth, undefined, {
      testimonials: { submit, listApproved: async () => [] },
    });
    await request(app).post('/api/public/testimonials').send(body).expect(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each(['city', 'service'] as const)(
    'rejects missing or blank %s without saving',
    async (field) => {
      const submit = vi.fn();
      const app = createApp(config, auth, undefined, {
        testimonials: { submit, listApproved: async () => [] },
      });
      for (const value of [undefined, null, '', ' \t ']) {
        const response = await request(app)
          .post('/api/public/testimonials')
          .send({ ...valid, [field]: value })
          .expect(400);
        expect(response.body.fieldErrors[field]).toBe(
          field === 'city' ? 'City is required.' : 'Service is required.',
        );
      }
      expect(submit).not.toHaveBeenCalled();
    },
  );

  it('trims city and service before saving', async () => {
    const submit = vi.fn(async () => {});
    const app = createApp(config, auth, undefined, {
      testimonials: { submit, listApproved: async () => [] },
    });
    await request(app)
      .post('/api/public/testimonials')
      .send({ ...valid, city: ' Carmichael ', service: ' Refinishing ' })
      .expect(201);
    expect(submit).toHaveBeenCalledExactlyOnceWith({ ...valid, photo_contact_ok: false });
  });

  it.each([
    ['name', 'Full name is required.'],
    ['email', 'Email address is required.'],
    ['body', 'Your testimonial is required.'],
  ] as const)(
    'returns matching required-field copy for a missing or blank %s',
    async (field, message) => {
      const submit = vi.fn();
      const app = createApp(config, auth, undefined, {
        testimonials: { submit, listApproved: async () => [] },
      });
      for (const value of [undefined, null, '', ' \t ']) {
        const response = await request(app)
          .post('/api/public/testimonials')
          .send({ ...valid, [field]: value })
          .expect(400);
        expect(response.body.fieldErrors[field]).toBe(message);
      }
      expect(submit).not.toHaveBeenCalled();
    },
  );

  it('lists approved records without exposing database failures', async () => {
    const record = {
      id: '1',
      name: 'Alex',
      city: null,
      service: null,
      rating: 4,
      body: 'Good',
      submitted_at: '2026-11-19',
    };
    const app = createApp(config, auth, undefined, {
      testimonials: { submit: async () => {}, listApproved: async () => [record] },
    });
    const response = await request(app).get('/api/public/testimonials').expect(200);
    expect(response.body).toEqual({ testimonials: [record] });
    expect(response.headers['cache-control']).toBe('no-store');

    const unavailable = createApp(config, auth, undefined, {
      testimonials: {
        submit: async () => {},
        listApproved: async () => {
          throw new Error('secret');
        },
      },
    });
    const failed = await request(unavailable).get('/api/public/testimonials').expect(503);
    expect(failed.text).not.toContain('secret');
  });

  it('database adapter selects only public fields and limits approved consented rows to the newest 50', async () => {
    const result = { data: [], error: null };
    const limit = vi.fn().mockResolvedValue(result);
    const orderById = vi.fn().mockReturnValue({ limit });
    const order = vi.fn().mockReturnValue({ order: orderById });
    const consentFilter = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ eq: consentFilter });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const backend = createTestimonialsBackend({ from } as unknown as Pick<SupabaseClient, 'from'>);
    await backend.listApproved();
    expect(from).toHaveBeenCalledWith('testimonials');
    expect(select).toHaveBeenCalledWith('id,name,city,service,rating,body,submitted_at');
    expect(eq).toHaveBeenCalledWith('status', 'approved');
    expect(consentFilter).toHaveBeenCalledExactlyOnceWith('can_publish', true);
    expect(order).toHaveBeenCalledExactlyOnceWith('submitted_at', { ascending: false });
    expect(orderById).toHaveBeenCalledExactlyOnceWith('id', { ascending: false });
    expect(limit).toHaveBeenCalledExactlyOnceWith(50);
  });

  it('database adapter sends only validated columns and enforces pending status', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const backend = createTestimonialsBackend({ from } as unknown as Pick<SupabaseClient, 'from'>);
    await backend.submit({ ...valid, photo_contact_ok: true });
    expect(insert).toHaveBeenCalledWith({
      ...valid,
      photo_contact_ok: true,
      status: 'pending',
    });
  });
});
