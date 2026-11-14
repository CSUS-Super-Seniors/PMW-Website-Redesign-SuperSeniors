import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { InquiryBackend, InquiryDetail, InquiryListItem } from '../src/inquiries.js';
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
  overrides: Partial<InquiryBackend> = {},
) {
  return {
    listInquiries: vi.fn(list),
    getInquiry: vi.fn(overrides.getInquiry ?? (async () => null)),
    markReviewed: vi.fn(overrides.markReviewed ?? (async () => null)),
    decline: vi.fn(overrides.decline ?? (async () => ({ result: 'not_found' as const }))),
  };
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

const MARGARET_ID = '5eed0003-0000-4000-8000-000000001048';
const MISSING_ID = '5eed0003-0000-4000-8000-000000009999';

const margaretDetail: InquiryDetail = {
  id: MARGARET_ID,
  inquiryNumber: 'INQ-1048',
  status: 'new',
  submittedAt: '2026-10-01T17:18:00+00:00',
  item: 'Dining chair',
  issueType: 'Loose joint / wobbling',
  description: 'The chair rocks from side to side.',
  customerName: 'Margaret Lewis',
  email: 'margaret@example.com',
  phone: '(916) 555-0142',
  preferredContact: null,
  textOk: true,
  address: '4821 Fair Oaks Blvd',
  city: 'Carmichael',
  inServiceArea: true,
  photos: [{ id: 'a1b2c3d4-0000-4000-8000-000000000001' }],
};

describe('GET /api/inquiries/:inquiryId', () => {
  it('returns the inquiry with its photo ids and does not change its status', async () => {
    const inquiries = inquiryBackend(undefined, { getInquiry: async () => margaretDetail });
    const response = await get(
      createApp(config, auth('owner'), undefined, { inquiries }),
      `/api/inquiries/${MARGARET_ID}`,
    ).expect(200);

    expect(response.body).toEqual(margaretDetail);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(inquiries.getInquiry).toHaveBeenCalledExactlyOnceWith(MARGARET_ID);
    expect(inquiries.markReviewed).not.toHaveBeenCalled();
  });

  it('never sends storage paths, only photo ids', async () => {
    const inquiries = inquiryBackend(undefined, { getInquiry: async () => margaretDetail });
    const response = await get(
      createApp(config, auth('owner'), undefined, { inquiries }),
      `/api/inquiries/${MARGARET_ID}`,
    ).expect(200);

    expect(response.text).not.toMatch(/storage_?path/i);
    expect(response.body.photos).toEqual([{ id: 'a1b2c3d4-0000-4000-8000-000000000001' }]);
  });

  it('returns 404 when no inquiry has the id', async () => {
    const inquiries = inquiryBackend();
    await get(
      createApp(config, auth('owner'), undefined, { inquiries }),
      `/api/inquiries/${MISSING_ID}`,
    ).expect(404);
  });

  it.each(['not-a-uuid', '1', `${MARGARET_ID}x`])(
    'rejects the id %s with 400 before reaching the database',
    async (id) => {
      const inquiries = inquiryBackend();
      await get(
        createApp(config, auth('owner'), undefined, { inquiries }),
        `/api/inquiries/${id}`,
      ).expect(400);
      expect(inquiries.getInquiry).not.toHaveBeenCalled();
    },
  );

  it('refuses employees, removed owners and visitors before reaching the database', async () => {
    const inquiries = inquiryBackend(undefined, { getInquiry: async () => margaretDetail });
    await get(
      createApp(config, auth('employee'), undefined, { inquiries }),
      `/api/inquiries/${MARGARET_ID}`,
    ).expect(403);
    await get(
      createApp(config, auth('owner', 'inactive'), undefined, { inquiries }),
      `/api/inquiries/${MARGARET_ID}`,
    ).expect(403);
    await request(createApp(config, auth('owner'), undefined, { inquiries }))
      .get(`/api/inquiries/${MARGARET_ID}`)
      .expect(401);
    expect(inquiries.getInquiry).not.toHaveBeenCalled();
  });

  it('returns a sanitized 503 when the database fails', async () => {
    const inquiries = inquiryBackend(undefined, {
      getInquiry: async () => {
        throw new Error('private database detail');
      },
    });
    const response = await get(
      createApp(config, auth('owner'), undefined, { inquiries }),
      `/api/inquiries/${MARGARET_ID}`,
    ).expect(503);
    expect(response.text).not.toContain('private database detail');
  });
});

describe('POST /api/inquiries/:inquiryId/review', () => {
  function post(app: ReturnType<typeof createApp>, path: string) {
    return request(app).post(path).set('Authorization', 'Bearer valid');
  }

  it('marks a New inquiry Reviewed and returns the new status', async () => {
    const inquiries = inquiryBackend(undefined, { markReviewed: async () => 'contacted' });
    const response = await post(
      createApp(config, auth('owner'), undefined, { inquiries }),
      `/api/inquiries/${MARGARET_ID}/review`,
    ).expect(200);

    expect(response.body).toEqual({ status: 'contacted' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(inquiries.markReviewed).toHaveBeenCalledExactlyOnceWith(MARGARET_ID);
  });

  it('reports the unchanged status of an inquiry that is not New', async () => {
    const inquiries = inquiryBackend(undefined, { markReviewed: async () => 'converted' });
    const response = await post(
      createApp(config, auth('owner'), undefined, { inquiries }),
      `/api/inquiries/${MARGARET_ID}/review`,
    ).expect(200);
    expect(response.body).toEqual({ status: 'converted' });
  });

  it('returns 404 when no inquiry has the id', async () => {
    const inquiries = inquiryBackend();
    await post(
      createApp(config, auth('owner'), undefined, { inquiries }),
      `/api/inquiries/${MISSING_ID}/review`,
    ).expect(404);
  });

  it('rejects an invalid id with 400 before reaching the database', async () => {
    const inquiries = inquiryBackend();
    await post(
      createApp(config, auth('owner'), undefined, { inquiries }),
      '/api/inquiries/not-a-uuid/review',
    ).expect(400);
    expect(inquiries.markReviewed).not.toHaveBeenCalled();
  });

  it('refuses employees so they cannot change a status', async () => {
    const inquiries = inquiryBackend(undefined, { markReviewed: async () => 'contacted' });
    await post(
      createApp(config, auth('employee'), undefined, { inquiries }),
      `/api/inquiries/${MARGARET_ID}/review`,
    ).expect(403);
    expect(inquiries.markReviewed).not.toHaveBeenCalled();
  });

  it('returns a sanitized 503 when the update fails', async () => {
    const inquiries = inquiryBackend(undefined, {
      markReviewed: async () => {
        throw new Error('private database detail');
      },
    });
    const response = await post(
      createApp(config, auth('owner'), undefined, { inquiries }),
      `/api/inquiries/${MARGARET_ID}/review`,
    ).expect(503);
    expect(response.text).not.toContain('private database detail');
  });
});
