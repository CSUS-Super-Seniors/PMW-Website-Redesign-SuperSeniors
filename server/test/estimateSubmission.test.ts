import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  businessContact,
  ESTIMATE_PHOTO_LIMIT_MESSAGE,
  MAX_ESTIMATE_PHOTOS,
  estimateSubmissionSchema,
} from '@pmw/validation';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { PhotoRequestError } from '../src/estimatePhotos.js';
import { EmailDeliveryError } from '../src/lib/emailDeliveryError.js';
import {
  createEstimateSubmissionBackend,
  createEstimateSubmitHandler,
  SubmissionConflictError,
  type EstimateSubmissionBackend,
} from '../src/estimateSubmission.js';

const input = {
  submission_id: '60000000-0000-4000-8000-000000000001',
  first_name: '  Zoë 李  ',
  last_name: 'O’Connor',
  email: ' Zoe+repairs@Example.com ',
  phone: '(916) 555-0142',
  text_ok: true,
  address: ' 123 Main St, Apt 2 ',
  city: 'Carmichael',
  item: 'Dining chair',
  issue_type: 'loose_joints',
  description: 'A wobbly leg.\n<script>visitor content</script>',
  lead_source: 'referral',
  photoSession: null,
  photos: [],
};
const saved = {
  id: '60000000-0000-4000-8000-000000000002',
  inquiry_number: 'INQ-1049',
  created_at: '2026-11-11T12:00:00Z',
};
const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});
const auth = { verifyToken: vi.fn(), loadProfile: vi.fn() };

function fixture(inArea = true) {
  const backend = {
    findSaved: vi.fn<EstimateSubmissionBackend['findSaved']>().mockResolvedValue(null),
    save: vi.fn<EstimateSubmissionBackend['save']>().mockResolvedValue({ ...saved, created: true }),
    sendReceipt: vi.fn<EstimateSubmissionBackend['sendReceipt']>().mockResolvedValue(undefined),
    sendOwnerNotice: vi
      .fn<EstimateSubmissionBackend['sendOwnerNotice']>()
      .mockResolvedValue(undefined),
  };
  const photos = {
    prepareSubmission: vi.fn(async () => ({ sessionId: null, storagePaths: [] as string[] })),
  };
  const area = { isInServiceArea: vi.fn(async () => inArea) };
  const app = createApp(config, auth, undefined, {
    serviceArea: area,
    estimateSubmit: createEstimateSubmitHandler(backend, photos),
  });
  return { app, backend, photos, area };
}

afterEach(() => vi.restoreAllMocks());

