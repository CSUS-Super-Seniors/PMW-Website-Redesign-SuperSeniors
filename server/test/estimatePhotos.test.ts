import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createEstimatePhotosBackend, type EstimatePhotosBackend } from '../src/estimatePhotos.js';

const id = '11111111-1111-4111-8111-111111111111';
const inquiry = '22222222-2222-4222-8222-222222222222';
const jpeg = Buffer.from([255, 216, 255, 224, 0, 0]);
function storageFixture() {
  const objects = new Map<string, Buffer>();
  const rows = new Map<string, string>();
  const finalized = new Map<string, string | null>();
  const upload = vi.fn(async (path: string, bytes: Buffer) => {
    if (objects.has(path)) return { error: new Error('Already exists') };
    objects.set(path, bytes);
    return { error: null };
  });
  const download = vi.fn(async (path: string) => ({
    data: objects.has(path) ? new Blob([new Uint8Array(objects.get(path)!)]) : null,
    error: objects.has(path) ? null : new Error('Missing'),
  }));
  const getBucket = vi.fn(async () => ({ data: { public: false }, error: null }));
  const signed = vi.fn(async () => ({
    data: { signedUrl: 'https://storage.example/signed' },
    error: null,
  }));
  const upsert = vi.fn(async (input: { inquiry_id: string; storage_path: string }[]) => {
    for (const row of input)
      if (!rows.has(row.storage_path)) rows.set(row.storage_path, row.inquiry_id);
    return { error: null };
  });
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      in: vi.fn(async (_field: string, paths: string[]) => ({
        data: paths
          .filter((path) => rows.has(path))
          .map((path) => ({ storage_path: path, inquiry_id: rows.get(path) })),
        error: null,
      })),
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: rows.size ? { storage_path: [...rows.keys()][0] } : null,
          error: null,
        })),
      })),
    })),
    upsert,
  }));
  const storageFrom = vi.fn(() => ({ upload, download, createSignedUrl: signed }));
  // Model only the RPC boundary here; transaction/security behavior is tested in SQL.
  const rpc = vi.fn(
    async (
      name: string,
      args: {
        p_inquiry_id: string;
        p_storage_paths: string[];
        p_session_id: string | null;
        p_finalize?: boolean;
      },
    ) => {
      if (name === 'confirm_finalized_estimate_photos') {
        const actual = [...rows]
          .filter(([, owner]) => owner === args.p_inquiry_id)
          .map(([path]) => path)
          .sort();
        return {
          data:
            finalized.has(args.p_inquiry_id) &&
            finalized.get(args.p_inquiry_id) === args.p_session_id &&
            JSON.stringify(actual) === JSON.stringify([...new Set(args.p_storage_paths)].sort()),
          error: null,
        };
      }
      if (finalized.has(args.p_inquiry_id)) return { error: new Error('Finalized') };
      for (const path of args.p_storage_paths) {
        if (rows.has(path) && rows.get(path) !== args.p_inquiry_id)
          return { error: new Error('Photo already attached') };
      }
      for (const [path, owner] of rows)
        if (owner === args.p_inquiry_id && !args.p_storage_paths.includes(path)) rows.delete(path);
      for (const path of args.p_storage_paths) rows.set(path, args.p_inquiry_id);
      if (args.p_finalize) finalized.set(args.p_inquiry_id, args.p_session_id);
      return { error: null };
    },
  );
  const client = {
    storage: { getBucket, from: storageFrom },
    from,
    rpc,
  } as unknown as SupabaseClient;
  let time = 1_800_000_000_000;
  const backend = createEstimatePhotosBackend(client, 'test-server-only-secret', () => time);
  return {
    backend,
    objects,
    rows,
    upload,
    download,
    getBucket,
    storageFrom,
    from,
    upsert,
    signed,
    rpc,
    expire: () => {
      time += 25 * 60 * 60 * 1000;
    },
    advanceDays: (days: number) => {
      time += days * 24 * 60 * 60 * 1000;
    },
  };
}

