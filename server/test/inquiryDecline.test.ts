import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDeclineEmailSender, type DeclinedInquiry } from '../src/declineEmail.js';
import type { DeclineOutcome, InquiryBackend } from '../src/inquiries.js';
import type { AuthBackend } from '../src/supabase.js';

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});

const ID = '5eed0003-0000-4000-8000-000000001048';

const margaret: DeclinedInquiry = {
  id: ID,
  inquiry_number: 'INQ-1048',
  first_name: 'Margaret',
  item: 'Dining chair',
  email: 'margaret@example.com',
};

function auth(role: string, status = 'active'): AuthBackend {
  return {
    verifyToken: async (token) => (token === 'valid' ? { id: 'user-1' } : null),
    loadProfile: async () => ({ role, status }),
  };
}

function backend(decline: () => Promise<DeclineOutcome>) {
  return {
    listInquiries: vi.fn(async () => ({ inquiries: [], total: 0 })),
    getInquiry: vi.fn(async () => null),
    markReviewed: vi.fn(async () => null),
    decline: vi.fn(decline),
  } satisfies InquiryBackend;
}

/** A Resend stand-in that records each email the server sends. */
function resend(status = 200, body: unknown = { id: 'email-1' }) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    void _url;
    void _init;
    return new Response(JSON.stringify(body), { status });
  });
}

