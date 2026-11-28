import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import {
  createCustomerListBackend,
  parseCustomerListQuery,
  readIsoDate,
  type CustomerBackend,
  type CustomerListItem,
} from '../src/customers.js';
import type { AuthBackend } from '../src/supabase.js';

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});

function authBackend(role = 'owner', status = 'active'): AuthBackend {
  return {
    verifyToken: async (token) => (token === 'valid' ? { id: 'user-1' } : null),
    loadProfile: async () => ({ role, status }),
  };
}

const margaret: CustomerListItem = {
  id: '5eed0001-0000-4000-8000-000000000001',
  firstName: 'Margaret',
  lastName: 'Lewis',
  phone: '(916) 555-0142',
  city: 'Carmichael',
  email: 'margaret.lewis@email.com',
  jobCount: 3,
  lastJobDate: '2026-09-24',
  isRepeat: true,
};

function fakeCustomers(answer: { customers: CustomerListItem[]; total: number } | Error) {
  const calls: Parameters<CustomerBackend['listCustomers']>[0][] = [];
  const backend: CustomerBackend = {
    listCustomers: async (options) => {
      calls.push(options);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return { backend, calls };
}

describe('parseCustomerListQuery', () => {
  it('defaults to the first page of 10 with no filters', () => {
    expect(parseCustomerListQuery({})).toEqual({
      ok: true,
      page: 1,
      pageSize: 10,
      search: null,
      status: null,
      lastJobFrom: null,
      lastJobTo: null,
    });
  });

  it('reads every filter and trims the search', () => {
    expect(
      parseCustomerListQuery({
        page: '3',
        pageSize: '25',
        search: '  555-01 ',
        status: 'repeat',
        from: '2026-01-01',
        to: '2026-09-30',
      }),
    ).toEqual({
      ok: true,
      page: 3,
      pageSize: 25,
      search: '555-01',
      status: 'repeat',
      lastJobFrom: '2026-01-01',
      lastJobTo: '2026-09-30',
    });
  });

  it('treats empty values as no filter', () => {
    expect(parseCustomerListQuery({ search: '   ', status: '', from: '', to: '' })).toMatchObject({
      ok: true,
      search: null,
      status: null,
      lastJobFrom: null,
      lastJobTo: null,
    });
  });

  it.each([
    [{ page: '0' }, 'page'],
    [{ page: '1.5' }, 'page'],
    [{ page: ['1', '2'] }, 'page'],
    [{ pageSize: '20' }, 'pageSize'],
    [{ pageSize: '1000' }, 'pageSize'],
    [{ search: ['a', 'b'] }, 'search'],
    [{ search: { name: 'a' } }, 'search'],
    [{ search: 'x'.repeat(101) }, 'search'],
    [{ status: 'vip' }, 'status'],
    [{ status: ['new'] }, 'status'],
    [{ from: '01/01/2026' }, 'from'],
    [{ from: '2026-02-30' }, 'from'],
    [{ to: '2026-13-01' }, 'to'],
    [{ from: '2026-09-30', to: '2026-01-01' }, 'to must be on or after from'],
  ])('refuses %j', (query, message) => {
    const result = parseCustomerListQuery(query);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain(message);
  });

  it('accepts a 100 character search', () => {
    expect(parseCustomerListQuery({ search: 'x'.repeat(100) }).ok).toBe(true);
  });
});

describe('readIsoDate', () => {
  it('keeps real dates and refuses impossible ones', () => {
    expect(readIsoDate('2028-02-29')).toBe('2028-02-29');
    expect(readIsoDate('2026-02-29')).toBeNull();
    expect(readIsoDate('2026-1-01')).toBeNull();
    expect(readIsoDate(20260101)).toBeNull();
  });
});

describe('createCustomerListBackend', () => {
  function fakeRpc(answer: { data: unknown; error: unknown }) {
    const calls: [string, unknown][] = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push([name, args]);
        return answer;
      },
    };
    return { client: client as never, calls };
  }

  it('calls list_customers with the filters and the page as limit and offset', async () => {
    const { client, calls } = fakeRpc({
      data: { total: 31, customers: [{ ...margaret, internalNote: 'never sent' }] },
      error: null,
    });
    const result = await createCustomerListBackend(client).listCustomers({
      page: 3,
      pageSize: 10,
      search: 'lew',
      status: 'repeat',
      lastJobFrom: '2026-01-01',
      lastJobTo: null,
    });
    expect(calls).toEqual([
      [
        'list_customers',
        {
          p_search: 'lew',
          p_status: 'repeat',
          p_last_job_from: '2026-01-01',
          p_last_job_to: null,
          p_limit: 10,
          p_offset: 20,
        },
      ],
    ]);
    // Only the list columns are passed on.
    expect(result).toEqual({ total: 31, customers: [margaret] });
  });

  it('throws when the database fails', async () => {
    const { client } = fakeRpc({ data: null, error: { message: 'boom' } });
    await expect(
      createCustomerListBackend(client).listCustomers({
        page: 1,
        pageSize: 10,
        search: null,
        status: null,
        lastJobFrom: null,
        lastJobTo: null,
      }),
    ).rejects.toThrow('Customer list lookup failed');
  });

  it('throws on an unexpected shape', async () => {
    const { client } = fakeRpc({
      data: { total: 1, customers: [{ ...margaret, jobCount: '3' }] },
      error: null,
    });
    await expect(
      createCustomerListBackend(client).listCustomers({
        page: 1,
        pageSize: 10,
        search: null,
        status: null,
        lastJobFrom: null,
        lastJobTo: null,
      }),
    ).rejects.toThrow();
  });
});

