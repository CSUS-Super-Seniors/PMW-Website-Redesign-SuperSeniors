import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { InquiryBackend, InquiryListItem } from '../src/inquiries.js';
import type { AuthBackend } from '../src/supabase.js';

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});

function auth(role: string, status = 'active'): AuthBackend {
  return {
    verifyToken: async (token) => (token === 'valid' ? { id: 'user-1' } : null),
    loadProfile: async () => ({ role, status }),
  };
}

const margaret: InquiryListItem = {
  id: 'inquiry-1',
  inquiryNumber: 'INQ-1048',
  customerName: 'Margaret Lewis',
  item: 'Dining chair',
  city: 'Carmichael',
  status: 'new',
  submittedAt: '2026-10-01T17:18:00+00:00',
};

function inquiryBackend(
  list: InquiryBackend['listInquiries'] = async () => ({ inquiries: [margaret], total: 1 }),
) {
  return { listInquiries: vi.fn(list) };
}

function get(app: ReturnType<typeof createApp>, path: string) {
  return request(app).get(path).set('Authorization', 'Bearer valid');
}

describe('GET /api/inquiries', () => {
  it('returns the first page of 10 by default', async () => {
    const inquiries = inquiryBackend();
    const response = await get(
      createApp(config, auth('owner'), undefined, { inquiries }),
      '/api/inquiries',
    ).expect(200);

    expect(response.body).toEqual({ inquiries: [margaret], total: 1, page: 1, pageSize: 10 });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(inquiries.listInquiries).toHaveBeenCalledExactlyOnceWith({ page: 1, pageSize: 10 });
  });

  it.each([5, 10, 20])('passes page size %i through to the database', async (pageSize) => {
    const inquiries = inquiryBackend();
    const response = await get(
      createApp(config, auth('owner'), undefined, { inquiries }),
      `/api/inquiries?page=3&pageSize=${pageSize}`,
    ).expect(200);

    expect(response.body).toMatchObject({ page: 3, pageSize });
    expect(inquiries.listInquiries).toHaveBeenCalledExactlyOnceWith({ page: 3, pageSize });
  });

  it.each([
    ['page 0', 'page=0'],
    ['a negative page', 'page=-1'],
    ['a decimal page', 'page=1.5'],
    ['a non-numeric page', 'page=abc'],
    ['a page with a leading zero', 'page=01'],
    ['a huge page', 'page=100001'],
    ['a repeated page', 'page=1&page=2'],
    ['page size 4', 'pageSize=4'],
    ['page size 21', 'pageSize=21'],
    ['an empty page size', 'pageSize='],
    ['a non-numeric page size', 'pageSize=ten'],
    ['a repeated page size', 'pageSize=5&pageSize=20'],
  ])('rejects %s with 400 before reaching the database', async (_name, query) => {
    const inquiries = inquiryBackend();
    const response = await get(
      createApp(config, auth('owner'), undefined, { inquiries }),
      `/api/inquiries?${query}`,
    ).expect(400);

    expect(response.body.error).toMatch(/page/);
    expect(inquiries.listInquiries).not.toHaveBeenCalled();
  });

  it('refuses employees before reaching the database', async () => {
    const inquiries = inquiryBackend();
    await get(
      createApp(config, auth('employee'), undefined, { inquiries }),
      '/api/inquiries',
    ).expect(403);
    expect(inquiries.listInquiries).not.toHaveBeenCalled();
  });

  it('refuses removed owners and visitors without a valid token', async () => {
    const inquiries = inquiryBackend();
    await get(
      createApp(config, auth('owner', 'inactive'), undefined, { inquiries }),
      '/api/inquiries',
    ).expect(403);
    await request(createApp(config, auth('owner'), undefined, { inquiries }))
      .get('/api/inquiries')
      .expect(401);
    expect(inquiries.listInquiries).not.toHaveBeenCalled();
  });

  it('returns a sanitized 503 when the database fails', async () => {
    const inquiries = inquiryBackend(async () => {
      throw new Error('private database detail');
    });
    const response = await get(
      createApp(config, auth('owner'), undefined, { inquiries }),
      '/api/inquiries',
    ).expect(503);

    expect(response.body).toEqual({ error: 'Estimate requests are temporarily unavailable.' });
    expect(response.text).not.toContain('private database detail');
  });

  it('returns 503 when the inquiry backend is not configured', async () => {
    await get(createApp(config, auth('owner')), '/api/inquiries').expect(503);
  });
});
