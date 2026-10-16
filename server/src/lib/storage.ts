import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase.js';

export const STORAGE_BUCKETS = ['inquiry photos', 'job media', 'gallery'] as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

export const DEFAULT_VIEW_EXPIRY_SECONDS = 5 * 60;
export const MAX_VIEW_EXPIRY_SECONDS = 15 * 60;

function validateLocation(bucket: StorageBucket, path: string): void {
  if (!(STORAGE_BUCKETS as readonly string[]).includes(bucket)) {
    throw new Error('Unsupported storage bucket.');
  }

  if (
    typeof path !== 'string' ||
    !path.trim() ||
    path.includes('\\') ||
    path.includes('://') ||
    path.includes('\0') ||
    path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('A valid relative storage path is required.');
  }
}

// Call only from trusted server code after checking that the
// requester may upload to or view the specified file.
// Passing a client explicitly allows isolated unit tests.
export function createStorageHelper(client: Pick<SupabaseClient, 'storage'> = getSupabaseAdmin()) {
  async function createSignedUploadUrl(bucket: StorageBucket, path: string) {
    validateLocation(bucket, path);

    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: false });

    if (error) {
      throw new Error('Could not create signed upload URL.', {
        cause: error,
      });
    }

    if (!data?.signedUrl || !data.token) {
      throw new Error('Storage returned an incomplete upload response.');
    }

    return {
      bucket,
      path,
      signedUrl: data.signedUrl,
      token: data.token,
    };
  }

  async function createSignedViewUrl(
    bucket: StorageBucket,
    path: string,
    expiresIn = DEFAULT_VIEW_EXPIRY_SECONDS,
  ) {
    validateLocation(bucket, path);

    if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_VIEW_EXPIRY_SECONDS) {
      throw new Error(
        `View URL expiration must be between 1 and ${MAX_VIEW_EXPIRY_SECONDS} seconds.`,
      );
    }

    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);

    if (error) {
      throw new Error('Could not create signed view URL.', {
        cause: error,
      });
    }

    if (!data?.signedUrl) {
      throw new Error('Storage returned an incomplete view response.');
    }

    return {
      bucket,
      path,
      signedUrl: data.signedUrl,
      expiresIn,
    };
  }

  return {
    createSignedUploadUrl,
    createSignedViewUrl,
  };
}
