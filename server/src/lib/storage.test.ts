import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  createStorageHelper,
  MAX_VIEW_EXPIRY_SECONDS,
  STORAGE_BUCKETS,
  type StorageBucket,
} from './storage.js';

const path = 'records/123/photo.jpg';

function setup() {
  const upload = vi.fn().mockResolvedValue({
    data: {
      signedUrl: 'https://storage.example/signed-upload',
      token: 'test-upload-token',
      path,
    },
    error: null,
  });

  const view = vi.fn().mockResolvedValue({
    data: {
      signedUrl: 'https://storage.example/signed-view',
    },
    error: null,
  });

  const from = vi.fn().mockReturnValue({
    createSignedUploadUrl: upload,
    createSignedUrl: view,
  });

  // A minimal fake client keeps these tests independent
  // of the network, environment variables, and real credentials.
  const client = {
    storage: { from },
  } as unknown as Pick<SupabaseClient, 'storage'>;

  return {
    helper: createStorageHelper(client),
    from,
    upload,
    view,
  };
}

describe('signed upload URLs', () => {
  it.each(STORAGE_BUCKETS)(
    'creates an upload URL for %s without permitting overwrites',
    async (bucket) => {
      const { helper, from, upload } = setup();

      const result = await helper.createSignedUploadUrl(bucket, path);

      expect(from).toHaveBeenCalledWith(bucket);
      expect(upload).toHaveBeenCalledWith(path, { upsert: false });
      expect(result).toEqual({
        bucket,
        path,
        signedUrl: 'https://storage.example/signed-upload',
        token: 'test-upload-token',
      });
    },
  );

  it('reports a storage failure instead of returning a URL', async () => {
    const { helper, upload } = setup();
    const error = new Error('Storage unavailable');

    upload.mockResolvedValueOnce({ data: null, error });

    await expect(helper.createSignedUploadUrl('inquiry photos', path)).rejects.toMatchObject({
      message: 'Could not create signed upload URL.',
      cause: error,
    });
  });

  it('rejects an incomplete upload response', async () => {
    const { helper, upload } = setup();

    upload.mockResolvedValueOnce({
      data: { signedUrl: '', token: '', path },
      error: null,
    });

    await expect(helper.createSignedUploadUrl('inquiry photos', path)).rejects.toThrow(
      'Storage returned an incomplete upload response.',
    );
  });
});

describe('signed view URLs', () => {
  it.each(['inquiry photos', 'job media'] as const)(
    'requests a five-minute view URL for %s by default',
    async (bucket) => {
      const { helper, from, view } = setup();

      const result = await helper.createSignedViewUrl(bucket, path);

      expect(from).toHaveBeenCalledWith(bucket);
      expect(view).toHaveBeenCalledWith(path, 300);
      expect(result).toEqual({
        bucket,
        path,
        signedUrl: 'https://storage.example/signed-view',
        expiresIn: 300,
      });
    },
  );

  it('passes a custom expiration to Supabase', async () => {
    const { helper, view } = setup();

    const result = await helper.createSignedViewUrl('job media', path, 30);

    expect(view).toHaveBeenCalledWith(path, 30);
    expect(result.expiresIn).toBe(30);
  });

  it.each([0, -1, 1.5, MAX_VIEW_EXPIRY_SECONDS + 1, NaN, Infinity])(
    'rejects invalid expiration %s before contacting storage',
    async (expiresIn) => {
      const { helper, from } = setup();

      await expect(helper.createSignedViewUrl('job media', path, expiresIn)).rejects.toThrow(
        'View URL expiration must be between',
      );

      expect(from).not.toHaveBeenCalled();
    },
  );

  it('reports a storage failure instead of returning a URL', async () => {
    const { helper, view } = setup();
    const error = new Error('File not found');

    view.mockResolvedValueOnce({ data: null, error });

    await expect(helper.createSignedViewUrl('job media', path)).rejects.toMatchObject({
      message: 'Could not create signed view URL.',
      cause: error,
    });
  });

  it('rejects an incomplete view response', async () => {
    const { helper, view } = setup();

    view.mockResolvedValueOnce({
      data: { signedUrl: '' },
      error: null,
    });

    await expect(helper.createSignedViewUrl('job media', path)).rejects.toThrow(
      'Storage returned an incomplete view response.',
    );
  });
});

describe('storage location validation', () => {
  it('rejects an unsupported bucket for uploads and views', async () => {
    const { helper, from } = setup();
    const bucket = 'unknown-bucket' as StorageBucket;

    await expect(helper.createSignedUploadUrl(bucket, path)).rejects.toThrow(
      'Unsupported storage bucket.',
    );

    await expect(helper.createSignedViewUrl(bucket, path)).rejects.toThrow(
      'Unsupported storage bucket.',
    );

    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    '',
    '/photo.jpg',
    '../photo.jpg',
    'records/../photo.jpg',
    'records//photo.jpg',
    'records\\photo.jpg',
    'https://example.com/photo.jpg',
  ])('rejects invalid path "%s" for uploads and views', async (badPath) => {
    const { helper, from } = setup();

    await expect(helper.createSignedUploadUrl('inquiry photos', badPath)).rejects.toThrow(
      'A valid relative storage path is required.',
    );

    await expect(helper.createSignedViewUrl('inquiry photos', badPath)).rejects.toThrow(
      'A valid relative storage path is required.',
    );

    expect(from).not.toHaveBeenCalled();
  });
});
