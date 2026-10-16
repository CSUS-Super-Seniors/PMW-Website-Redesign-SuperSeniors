import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../src/lib/supabase.js';
import { createStorageHelper, STORAGE_BUCKETS, type StorageBucket } from '../src/lib/storage.js';

async function main() {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  assert(url, 'SUPABASE_URL is missing.');
  assert(publishableKey, 'Local SUPABASE_PUBLISHABLE_KEY is missing.');
  assert(
    ['127.0.0.1', 'localhost'].includes(new URL(url).hostname),
    'This verification script must target local Supabase.',
  );

  const admin = getSupabaseAdmin();
  const storage = createStorageHelper(admin);

  // This client has ordinary anonymous permissions.
  const visitor = createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
    'base64',
  );

  const folder = `storage-verification/${randomUUID()}`;
  const path = `${folder}/sample.png`;
  const unsignedPath = `${folder}/unsigned.png`;
  const cleanup: StorageBucket[] = [];

  async function fetchFile(fileUrl: string) {
    return fetch(fileUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
  }

  try {
    for (const bucket of STORAGE_BUCKETS) {
      const { data: config, error: configError } = await admin.storage.getBucket(bucket);

      assert(!configError && config, `Cannot inspect bucket: ${bucket}`);
      assert.equal(config.public, bucket === 'gallery');
      assert.equal(config.file_size_limit, (bucket === 'job media' ? 50 : 10) * 1024 * 1024);

      cleanup.push(bucket);

      const upload = await storage.createSignedUploadUrl(bucket, path);

      const { error: uploadError } = await visitor.storage
        .from(bucket)
        .uploadToSignedUrl(path, upload.token, image, {
          contentType: 'image/png',
        });

      assert(!uploadError, `Signed upload failed: ${bucket}`);
      console.log(`PASS: ${bucket} settings and signed upload`);

      const { error: unsignedError } = await visitor.storage
        .from(bucket)
        .upload(unsignedPath, image, {
          contentType: 'image/png',
        });

      assert(unsignedError, `Unsigned upload unexpectedly allowed: ${bucket}`);

      const publicUrl = visitor.storage.from(bucket).getPublicUrl(path).data.publicUrl;

      const directResponse = await fetchFile(publicUrl);
      const directBody = Buffer.from(await directResponse.arrayBuffer());

      if (bucket === 'gallery') {
        assert(directResponse.ok, 'Gallery public URL failed.');
        assert(directBody.equals(image), 'Gallery returned the wrong file.');
        console.log('PASS: gallery public URL');
        continue;
      }

      assert(!directResponse.ok, `Private public-path access allowed: ${bucket}`);

      const { error: downloadError } = await visitor.storage.from(bucket).download(path);

      assert(downloadError, `Private unsigned download allowed: ${bucket}`);

      const { data: files, error: listError } = await visitor.storage.from(bucket).list(folder);

      // RLS may hide the files with an empty result instead of an error.
      assert(listError || files?.length === 0, `Private files were listed: ${bucket}`);

      const view = await storage.createSignedViewUrl(bucket, path);
      const viewResponse = await fetchFile(view.signedUrl);
      const viewBody = Buffer.from(await viewResponse.arrayBuffer());

      assert(viewResponse.ok, `Signed viewing failed: ${bucket}`);
      assert(viewBody.equals(image), `Wrong signed file returned: ${bucket}`);

      console.log(`PASS: ${bucket} blocks direct access and permits signed viewing`);
    }

    const expiringUrls: Array<{ bucket: string; url: string }> = [];

    for (const bucket of ['inquiry photos', 'job media'] as const) {
      const view = await storage.createSignedViewUrl(bucket, path, 3);
      const response = await fetchFile(view.signedUrl);

      await response.arrayBuffer();
      assert(response.ok, `Short-lived URL failed before expiration: ${bucket}`);

      expiringUrls.push({ bucket, url: view.signedUrl });
    }

    console.log('Waiting five seconds to check expiration...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    for (const item of expiringUrls) {
      const response = await fetchFile(item.url);
      await response.arrayBuffer();

      assert(!response.ok, `Expired URL still allowed access: ${item.bucket}`);
      console.log(`PASS: ${item.bucket} signed URL expires`);
    }
  } finally {
    for (const bucket of cleanup) {
      const { error } = await admin.storage.from(bucket).remove([path, unsignedPath]);

      assert(!error, `Could not clean up verification files: ${bucket}`);
    }
  }

  console.log('All storage integration checks passed.');
}

main().catch((error: unknown) => {
  console.error('FAIL:', error instanceof Error ? error.message : 'Unexpected verification error.');
  process.exitCode = 1;
});