describe('final estimate submission', () => {
  it('refuses eleven photos before lookup, storage verification, save, or emails', async () => {
    const f = fixture();
    const photos = Array.from({ length: MAX_ESTIMATE_PHOTOS + 1 }, (_, index) => ({
      id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      storagePath: `path-${index}.jpg`,
      receipt: 'proof',
    }));
    const response = await request(f.app)
      .post('/api/estimates')
      .send({
        ...input,
        photoSession: { token: 'session', expiresAt: 1900000000 },
        photos,
      })
      .expect(400);
    expect(response.body.formErrors).toContain(ESTIMATE_PHOTO_LIMIT_MESSAGE);
    expect(f.backend.findSaved).not.toHaveBeenCalled();
    expect(f.photos.prepareSubmission).not.toHaveBeenCalled();
    expect(f.backend.save).not.toHaveBeenCalled();
    expect(f.backend.sendReceipt).not.toHaveBeenCalled();
    expect(f.backend.sendOwnerNotice).not.toHaveBeenCalled();
  });

  it.each([
    [new EmailDeliveryError('http_error', 403), { reason: 'http_error', httpStatus: 403 }],
    [new EmailDeliveryError('not_configured'), { reason: 'not_configured' }],
    [
      new EmailDeliveryError('invalid_response', 200),
      { reason: 'invalid_response', httpStatus: 200 },
    ],
    [new DOMException('private timeout details', 'TimeoutError'), { reason: 'timeout' }],
    [new TypeError('private endpoint details'), { reason: 'request_error' }],
    [new SyntaxError('private response body'), { reason: 'invalid_response' }],
    [
      Object.assign(new Error('private message'), { name: 'secret-provider-error', status: 403 }),
      { reason: 'unknown_error' },
    ],
  ])('logs bounded email failure context and preserves success: %j', async (error, context) => {
    const f = fixture();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    f.backend.sendReceipt.mockRejectedValueOnce(error);
    await request(f.app).post('/api/estimates').send(input).expect(201);
    expect(f.backend.save).toHaveBeenCalledTimes(1);
    expect(f.backend.sendOwnerNotice).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledExactlyOnceWith('Estimate email failed', {
      inquiryId: saved.id,
      inquiryNumber: saved.inquiry_number,
      notification: 'receipt',
      ...context,
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|secret-provider-error/);
  });
  it('saves unchanged customer fields, then requests both emails and returns the INQ number', async () => {
    const f = fixture();
    const response = await request(f.app)
      .post('/api/estimates')
      .send({ ...input, pmw_extra: '' })
      .expect(201);
    expect(response.body).toEqual({ success: true, inquiry_number: saved.inquiry_number });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(f.backend.save).toHaveBeenCalledWith(input, expect.stringMatching(/^[a-f0-9]{64}$/), {
      sessionId: null,
      storagePaths: [],
    });
    expect(f.backend.sendReceipt).toHaveBeenCalledWith({ ...saved, created: true }, input);
    expect(f.backend.sendOwnerNotice).toHaveBeenCalledWith({ ...saved, created: true }, input);
    expect(f.backend.save.mock.invocationCallOrder[0]).toBeLessThan(
      f.backend.sendReceipt.mock.invocationCallOrder[0],
    );
    expect(f.backend.save.mock.invocationCallOrder[0]).toBeLessThan(
      f.backend.sendOwnerNotice.mock.invocationCallOrder[0],
    );
  });

  it.each(['receipt', 'owner', 'both'])(
    'keeps the saved result and success response when %s email fails',
    async (failure) => {
      const f = fixture();
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      if (failure !== 'owner')
        f.backend.sendReceipt.mockRejectedValue(new Error('private Resend details'));
      if (failure !== 'receipt')
        f.backend.sendOwnerNotice.mockRejectedValue(new Error('private API key'));
      const response = await request(f.app).post('/api/estimates').send(input).expect(201);
      expect(response.body).toEqual({ success: true, inquiry_number: saved.inquiry_number });
      expect(f.backend.save).toHaveBeenCalledTimes(1);
      expect(f.backend.sendReceipt).toHaveBeenCalledTimes(1);
      expect(f.backend.sendOwnerNotice).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledTimes(failure === 'both' ? 2 : 1);
      const logs = JSON.stringify(log.mock.calls);
      expect(logs).toContain(saved.inquiry_number);
      expect(logs).not.toContain('private');
      expect(logs).not.toContain(input.email);
    },
  );

  it.each([
    { ...input, lead_source: 'tampered' },
    { ...input, lead_source: undefined },
    { ...input, email: 'bad' },
    { ...input, submission_id: 'bad' },
    { ...input, status: 'converted' },
    { ...input, in_service_area: true },
    { ...input, customer_id: randomUUID() },
    { ...input, photos: [{ id: randomUUID(), storagePath: 'path', receipt: 'proof' }] },
  ])('refuses invalid input without saving or emailing: %j', async (body) => {
    const f = fixture();
    await request(f.app).post('/api/estimates').send(body).expect(400);
    expect(f.backend.save).not.toHaveBeenCalled();
    expect(f.backend.sendReceipt).not.toHaveBeenCalled();
    expect(f.photos.prepareSubmission).not.toHaveBeenCalled();
  });

  it('refuses outside-area and unavailable-area submissions without database writes', async () => {
    const f = fixture(false);
    await request(f.app).post('/api/estimates').send(input).expect(422);
    f.area.isInServiceArea.mockRejectedValue(new Error('private database error'));
    await request(f.app).post('/api/estimates').send(input).expect(503);
    expect(f.backend.save).not.toHaveBeenCalled();
    expect(f.backend.sendOwnerNotice).not.toHaveBeenCalled();
  });

  it('drops spam and rate-limits repeated attempts before saving', async () => {
    const f = fixture();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 5; i++)
      await request(f.app)
        .post('/api/estimates')
        .send({ ...input, pmw_extra: 'bot' })
        .expect(201);
    await request(f.app).post('/api/estimates').send(input).expect(429);
    expect(f.backend.save).not.toHaveBeenCalled();
    expect(f.backend.sendReceipt).not.toHaveBeenCalled();
  });

  it('verifies photos before the transaction and never saves on invalid receipts', async () => {
    const f = fixture();
    f.photos.prepareSubmission.mockRejectedValueOnce(
      new PhotoRequestError('Invalid photo authorization.', 401),
    );
    await request(f.app).post('/api/estimates').send(input).expect(401);
    expect(f.backend.save).not.toHaveBeenCalled();
    expect(f.backend.sendOwnerNotice).not.toHaveBeenCalled();
  });

  it('returns a sanitized retryable error when lookup or atomic save fails, without email', async () => {
    const f = fixture();
    f.backend.findSaved.mockRejectedValueOnce(new Error('private DB details'));
    const first = await request(f.app).post('/api/estimates').send(input).expect(503);
    expect(f.backend.save).not.toHaveBeenCalled();
    f.backend.save.mockRejectedValueOnce(new Error('private constraint details'));
    const second = await request(f.app).post('/api/estimates').send(input).expect(503);
    expect(first.text + second.text).not.toContain('private');
    expect(f.backend.sendReceipt).not.toHaveBeenCalled();
  });

  it('returns the original result on exact retry without revalidating expired photos or re-emailing', async () => {
    const f = fixture();
    f.backend.findSaved.mockResolvedValue(saved);
    await request(f.app).post('/api/estimates').send(input).expect(201, {
      success: true,
      inquiry_number: saved.inquiry_number,
    });
    expect(f.photos.prepareSubmission).not.toHaveBeenCalled();
    expect(f.backend.save).not.toHaveBeenCalled();
    expect(f.backend.sendReceipt).not.toHaveBeenCalled();
    expect(f.backend.sendOwnerNotice).not.toHaveBeenCalled();
  });

  it('does not re-email a concurrent submission already committed by another server', async () => {
    const f = fixture();
    f.backend.save.mockResolvedValue({ ...saved, created: false });
    await request(f.app).post('/api/estimates').send(input).expect(201);
    expect(f.backend.sendReceipt).not.toHaveBeenCalled();
    expect(f.backend.sendOwnerNotice).not.toHaveBeenCalled();
  });

  it('refuses reuse of a submission ID with edited details', async () => {
    const f = fixture();
    f.backend.findSaved.mockRejectedValue(new SubmissionConflictError());
    await request(f.app).post('/api/estimates').send(input).expect(409);
    expect(f.backend.save).not.toHaveBeenCalled();
    expect(f.backend.sendReceipt).not.toHaveBeenCalled();
  });
});