function setup({
  decline = async (): Promise<DeclineOutcome> => ({ result: 'declined', inquiry: margaret }),
  role = 'owner',
  fetchEmail = resend(),
  withEmail = true,
}: {
  decline?: () => Promise<DeclineOutcome>;
  role?: string;
  fetchEmail?: ReturnType<typeof resend>;
  withEmail?: boolean;
} = {}) {
  const inquiries = backend(decline);
  const declineEmail = withEmail
    ? createDeclineEmailSender(
        { apiKey: 're_test', from: 'estimates@example.com', replyTo: ['owner@example.com'] },
        fetchEmail as unknown as typeof fetch,
      )
    : undefined;
  const app = createApp(config, auth(role), undefined, { inquiries, declineEmail });
  const post = (body: unknown, id = ID) =>
    request(app)
      .post(`/api/inquiries/${id}/decline`)
      .set('Authorization', 'Bearer valid')
      .send(body as object);
  return { inquiries, fetchEmail, post };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/inquiries/:inquiryId/decline', () => {
  it('declines the request and emails the customer through Resend', async () => {
    const { inquiries, fetchEmail, post } = setup();
    const response = await post({ notifyCustomer: true }).expect(200);

    expect(response.body).toEqual({ status: 'closed', email: 'sent' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(inquiries.decline).toHaveBeenCalledExactlyOnceWith(ID);
    expect(fetchEmail).toHaveBeenCalledOnce();
    const [url, init] = fetchEmail.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const sent = JSON.parse(String(init?.body));
    expect(sent.to).toEqual(['margaret@example.com']);
    expect(sent.subject).toBe('Your estimate request INQ-1048');
    expect(sent.text).toContain('Hi Margaret,');
  });

  it('saves the decline before sending the email', async () => {
    const order: string[] = [];
    const fetchEmail = resend();
    fetchEmail.mockImplementation(async () => {
      order.push('email');
      return new Response(JSON.stringify({ id: 'email-1' }), { status: 200 });
    });
    const { post } = setup({
      fetchEmail,
      decline: async () => {
        order.push('save');
        return { result: 'declined', inquiry: margaret };
      },
    });

    await post({ notifyCustomer: true }).expect(200);
    expect(order).toEqual(['save', 'email']);
  });

  it('declines without emailing when the owner turns the email off', async () => {
    const { inquiries, fetchEmail, post } = setup();
    const response = await post({ notifyCustomer: false }).expect(200);

    expect(response.body).toEqual({ status: 'closed', email: 'skipped' });
    expect(inquiries.decline).toHaveBeenCalledOnce();
    expect(fetchEmail).not.toHaveBeenCalled();
  });

  it('keeps the decline and reports failed when Resend refuses the email', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { inquiries, post } = setup({ fetchEmail: resend(500, { message: 'provider detail' }) });
    const response = await post({ notifyCustomer: true }).expect(200);

    expect(response.body).toEqual({ status: 'closed', email: 'failed' });
    expect(response.text).not.toContain('provider detail');
    expect(inquiries.decline).toHaveBeenCalledOnce();
  });

  it('reports no_email when the request has no usable address', async () => {
    const fetchEmail = resend();
    const { post } = setup({
      fetchEmail,
      decline: async () => ({ result: 'declined', inquiry: { ...margaret, email: null } }),
    });
    const response = await post({ notifyCustomer: true }).expect(200);

    expect(response.body).toEqual({ status: 'closed', email: 'no_email' });
    expect(fetchEmail).not.toHaveBeenCalled();
  });

  it('reports unavailable when email is not configured', async () => {
    const { post } = setup({ withEmail: false });
    const response = await post({ notifyCustomer: true }).expect(200);
    expect(response.body).toEqual({ status: 'closed', email: 'unavailable' });
  });

  it('resends safely for a request that is already declined', async () => {
    const fetchEmail = resend(409, { name: 'invalid_idempotent_request' });
    const { post } = setup({
      fetchEmail,
      decline: async () => ({ result: 'already_declined', inquiry: margaret }),
    });
    const response = await post({ notifyCustomer: true }).expect(200);

    expect(response.body).toEqual({ status: 'closed', email: 'already_sent' });
    expect(new Headers(fetchEmail.mock.calls[0][1]?.headers).get('Idempotency-Key')).toMatch(
      new RegExp(`^inquiry-declined/${ID}/`),
    );
  });

  it('refuses to decline an accepted request with 409 and sends nothing', async () => {
    const fetchEmail = resend();
    const { post } = setup({
      fetchEmail,
      decline: async () => ({ result: 'not_declinable', status: 'converted' }),
    });
    const response = await post({ notifyCustomer: true }).expect(409);

    expect(response.body.status).toBe('converted');
    expect(fetchEmail).not.toHaveBeenCalled();
  });

  it('returns 404 when no inquiry has the id', async () => {
    const { post } = setup({ decline: async () => ({ result: 'not_found' }) });
    await post({ notifyCustomer: true }).expect(404);
  });

  it('rejects an invalid id with 400 before reaching the database', async () => {
    const { inquiries, post } = setup();
    await post({ notifyCustomer: true }, 'not-a-uuid').expect(400);
    expect(inquiries.decline).not.toHaveBeenCalled();
  });

  it.each([
    ['no body', undefined],
    ['a missing choice', {}],
    ['a string instead of true or false', { notifyCustomer: 'true' }],
    ['a number', { notifyCustomer: 1 }],
    ['an extra field', { notifyCustomer: true, status: 'converted' }],
    ['a list', [true]],
  ])('validates the body on the server: rejects %s', async (_name, body) => {
    const { inquiries, fetchEmail, post } = setup();
    await post(body).expect(400);
    expect(inquiries.decline).not.toHaveBeenCalled();
    expect(fetchEmail).not.toHaveBeenCalled();
  });

  it.each([
    ['employees', 'employee'],
    ['logins without a staff role', 'customer'],
  ])('refuses %s with 403 before anything changes', async (_name, role) => {
    const { inquiries, fetchEmail, post } = setup({ role });
    await post({ notifyCustomer: true }).expect(403);
    expect(inquiries.decline).not.toHaveBeenCalled();
    expect(fetchEmail).not.toHaveBeenCalled();
  });

  it('refuses visitors without a valid token', async () => {
    const inquiries = backend(async () => ({ result: 'declined', inquiry: margaret }));
    await request(createApp(config, auth('owner'), undefined, { inquiries }))
      .post(`/api/inquiries/${ID}/decline`)
      .send({ notifyCustomer: true })
      .expect(401);
    expect(inquiries.decline).not.toHaveBeenCalled();
  });

  it('returns a sanitized 503 and sends nothing when the decline cannot be saved', async () => {
    const fetchEmail = resend();
    const { post } = setup({
      fetchEmail,
      decline: async () => {
        throw new Error('private database detail');
      },
    });
    const response = await post({ notifyCustomer: true }).expect(503);

    expect(response.text).not.toContain('private database detail');
    expect(fetchEmail).not.toHaveBeenCalled();
  });

  it('returns 503 when the inquiry backend is not configured', async () => {
    const response = await request(createApp(config, auth('owner')))
      .post(`/api/inquiries/${ID}/decline`)
      .set('Authorization', 'Bearer valid')
      .send({ notifyCustomer: true })
      .expect(503);
    expect(response.body.error).toMatch(/temporarily unavailable/);
  });
});
