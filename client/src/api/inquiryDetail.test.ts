import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  declineInquiry,
  fetchInquiry,
  fetchPhotoViewUrl,
  markInquiryReviewed,
} from './inquiryDetail';

const ID = '5eed0003-0000-4000-8000-000000001048';

const detail = {
  id: ID,
  inquiryNumber: 'INQ-1048',
  status: 'new',
  submittedAt: '2026-10-01T17:18:00+00:00',
  item: 'Dining chair',
  issueType: null,
  description: null,
  customerName: 'Margaret Lewis',
  email: null,
  phone: null,
  preferredContact: null,
  textOk: false,
  address: null,
  city: null,
  inServiceArea: true,
  photos: [{ id: 'photo-1' }],
};

function respond(status: number, body: unknown = {}) {
  const fakeFetch = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fakeFetch);
  return fakeFetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchInquiry', () => {
  it('asks for the request with the bearer token', async () => {
    const fakeFetch = respond(200, detail);

    expect(await fetchInquiry('token-123', ID)).toEqual({ status: 'ok', inquiry: detail });
    expect(fakeFetch).toHaveBeenCalledWith(`/api/inquiries/${ID}`, {
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('escapes the id in the address', async () => {
    const fakeFetch = respond(404);
    await fetchInquiry('token-123', '../me');
    expect(fakeFetch.mock.calls[0][0]).toBe('/api/inquiries/..%2Fme');
  });

  it.each([
    [401, 'unauthenticated'],
    [403, 'no-access'],
    [404, 'not-found'],
    [400, 'not-found'],
    [503, 'error'],
  ])('maps HTTP %i to %s', async (code, status) => {
    respond(code);
    expect(await fetchInquiry('token-123', ID)).toEqual({ status });
  });

  it.each([
    ['an unknown status', { ...detail, status: 'archived' }],
    ['an unknown contact preference', { ...detail, preferredContact: 'fax' }],
    ['a missing item', { ...detail, item: undefined }],
    ['photos that are not a list', { ...detail, photos: 'photo-1' }],
    ['a photo without an id', { ...detail, photos: [{}] }],
  ])('treats a body with %s as an error', async (_name, body) => {
    respond(200, body);
    expect(await fetchInquiry('token-123', ID)).toEqual({ status: 'error' });
  });

  it('returns error when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await fetchInquiry('token-123', ID)).toEqual({ status: 'error' });
  });
});

describe('markInquiryReviewed', () => {
  it('posts to the review route and returns the new status', async () => {
    const fakeFetch = respond(200, { status: 'contacted' });

    expect(await markInquiryReviewed('token-123', ID)).toBe('contacted');
    expect(fakeFetch).toHaveBeenCalledWith(`/api/inquiries/${ID}/review`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it.each([
    ['a failed request', 503, {}],
    ['an unknown status', 200, { status: 'archived' }],
  ])('returns null for %s', async (_name, code, body) => {
    respond(code, body);
    expect(await markInquiryReviewed('token-123', ID)).toBeNull();
  });
});

describe('declineInquiry', () => {
  it('posts the email choice as JSON and returns the email outcome', async () => {
    const fakeFetch = respond(200, { status: 'closed', email: 'sent' });

    expect(await declineInquiry('token-123', ID, true)).toEqual({
      status: 'declined',
      email: 'sent',
    });
    expect(fakeFetch).toHaveBeenCalledWith(`/api/inquiries/${ID}/decline`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-123', 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifyCustomer: true }),
    });
  });

  it('sends false when the owner chose not to email', async () => {
    const fakeFetch = respond(200, { status: 'closed', email: 'skipped' });
    await declineInquiry('token-123', ID, false);
    expect(fakeFetch.mock.calls[0][1]?.body).toBe(JSON.stringify({ notifyCustomer: false }));
  });

  it.each(['sent', 'already_sent', 'skipped', 'no_email', 'unavailable', 'failed'])(
    'passes the %s email outcome through',
    async (email) => {
      respond(200, { status: 'closed', email });
      expect(await declineInquiry('token-123', ID, true)).toEqual({ status: 'declined', email });
    },
  );

  it.each([
    [401, 'unauthenticated'],
    [403, 'no-access'],
    [404, 'not-found'],
    [400, 'error'],
    [503, 'error'],
  ])('maps HTTP %i to %s', async (code, status) => {
    respond(code);
    expect(await declineInquiry('token-123', ID, true)).toEqual({ status });
  });

  it('reports the current status when the request can no longer be declined', async () => {
    respond(409, { error: 'accepted', status: 'converted' });
    expect(await declineInquiry('token-123', ID, true)).toEqual({
      status: 'not-declinable',
      current: 'converted',
    });
  });

  it('ignores an unknown status in a 409 answer', async () => {
    respond(409, { status: 'archived' });
    expect(await declineInquiry('token-123', ID, true)).toEqual({
      status: 'not-declinable',
      current: null,
    });
  });

  it.each([
    ['a status other than closed', { status: 'contacted', email: 'sent' }],
    ['an unknown email outcome', { status: 'closed', email: 'queued' }],
    ['a missing email outcome', { status: 'closed' }],
  ])('treats a body with %s as an error', async (_name, body) => {
    respond(200, body);
    expect(await declineInquiry('token-123', ID, true)).toEqual({ status: 'error' });
  });

  it('returns error when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await declineInquiry('token-123', ID, true)).toEqual({ status: 'error' });
  });
});

describe('fetchPhotoViewUrl', () => {
  it('returns the signed URL from the owner-only route', async () => {
    const fakeFetch = respond(200, { signedUrl: 'https://storage.test/a.jpg?token=x' });

    expect(await fetchPhotoViewUrl('token-123', 'photo-1')).toBe(
      'https://storage.test/a.jpg?token=x',
    );
    expect(fakeFetch).toHaveBeenCalledWith('/api/inquiry-photos/photo-1/view-url', {
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it.each([
    ['a failed request', 404, {}],
    ['a missing URL', 200, {}],
    ['a javascript: URL', 200, { signedUrl: 'javascript:alert(1)' }],
    ['a data: URL', 200, { signedUrl: 'data:image/png;base64,AAAA' }],
  ])('returns null for %s', async (_name, code, body) => {
    respond(code, body);
    expect(await fetchPhotoViewUrl('token-123', 'photo-1')).toBeNull();
  });
});