describe('GET /api/customers', () => {
  it('gives an owner the page, total and paging back, never cached', async () => {
    const { backend, calls } = fakeCustomers({ customers: [margaret], total: 1 });
    const response = await request(
      createApp(config, authBackend('owner'), undefined, { customers: backend }),
    )
      .get('/api/customers?search=marg&status=repeat&from=2026-01-01&to=2026-09-30&pageSize=25')
      .set('Authorization', 'Bearer valid')
      .expect(200);

    expect(response.body).toEqual({ customers: [margaret], total: 1, page: 1, pageSize: 25 });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(calls).toEqual([
      {
        page: 1,
        pageSize: 25,
        search: 'marg',
        status: 'repeat',
        lastJobFrom: '2026-01-01',
        lastJobTo: '2026-09-30',
      },
    ]);
  });

  it('refuses an employee calling the API directly, without reading customers', async () => {
    const { backend, calls } = fakeCustomers({ customers: [margaret], total: 1 });
    const response = await request(
      createApp(config, authBackend('employee'), undefined, { customers: backend }),
    )
      .get('/api/customers')
      .set('Authorization', 'Bearer valid')
      .expect(403);
    expect(response.body).not.toHaveProperty('customers');
    expect(calls).toEqual([]);
  });

  it('refuses an inactive owner', async () => {
    const { backend, calls } = fakeCustomers({ customers: [margaret], total: 1 });
    await request(
      createApp(config, authBackend('owner', 'inactive'), undefined, { customers: backend }),
    )
      .get('/api/customers')
      .set('Authorization', 'Bearer valid')
      .expect(403);
    expect(calls).toEqual([]);
  });

  it('needs a valid token', async () => {
    const { backend, calls } = fakeCustomers({ customers: [margaret], total: 1 });
    const app = createApp(config, authBackend('owner'), undefined, { customers: backend });
    await request(app).get('/api/customers').expect(401);
    await request(app).get('/api/customers').set('Authorization', 'Bearer invalid').expect(401);
    expect(calls).toEqual([]);
  });

  it('answers 400 for a bad query without reaching the backend', async () => {
    const { backend, calls } = fakeCustomers({ customers: [], total: 0 });
    const response = await request(
      createApp(config, authBackend('owner'), undefined, { customers: backend }),
    )
      .get('/api/customers?status=vip')
      .set('Authorization', 'Bearer valid')
      .expect(400);
    expect(response.body.error).toContain('status');
    expect(calls).toEqual([]);
  });

  it('answers 503 when the backend is missing or fails, without details', async () => {
    await request(createApp(config, authBackend('owner')))
      .get('/api/customers')
      .set('Authorization', 'Bearer valid')
      .expect(503);

    const { backend } = fakeCustomers(new Error('connection refused at 10.0.0.1'));
    const response = await request(
      createApp(config, authBackend('owner'), undefined, { customers: backend }),
    )
      .get('/api/customers')
      .set('Authorization', 'Bearer valid')
      .expect(503);
    expect(response.body).toEqual({ error: 'Customers are temporarily unavailable.' });
  });
});
