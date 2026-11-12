import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_ESTIMATE_PHOTO_BYTES,
  PHOTO_BUCKET,
  uploadedEstimatePhotoSchema,
  type PhotoSession,
  type UploadedEstimatePhoto,
} from '@pmw/validation';
import { createStorageHelper } from './lib/storage.js';
import { checkEstimatePhoto } from './lib/photoChecks.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_SECONDS = 24 * 60 * 60;
const RENEWAL_GRACE_SECONDS = 7 * SESSION_SECONDS;
export class PhotoRequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export interface EstimatePhotosBackend {
  startSession(): PhotoSession;
  renewSession(token: string): PhotoSession;
  /** Verify live upload capabilities and stored bytes before an atomic submit. */
  prepareSubmission(
    token: string,
    photos: UploadedEstimatePhoto[],
  ): Promise<{ sessionId: string | null; storagePaths: string[] }>;
  upload(
    token: string,
    id: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<UploadedEstimatePhoto>;
  attachPhotos(
    inquiryId: string,
    token: string,
    photos: UploadedEstimatePhoto[],
    options?: { finalize?: boolean },
  ): Promise<void>;
  viewPhoto(photoId: string): Promise<{ signedUrl: string; expiresIn: number }>;
}

/** Stateless signed capabilities work across Express/Vercel instances. Never expose the key. */
export function createEstimatePhotosBackend(
  client: SupabaseClient,
  secret: string,
  now = () => Date.now(),
): EstimatePhotosBackend {
  const key = createHmac('sha256', secret).update('pmw:estimate-photos:v1').digest();
  function sign(value: object) {
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;
  }
  function verify(
    token: string,
    expirationGrace: number | 'confirmation' = 0,
  ): Record<string, unknown> {
    if (typeof token !== 'string' || token.length > 2048)
      throw new PhotoRequestError('Invalid photo authorization.', 401);
    const [payload, signature, extra] = token.split('.');
    const expected = createHmac('sha256', key)
      .update(payload ?? '')
      .digest();
    const received = Buffer.from(signature ?? '', 'base64url');
    if (
      !payload ||
      extra ||
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      throw new PhotoRequestError('Invalid photo authorization.', 401);
    try {
      const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (
        !value ||
        typeof value !== 'object' ||
        !Number.isInteger(value.expiresAt) ||
        (expirationGrace !== 'confirmation' &&
          value.expiresAt + expirationGrace <= Math.floor(now() / 1000))
      )
        throw new Error();
      return value;
    } catch {
      throw new PhotoRequestError(
        'Photo authorization expired. Return to photos and try again.',
        401,
      );
    }
  }
  function session(token: string, expirationGrace: number | 'confirmation' = 0) {
    const value = verify(token, expirationGrace);
    if (value.kind !== 'session' || typeof value.id !== 'string' || !UUID.test(value.id))
      throw new PhotoRequestError('Invalid photo session.', 401);
    return { id: value.id, expiresAt: value.expiresAt as number };
  }
  async function ensurePrivate() {
    const { data, error } = await client.storage.getBucket(PHOTO_BUCKET);
    if (error || !data || data.public)
      throw new Error('Private inquiry photo storage is unavailable.');
  }
  return {
    startSession() {
      const expiresAt = Math.floor(now() / 1000) + SESSION_SECONDS;
      return { token: sign({ kind: 'session', id: randomUUID(), expiresAt }), expiresAt };
    },
    renewSession(token) {
      // Only this endpoint accepts expired capabilities. Preserve identity so
      // pending inquiries remain bound to their original authorized session.
      const owner = session(token, RENEWAL_GRACE_SECONDS);
      const expiresAt = Math.floor(now() / 1000) + SESSION_SECONDS;
      return { token: sign({ kind: 'session', id: owner.id, expiresAt }), expiresAt };
    },
    async prepareSubmission(token, photos) {
      const owner = token ? session(token) : null;
      if (photos.length && !owner)
        throw new PhotoRequestError('Photo authorization is required.', 401);
      const paths = new Set<string>();
      const ids = new Set<string>();
      if (photos.length) await ensurePrivate();
      for (const input of photos) {
        const parsed = uploadedEstimatePhotoSchema.safeParse(input);
        if (!parsed.success) throw new PhotoRequestError('Invalid uploaded photo.');
        const proof = verify(parsed.data.receipt);
        if (
          proof.kind !== 'photo' ||
          proof.session !== owner?.id ||
          proof.id !== input.id ||
          proof.storagePath !== input.storagePath ||
          proof.expiresAt !== owner?.expiresAt
        )
          throw new PhotoRequestError('This photo does not belong to this request.', 403);
        if (paths.has(input.storagePath) || ids.has(input.id))
          throw new PhotoRequestError('Duplicate photos are not allowed.');
        paths.add(input.storagePath);
        ids.add(input.id);
        const object = await client.storage.from(PHOTO_BUCKET).download(input.storagePath);
        if (
          object.error ||
          !object.data ||
          createHash('sha256')
            .update(Buffer.from(await object.data.arrayBuffer()))
            .digest('hex') !== proof.hash
        )
          throw new PhotoRequestError(
            'An uploaded photo is missing or changed. Return to photos and retry.',
            409,
          );
      }
      return { sessionId: owner?.id ?? null, storagePaths: [...paths] };
    },
    async upload(token, id, bytes, contentType) {
      const owner = session(token);
      if (!UUID.test(id)) throw new PhotoRequestError('Invalid photo identifier.');
      const checked = checkEstimatePhoto(bytes, contentType, MAX_ESTIMATE_PHOTO_BYTES);
      if (!checked.ok) throw new PhotoRequestError(checked.error, checked.status);
      const type = checked.type;
      await ensurePrivate();
      const hash = createHash('sha256').update(bytes).digest('hex');
      // Content-addressed immutable paths make retrying a lost response safe.
      const storagePath = `estimate-uploads/${owner.expiresAt}/${owner.id}/${id}-${hash}.${checked.extension}`;
      const bucket = client.storage.from(PHOTO_BUCKET);
      const { error } = await bucket.upload(storagePath, bytes, {
        contentType: type,
        upsert: false,
      });
      if (error) {
        const existing = await bucket.download(storagePath);
        if (
          existing.error ||
          !existing.data ||
          !Buffer.from(await existing.data.arrayBuffer()).equals(bytes)
        )
          throw new Error('Photo upload failed.');
      }
      return {
        id,
        storagePath,
        receipt: sign({
          kind: 'photo',
          session: owner.id,
          id,
          storagePath,
          hash,
          expiresAt: owner.expiresAt,
        }),
      };
    },
    async attachPhotos(inquiryId, token, photos, options = {}) {
      if (!UUID.test(inquiryId) || !Array.isArray(photos))
        throw new PhotoRequestError('Invalid photo attachment request.');
      // No-session requests may only reconcile inquiries that never had uploads.
      // An empty retry after removal must retain its original session capability.
      // Expired signatures may only confirm an exact, already-finalized result.
      // They never authorize a draft write, renewal, upload, or signed view.
      const verification = options.finalize ? 'confirmation' : 0;
      const owner = token ? session(token, verification) : null;
      if (photos.length > 0 && !owner)
        throw new PhotoRequestError('Photo authorization is required.', 401);
      const paths = new Set<string>();
      for (const input of photos) {
        const parsed = uploadedEstimatePhotoSchema.safeParse(input);
        if (!parsed.success) throw new PhotoRequestError('Invalid uploaded photo.');
        const proof = verify(parsed.data.receipt, verification);
        if (
          proof.kind !== 'photo' ||
          proof.session !== owner?.id ||
          proof.id !== input.id ||
          proof.storagePath !== input.storagePath ||
          proof.expiresAt !== owner?.expiresAt
        )
          throw new PhotoRequestError('This photo does not belong to this request.', 403);
        paths.add(input.storagePath);
      }
      const storagePaths = [...paths];
      if (options.finalize) {
        const confirmed = await client.rpc('confirm_finalized_estimate_photos', {
          p_inquiry_id: inquiryId,
          p_session_id: owner?.id ?? null,
          p_storage_paths: storagePaths,
        });
        if (confirmed.error)
          throw new PhotoRequestError(
            'Could not confirm inquiry photos. Please retry the same request.',
            409,
          );
        if (confirmed.data === true) return;
      }
      // Confirmation did not find a completed identical operation. All writes
      // still require live capabilities and verification of the stored bytes.
      if (token) session(token);
      for (const input of photos) {
        const proof = verify(input.receipt);
        const object = await client.storage.from(PHOTO_BUCKET).download(input.storagePath);
        if (
          object.error ||
          !object.data ||
          createHash('sha256')
            .update(Buffer.from(await object.data.arrayBuffer()))
            .digest('hex') !== proof.hash
        )
          throw new PhotoRequestError(
            'An uploaded photo is missing or changed. Return to photos and retry.',
            409,
          );
      }
      // The transaction locks the inquiry, replaces the entire draft set (even []),
      // and prevents changes after final submission. Receipt validation precedes it.
      const saved = await client.rpc('reconcile_estimate_photos', {
        p_inquiry_id: inquiryId,
        p_session_id: owner?.id ?? null,
        p_storage_paths: storagePaths,
        p_finalize: options.finalize ?? false,
      });
      if (saved.error)
        throw new PhotoRequestError(
          'Could not reconcile inquiry photos. Please retry the same request.',
          409,
        );
    },
    async viewPhoto(photoId) {
      if (!UUID.test(photoId)) throw new PhotoRequestError('Invalid photo identifier.');
      const result = await client
        .from('inquiry_photos')
        .select('storage_path')
        .eq('id', photoId)
        .maybeSingle();
      if (result.error) throw new Error('Could not load photo.');
      if (!result.data) throw new PhotoRequestError('Photo not found.', 404);
      await ensurePrivate();
      const view = await createStorageHelper(client).createSignedViewUrl(
        PHOTO_BUCKET,
        result.data.storage_path,
      );
      return { signedUrl: view.signedUrl, expiresIn: view.expiresIn };
    },
  };
}