function backendFixture(emailEnabled = true, portalOrigin = 'https://portal.example') {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn().mockResolvedValue({ data: { ...saved, created: true }, error: null });
  const fetchEmail = vi.fn<typeof fetch>(async () => Response.json({ id: 'email-id' }));
  const backend = createEstimateSubmissionBackend(
    { from, rpc } as unknown as Pick<SupabaseClient, 'from' | 'rpc'>,
    emailEnabled
      ? {
          apiKey: 'test-key',
          from: 'contact@pmw.example',
          to: ['todd@example.com', 'girlie@example.com'],
        }
      : undefined,
    { fetchEmail, ownerPortalOrigin: portalOrigin },
  );
  return { backend, maybeSingle, rpc, fetchEmail };
}

describe('submission persistence and Resend adapter', () => {
  it('uses one RPC for inquiry and photo links, with no browser-supplied status or customer', async () => {
    const f = backendFixture();
    const data = estimateSubmissionSchema.parse(input);
    const uploads = { sessionId: randomUUID(), storagePaths: ['retained/photo.jpg'] };
    await f.backend.save(data, 'a'.repeat(64), uploads);
    const { submission_id, photoSession, photos, ...details } = data;
    void photoSession;
    void photos;
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith('submit_estimate_request', {
      p_submission_id: submission_id,
      p_submission_hash: 'a'.repeat(64),
      p_details: details,
      p_session_id: uploads.sessionId,
      p_storage_paths: uploads.storagePaths,
    });
  });

  it('checks the exact saved payload before returning an existing inquiry', async () => {
    const f = backendFixture();
    f.maybeSingle.mockResolvedValue({
      data: { ...saved, submission_hash: 'original' },
      error: null,
    });
    expect(await f.backend.findSaved(input.submission_id, 'original')).toEqual(saved);
    await expect(f.backend.findSaved(input.submission_id, 'edited')).rejects.toBeInstanceOf(
      SubmissionConflictError,
    );
  });

  it('turns database photo conflicts into a safe error without exposing constraint details', async () => {
    const f = backendFixture();
    f.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P7501', message: 'private storage path' },
    });
    await expect(
      f.backend.save(estimateSubmissionSchema.parse(input), 'a'.repeat(64), {
        sessionId: null,
        storagePaths: [],
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Could not attach these photos. Return to photos and try again.',
    });
  });

  it.each([
    { data: null, error: { code: 'private' } },
    { data: { created: true }, error: null },
    { data: { ...saved, created: null }, error: null },
  ])('does not report success on a failed or incomplete RPC: %j', async (result) => {
    const f = backendFixture();
    f.rpc.mockResolvedValueOnce(result);
    await expect(
      f.backend.save(estimateSubmissionSchema.parse(input), 'a'.repeat(64), {
        sessionId: null,
        storagePaths: [],
      }),
    ).rejects.toThrow();
  });

  it('sends a readable receipt and owner summary with distinct recipients and idempotency keys', async () => {
    const f = backendFixture();
    const details = estimateSubmissionSchema.parse(input);
    await Promise.all([
      f.backend.sendReceipt(saved, details),
      f.backend.sendOwnerNotice(saved, details),
    ]);
    const bodies = f.fetchEmail.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies[0]).toMatchObject({
      to: ['Zoe+repairs@Example.com'],
      subject: 'Estimate request received',
    });
    expect(bodies[1]).toMatchObject({
      to: ['todd@example.com', 'girlie@example.com'],
      subject: `New estimate request: ${saved.inquiry_number}`,
      reply_to: 'Zoe+repairs@Example.com',
    });
    for (const [index, [, options]] of f.fetchEmail.mock.calls.entries()) {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(options?.headers).toMatchObject({
        'Idempotency-Key': `estimate/${saved.id}/${index === 0 ? 'receipt' : 'owner'}`,
      });
      expect(bodies[index].from).toBe('contact@pmw.example');
      expect(bodies[index].text).toContain(saved.inquiry_number);
      expect(bodies[index].text).not.toContain('receipt:');
      expect(bodies[index].attachments).toBeUndefined();
    }
    expect(bodies[0].text).toContain('Hi Zoë 李,');
    expect(bodies[0].text).toContain('Item: Dining chair');
    expect(bodies[0].text).toContain(businessContact.phoneDisplay);
    expect(bodies[0].text).not.toContain(input.address);
    expect(bodies[1].html).toBeUndefined();
    expect(bodies[0].text).not.toContain(input.description);
    expect(bodies[1].text).not.toContain(input.description);
    expect(bodies[1].text).not.toContain(input.address);
    expect(bodies[1].text).toContain('Customer: Zoë 李 O’Connor');
    expect(bodies[1].text).toContain('What happened: Loose joints / wobbling');
    expect(bodies[1].text).toContain(`https://portal.example/portal/inquiries/${saved.id}`);
  });

  it('never relays link-like names/items, private fields, or credentials in the customer receipt', async () => {
    const f = backendFixture();
    const details = {
      ...estimateSubmissionSchema.parse(input),
      first_name: 'https://spam.example/name',
      last_name: 'PRIVATE SURNAME',
      email: 'recipient@example.com',
      phone: 'PRIVATE PHONE',
      address: 'PRIVATE ADDRESS',
      city: 'PRIVATE CITY',
      item: 'https://spam.example/item',
      description: 'PRIVATE DESCRIPTION',
      photoSession: { token: 'PRIVATE TOKEN', expiresAt: 1900000000 },
      photos: [{ id: randomUUID(), storagePath: 'PRIVATE PATH', receipt: 'PRIVATE RECEIPT' }],
    };
    await f.backend.sendReceipt(saved, details);
    const body = JSON.parse(String(f.fetchEmail.mock.calls[0][1]?.body));
    expect(body.to).toEqual(['recipient@example.com']);
    expect(body.subject).toBe('Estimate request received');
    expect(body.text).toContain(saved.inquiry_number);
    expect(body.text).toContain('We received your estimate request.');
    expect(body.text).toContain('Hi there,');
    expect(body.text).toContain('Item: Furniture repair request');
    expect(`${body.text} ${body.html}`).not.toMatch(/PRIVATE|spam\.example|recipient@example/);
  });

  it('retains a provider status without retaining its private response body', async () => {
    const f = backendFixture();
    f.fetchEmail.mockResolvedValueOnce(
      Response.json({ message: 'PRIVATE PROVIDER BODY' }, { status: 403 }),
    );
    await expect(
      f.backend.sendReceipt(saved, estimateSubmissionSchema.parse(input)),
    ).rejects.toMatchObject({
      reason: 'http_error',
      httpStatus: 403,
    });
  });

  it.each([false, true])(
    'submits through the real email adapter, keeps the save, and skips emails on retry (receipt failure: %s)',
    async (receiptFails) => {
      const f = backendFixture();
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      f.fetchEmail.mockImplementation(async (_url, options) => {
        const message = JSON.parse(String(options?.body));
        return receiptFails && message.to[0] === input.email.trim()
          ? Response.json({ message: 'private provider details' }, { status: 503 })
          : Response.json({ id: 'email-id' });
      });
      const app = createApp(config, auth, undefined, {
        serviceArea: { isInServiceArea: async () => true },
        estimateSubmit: createEstimateSubmitHandler(f.backend, {
          prepareSubmission: async () => ({ sessionId: null, storagePaths: [] }),
        }),
      });
      await request(app).post('/api/estimates').send(input).expect(201, {
        success: true,
        inquiry_number: saved.inquiry_number,
      });
      expect(f.rpc).toHaveBeenCalledTimes(1);
      expect(f.fetchEmail).toHaveBeenCalledTimes(2);
      expect(f.rpc.mock.invocationCallOrder[0]).toBeLessThan(
        f.fetchEmail.mock.invocationCallOrder[0],
      );
      const receipt = JSON.parse(String(f.fetchEmail.mock.calls[0][1]?.body));
      expect(receipt.to).toEqual([input.email.trim()]);
      expect(receipt.html).toContain(saved.inquiry_number);
      expect(receipt.text).toContain(businessContact.phoneDisplay);
      expect(log).toHaveBeenCalledTimes(receiptFails ? 1 : 0);
      if (receiptFails)
        expect(log).toHaveBeenCalledWith('Estimate email failed', {
          inquiryId: saved.id,
          inquiryNumber: saved.inquiry_number,
          notification: 'receipt',
          reason: 'http_error',
          httpStatus: 503,
        });
      expect(JSON.stringify(log.mock.calls)).not.toContain('private provider details');
      const hash = f.rpc.mock.calls[0][1].p_submission_hash;
      f.maybeSingle.mockResolvedValueOnce({
        data: { ...saved, submission_hash: hash },
        error: null,
      });
      await request(app).post('/api/estimates').send(input).expect(201, {
        success: true,
        inquiry_number: saved.inquiry_number,
      });
      expect(f.rpc).toHaveBeenCalledTimes(1);
      expect(f.fetchEmail).toHaveBeenCalledTimes(2);
    },
  );

  it.each([false, true])(
    'sends the owner notice after saving and skips both emails on exact retry (owner failure: %s)',
    async (ownerFails) => {
      const f = backendFixture();
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      f.fetchEmail.mockImplementation(async (_url, options) => {
        const message = JSON.parse(String(options?.body));
        return ownerFails && message.to[0] === 'todd@example.com'
          ? Response.json({ message: 'private provider error' }, { status: 503 })
          : Response.json({ id: 'email-id' });
      });
      const app = createApp(config, auth, undefined, {
        serviceArea: { isInServiceArea: async () => true },
        estimateSubmit: createEstimateSubmitHandler(f.backend, {
          prepareSubmission: async () => ({ sessionId: null, storagePaths: [] }),
        }),
      });
      await request(app).post('/api/estimates').send(input).expect(201, {
        success: true,
        inquiry_number: saved.inquiry_number,
      });
      expect(f.rpc).toHaveBeenCalledTimes(1);
      expect(f.fetchEmail).toHaveBeenCalledTimes(2);
      expect(f.rpc.mock.invocationCallOrder[0]).toBeLessThan(
        f.fetchEmail.mock.invocationCallOrder[0],
      );
      const owner = JSON.parse(String(f.fetchEmail.mock.calls[1][1]?.body));
      expect(owner.to).toEqual(['todd@example.com', 'girlie@example.com']);
      expect(owner.text).toContain(`https://portal.example/portal/inquiries/${saved.id}`);
      expect(owner.attachments).toBeUndefined();
      expect(log).toHaveBeenCalledTimes(ownerFails ? 1 : 0);
      if (ownerFails)
        expect(log).toHaveBeenCalledWith('Estimate email failed', {
          inquiryId: saved.id,
          inquiryNumber: saved.inquiry_number,
          notification: 'owner',
          reason: 'http_error',
          httpStatus: 503,
        });
      expect(JSON.stringify(log.mock.calls)).not.toContain('private provider error');
      const hash = f.rpc.mock.calls[0][1].p_submission_hash;
      f.maybeSingle.mockResolvedValueOnce({
        data: { ...saved, submission_hash: hash },
        error: null,
      });
      await request(app).post('/api/estimates').send(input).expect(201, {
        success: true,
        inquiry_number: saved.inquiry_number,
      });
      expect(f.rpc).toHaveBeenCalledTimes(1);
      expect(f.fetchEmail).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    '',
    'not-a-url',
    'https://portal.example/path',
    'http://portal.example',
    'http://localhost.attacker.example',
  ])(
    'keeps the saved result and customer receipt when the portal setting is unusable: %s',
    async (portalOrigin) => {
      const f = backendFixture(true, portalOrigin);
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const app = createApp(config, auth, undefined, {
        serviceArea: { isInServiceArea: async () => true },
        estimateSubmit: createEstimateSubmitHandler(f.backend, {
          prepareSubmission: async () => ({ sessionId: null, storagePaths: [] }),
        }),
      });
      await request(app).post('/api/estimates').send(input).expect(201, {
        success: true,
        inquiry_number: saved.inquiry_number,
      });
      expect(f.rpc).toHaveBeenCalledTimes(1);
      expect(f.fetchEmail).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(f.fetchEmail.mock.calls[0][1]?.body)).to).toEqual([
        input.email.trim(),
      ]);
      expect(log).toHaveBeenCalledWith('Estimate email failed', {
        inquiryId: saved.id,
        inquiryNumber: saved.inquiry_number,
        notification: 'owner',
        reason: 'not_configured',
      });
    },
  );

  it.each(['http', 'network', 'malformed', 'missing-id'])(
    'rejects %s email failure so the handler can log it',
    async (failure) => {
      const f = backendFixture();
      if (failure === 'http')
        f.fetchEmail.mockResolvedValueOnce(Response.json({}, { status: 503 }));
      if (failure === 'network')
        f.fetchEmail.mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'));
      if (failure === 'malformed') f.fetchEmail.mockResolvedValueOnce(new Response('{'));
      if (failure === 'missing-id') f.fetchEmail.mockResolvedValueOnce(Response.json({}));
      await expect(
        f.backend.sendReceipt(saved, estimateSubmissionSchema.parse(input)),
      ).rejects.toThrow();
    },
  );

  it('keeps the committed success and logs a provider status through the real email adapter', async () => {
    const f = backendFixture();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    f.fetchEmail.mockResolvedValueOnce(
      Response.json({ message: 'PRIVATE PROVIDER BODY' }, { status: 403 }),
    );
    const app = createApp(config, auth, undefined, {
      serviceArea: { isInServiceArea: async () => true },
      estimateSubmit: createEstimateSubmitHandler(f.backend, {
        prepareSubmission: async () => ({ sessionId: null, storagePaths: [] }),
      }),
    });
    await request(app).post('/api/estimates').send(input).expect(201, {
      success: true,
      inquiry_number: saved.inquiry_number,
    });
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.fetchEmail).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledExactlyOnceWith('Estimate email failed', {
      inquiryId: saved.id,
      inquiryNumber: saved.inquiry_number,
      notification: 'receipt',
      reason: 'http_error',
      httpStatus: 403,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE');
  });

  it('still saves and returns success with missing email configuration', async () => {
    const f = backendFixture(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp(config, auth, undefined, {
      serviceArea: { isInServiceArea: async () => true },
      estimateSubmit: createEstimateSubmitHandler(f.backend, {
        prepareSubmission: async () => ({ sessionId: null, storagePaths: [] }),
      }),
    });
    await request(app).post('/api/estimates').send(input).expect(201);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.fetchEmail).not.toHaveBeenCalled();
  });
});