describe('private photo storage backend', () => {
  it('confirms the original finalized handoff after expiration without uploads or mutations', async () => {
    const f = storageFixture();
    const original = f.backend.startSession();
    const photo = await f.backend.upload(original.token, id, jpeg, 'image/jpeg');
    await f.backend.attachPhotos(inquiry, original.token, [photo], { finalize: true });
    f.advanceDays(30);
    f.rpc.mockClear();
    f.download.mockClear();
    await f.backend.attachPhotos(inquiry, original.token, [photo], { finalize: true });
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith('confirm_finalized_estimate_photos', {
      p_inquiry_id: inquiry,
      p_session_id: expect.any(String),
      p_storage_paths: [photo.storagePath],
    });
    expect(f.download).not.toHaveBeenCalled();
    expect([...f.rows.keys()]).toEqual([photo.storagePath]);
  });

  it('does not let expired credentials finalize drafts, change final sets, or claim another inquiry', async () => {
    const f = storageFixture();
    const original = f.backend.startSession();
    const photo = await f.backend.upload(original.token, id, jpeg, 'image/jpeg');
    await f.backend.attachPhotos(inquiry, original.token, [photo], { finalize: true });
    f.expire();
    for (const [target, photos] of [
      [inquiry, []],
      [id, [photo]],
    ] as const) {
      await expect(
        f.backend.attachPhotos(target, original.token, [...photos], { finalize: true }),
      ).rejects.toThrow('expired');
    }
    await expect(
      f.backend.attachPhotos(inquiry, `${original.token}x`, [photo], { finalize: true }),
    ).rejects.toThrow('authorization');
    await expect(
      f.backend.attachPhotos(
        inquiry,
        original.token,
        [{ ...photo, receipt: `${photo.receipt}x` }],
        { finalize: true },
      ),
    ).rejects.toThrow('authorization');
    await expect(f.backend.attachPhotos(inquiry, original.token, [photo])).rejects.toThrow(
      'expired',
    );
    expect([...f.rows.keys()]).toEqual([photo.storagePath]);
  });

  it('confirms zero-photo finalization with and without an upload session', async () => {
    const f = storageFixture();
    const original = f.backend.startSession();
    await f.backend.attachPhotos(inquiry, original.token, [], { finalize: true });
    await f.backend.attachPhotos(id, '', [], { finalize: true });
    f.advanceDays(30);
    await f.backend.attachPhotos(inquiry, original.token, [], { finalize: true });
    await f.backend.attachPhotos(id, '', [], { finalize: true });
    await expect(f.backend.attachPhotos(inquiry, '', [], { finalize: true })).rejects.toThrow(
      'reconcile',
    );
  });
  it('renews an expired capability without changing pending-inquiry ownership', async () => {
    const f = storageFixture();
    const original = f.backend.startSession();
    const first = await f.backend.upload(original.token, id, jpeg, 'image/jpeg');
    await f.backend.attachPhotos(inquiry, original.token, [first]);
    const originalSessionId = f.rpc.mock.calls.at(-1)?.[1].p_session_id;
    f.expire();
    await expect(f.backend.upload(original.token, id, jpeg, 'image/jpeg')).rejects.toThrow(
      'expired',
    );
    const renewed = f.backend.renewSession(original.token);
    expect(renewed.expiresAt).toBeGreaterThan(original.expiresAt);
    const reuploaded = await f.backend.upload(renewed.token, id, jpeg, 'image/jpeg');
    await f.backend.attachPhotos(inquiry, renewed.token, [reuploaded]);
    expect(f.rpc.mock.calls.at(-1)?.[1].p_session_id).toBe(originalSessionId);
    expect([...f.rows.keys()]).toEqual([reuploaded.storagePath]);
    await f.backend.attachPhotos(inquiry, renewed.token, []);
    expect(f.rows.size).toBe(0);
  });

  it('rejects tampered, photo-receipt, and too-old renewal credentials', async () => {
    const f = storageFixture();
    const original = f.backend.startSession();
    const uploaded = await f.backend.upload(original.token, id, jpeg, 'image/jpeg');
    expect(() => f.backend.renewSession(`${original.token}x`)).toThrow('authorization');
    expect(() => f.backend.renewSession(uploaded.receipt)).toThrow('session');
    f.advanceDays(9);
    expect(() => f.backend.renewSession(original.token)).toThrow('expired');
  });
  it('reconciles removed photos on retries, including removing every photo', async () => {
    const f = storageFixture();
    const session = f.backend.startSession();
    const a = await f.backend.upload(session.token, id, jpeg, 'image/jpeg');
    const b = await f.backend.upload(session.token, inquiry, jpeg, 'image/jpeg');
    await f.backend.attachPhotos(inquiry, session.token, [a, b]);
    await f.backend.attachPhotos(inquiry, session.token, [a]);
    expect([...f.rows.keys()]).toEqual([a.storagePath]);
    await f.backend.attachPhotos(inquiry, session.token, []);
    expect(f.rows.size).toBe(0);
    expect(f.rpc).toHaveBeenLastCalledWith('reconcile_estimate_photos', {
      p_inquiry_id: inquiry,
      p_session_id: expect.any(String),
      p_storage_paths: [],
      p_finalize: false,
    });
  });

  it('passes finalization atomically and reports conflicts without exposing database errors', async () => {
    const f = storageFixture();
    await f.backend.attachPhotos(inquiry, '', [], { finalize: true });
    expect(f.rpc).toHaveBeenCalledWith('reconcile_estimate_photos', {
      p_inquiry_id: inquiry,
      p_session_id: null,
      p_storage_paths: [],
      p_finalize: true,
    });
    f.rpc.mockResolvedValueOnce({ error: new Error('private database details') });
    await expect(f.backend.attachPhotos(inquiry, '', [])).rejects.toThrow('Could not reconcile');
  });

  it('does not mutate attachments when receipt verification fails', async () => {
    const f = storageFixture();
    const session = f.backend.startSession();
    const a = await f.backend.upload(session.token, id, jpeg, 'image/jpeg');
    await f.backend.attachPhotos(inquiry, session.token, [a]);
    f.rpc.mockClear();
    await expect(
      f.backend.attachPhotos(inquiry, session.token, [{ ...a, receipt: 'invalid' }]),
    ).rejects.toThrow();
    expect(f.rpc).not.toHaveBeenCalled();
    expect([...f.rows.keys()]).toEqual([a.storagePath]);
  });
  it('uploads only to the private bucket with immutable server-generated paths and no inquiry creation', async () => {
    const f = storageFixture();
    const session = f.backend.startSession();
    const result = await f.backend.upload(session.token, id, jpeg, 'image/jpeg');
    expect(f.storageFrom).toHaveBeenCalledWith('inquiry photos');
    expect(result.storagePath).toMatch(
      /^estimate-uploads\/\d+\/[\da-f-]+\/[\da-f-]+-[\da-f]+\.jpg$/,
    );
    expect(result.receipt).toBeTruthy();
    expect(f.upload).toHaveBeenCalledWith(result.storagePath, jpeg, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    expect(f.from).not.toHaveBeenCalled();
  });

  it('retries a lost response without overwriting or duplicating the object', async () => {
    const f = storageFixture();
    const session = f.backend.startSession();
    const first = await f.backend.upload(session.token, id, jpeg, 'image/jpeg');
    expect(await f.backend.upload(session.token, id, jpeg, 'image/jpeg')).toEqual(first);
    expect(f.objects.size).toBe(1);
    expect(f.download).toHaveBeenCalled();
  });

  it('links only retained signed receipts through inquiry_photos and is retry-safe', async () => {
    const f = storageFixture();
    const session = f.backend.startSession();
    const retained = await f.backend.upload(session.token, id, jpeg, 'image/jpeg');
    await f.backend.upload(session.token, inquiry, jpeg, 'image/jpeg');
    await f.backend.attachPhotos(inquiry, session.token, [retained]);
    await f.backend.attachPhotos(inquiry, session.token, [retained]);
    expect(f.rows.size).toBe(1);
    expect(f.rows.get(retained.storagePath)).toBe(inquiry);
    expect(
      f.from.mock.calls.every((args) => args.length === 0 || args[0] === 'inquiry_photos'),
    ).toBe(true);
  });

  it('rejects foreign sessions, tampered paths, and attaching to a different inquiry', async () => {
    const f = storageFixture();
    const session = f.backend.startSession();
    const uploaded = await f.backend.upload(session.token, id, jpeg, 'image/jpeg');
    await expect(
      f.backend.attachPhotos(inquiry, f.backend.startSession().token, [uploaded]),
    ).rejects.toThrow('does not belong');
    await expect(
      f.backend.attachPhotos(inquiry, session.token, [
        { ...uploaded, storagePath: 'other/photo.jpg' },
      ]),
    ).rejects.toThrow('does not belong');
    await f.backend.attachPhotos(inquiry, session.token, [uploaded]);
    await expect(f.backend.attachPhotos(id, session.token, [uploaded])).rejects.toThrow(
      'reconcile',
    );
  });

  it('rejects expired/tampered authorization, invalid types and oversized compressed files', async () => {
    const f = storageFixture();
    const session = f.backend.startSession();
    await expect(f.backend.upload(`${session.token}x`, id, jpeg, 'image/jpeg')).rejects.toThrow(
      'authorization',
    );
    await expect(
      f.backend.upload(session.token, id, Buffer.from('fake jpg'), 'image/jpeg'),
    ).rejects.toThrow('JPG or PNG');
    await expect(f.backend.upload(session.token, id, jpeg, 'image/png')).rejects.toThrow(
      'JPG or PNG',
    );
    await expect(
      f.backend.upload(session.token, id, Buffer.alloc(1024 * 1024 + 1), 'image/jpeg'),
    ).rejects.toThrow('1 MB');
    f.expire();
    await expect(f.backend.upload(session.token, id, jpeg, 'image/jpeg')).rejects.toThrow(
      'expired',
    );
    expect(f.upload).not.toHaveBeenCalled();
  });

  it('fails closed if the bucket is public and returns no receipt on storage failure', async () => {
    const f = storageFixture();
    const session = f.backend.startSession();
    f.getBucket.mockResolvedValueOnce({ data: { public: true }, error: null });
    await expect(f.backend.upload(session.token, id, jpeg, 'image/jpeg')).rejects.toThrow(
      'unavailable',
    );
    expect(f.upload).not.toHaveBeenCalled();
    f.upload.mockResolvedValueOnce({ error: new Error('storage failure') });
    await expect(f.backend.upload(session.token, id, jpeg, 'image/jpeg')).rejects.toThrow('failed');
  });

  it('allows no-photo attachment and signs views only for saved photo rows', async () => {
    const f = storageFixture();
    await f.backend.attachPhotos(inquiry, '', []);
    expect(f.from).not.toHaveBeenCalled();
    await expect(f.backend.viewPhoto(id)).rejects.toThrow('not found');
    f.rows.set('estimate-uploads/test/photo.jpg', inquiry);
    expect(await f.backend.viewPhoto(id)).toEqual({
      signedUrl: 'https://storage.example/signed',
      expiresIn: 300,
    });
    expect(f.signed).toHaveBeenCalledWith('estimate-uploads/test/photo.jpg', 300);
  });
});

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'secret',
});
function appFixture(role = 'owner') {
  const backend = {
    startSession: vi.fn(() => ({ token: 'session', expiresAt: 1900000000 })),
    renewSession: vi.fn(() => ({ token: 'renewed-session', expiresAt: 1900086400 })),
    upload: vi.fn(async () => ({ id, storagePath: 'server/path.jpg', receipt: 'proof' })),
    attachPhotos: vi.fn(),
    viewPhoto: vi.fn(async () => ({ signedUrl: 'https://storage.example/signed', expiresIn: 300 })),
  } satisfies EstimatePhotosBackend;
  const auth = {
    verifyToken: vi.fn(async () => ({ id })),
    loadProfile: vi.fn(async () => ({ role, status: 'active' })),
  };
  return { backend, auth, app: createApp(config, auth, undefined, backend) };
}

