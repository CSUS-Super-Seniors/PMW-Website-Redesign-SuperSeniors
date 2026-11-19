import { describe, expect, it, vi } from 'vitest';
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
  body: 'Great repair.',
  can_publish: true,
};

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

  it.each([
    { ...valid, body: 'x'.repeat(501) },
    { ...valid, body: 'x'.repeat(500) + ' ' },
    { ...valid, can_publish: false },
    { ...valid, email: 'bad' },
    { ...valid, status: 'approved' },
  ])('rejects invalid input without saving: %j', async (body) => {
    const submit = vi.fn();
    const app = createApp(config, auth, undefined, {
      testimonials: { submit, listApproved: async () => [] },
    });
    await request(app).post('/api/public/testimonials').send(body).expect(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it('lists approved records without exposing database failures', async () => {
    const record = {
      id: '1',
      name: 'Alex',
      city: null,
      service: null,
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

  it('database adapter selects only public fields and filters approved consented rows', async () => {
    const result = { data: [], error: null };
    const order = vi.fn().mockReturnValueOnce({ order: vi.fn().mockResolvedValue(result) });
    const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order }) });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const backend = createTestimonialsBackend({ from } as unknown as Pick<SupabaseClient, 'from'>);
    await backend.listApproved();
    expect(from).toHaveBeenCalledWith('testimonials');
    expect(select).toHaveBeenCalledWith('id,name,city,service,body,submitted_at');
    expect(eq).toHaveBeenCalledWith('status', 'approved');
  });

  it('database adapter sends only validated columns and enforces pending status', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const backend = createTestimonialsBackend({ from } as unknown as Pick<SupabaseClient, 'from'>);
    await backend.submit({ ...valid, photo_contact_ok: true });
    expect(insert).toHaveBeenCalledWith({ ...valid, photo_contact_ok: true, status: 'pending' });
  });
});