describe('photo HTTP endpoints', () => {
  it('renews through scoped authorization without staff authentication', async () => {
    const { app, backend, auth } = appFixture();
    const response = await request(app)
      .post('/api/estimates/photos/session/renew')
      .set('Authorization', 'Photo original-token')
      .expect(200);
    expect(response.body.token).toBe('renewed-session');
    expect(backend.renewSession).toHaveBeenCalledWith('original-token');
    expect(auth.verifyToken).not.toHaveBeenCalled();
  });
  beforeEach(() => vi.clearAllMocks());
  it('creates sessions and accepts binary uploads without requiring a staff login', async () => {
    const { app, backend, auth } = appFixture();
    await request(app).post('/api/estimates/photos/session').expect(201);
    const result = await request(app)
      .put(`/api/estimates/photos/${id}`)
      .set('Authorization', 'Photo session')
      .set('Content-Type', 'image/jpeg')
      .send(jpeg)
      .expect(201);
    expect(result.body.receipt).toBe('proof');
    expect(backend.upload).toHaveBeenCalledWith('session', id, jpeg, 'image/jpeg');
    expect(auth.verifyToken).not.toHaveBeenCalled();
  });
  it('enforces request size, origin restrictions, and friendly storage errors', async () => {
    const { app, backend } = appFixture();
    await request(app)
      .put(`/api/estimates/photos/${id}`)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(1024 * 1024 + 1))
      .expect(413);
    await request(app)
      .post('/api/estimates/photos/session')
      .set('Origin', 'https://evil.example')
      .expect(403);
    backend.upload.mockRejectedValueOnce(new Error('private details'));
    const response = await request(app)
      .put(`/api/estimates/photos/${id}`)
      .set('Content-Type', 'image/jpeg')
      .send(jpeg)
      .expect(503);
    expect(response.body.error).toContain('Photo upload failed');
    expect(JSON.stringify(response.body)).not.toContain('private details');
  });
  it('requires an active owner before producing signed photo views', async () => {
    const { app, backend } = appFixture();
    await request(app).get(`/api/inquiry-photos/${id}/view-url`).expect(401);
    expect(backend.viewPhoto).not.toHaveBeenCalled();
    const employee = appFixture('employee');
    await request(employee.app)
      .get(`/api/inquiry-photos/${id}/view-url`)
      .set('Authorization', 'Bearer staff')
      .expect(403);
    await request(app)
      .get(`/api/inquiry-photos/${id}/view-url`)
      .set('Authorization', 'Bearer owner')
      .expect(200);
    expect(backend.viewPhoto).toHaveBeenCalledWith(id);
  });
  it('limits repeated photo requests', async () => {
    const { app } = appFixture();
    for (let i = 0; i < 60; i++)
      await request(app).post('/api/estimates/photos/session').expect(201);
    await request(app).post('/api/estimates/photos/session').expect(429);
  });
  it('does not trust client-supplied forwarded IPs on the direct server', async () => {
    const { app } = appFixture();
    expect(app.get('trust proxy')).toBe(false);
    for (let i = 0; i < 60; i++) {
      await request(app)
        .post('/api/estimates/photos/session')
        .set('X-Forwarded-For', `192.0.2.${i + 1}`)
        .expect(201);
    }
    await request(app)
      .post('/api/estimates/photos/session')
      .set('X-Forwarded-For', '198.51.100.1')
      .expect(429);
  });
  it('keeps missing service-area integration fail-closed', async () => {
    const { app } = appFixture();
    const details = {
      first_name: 'Ana',
      last_name: 'Smith',
      email: 'ana@example.com',
      phone: '9165550123',
      address: '123 Main St',
      item: 'Chair',
      issue_type: 'other',
      description: 'Broken leg',
    };
    await request(app).post('/api/estimates/service-area').send(details).expect(503);
  });
});
