import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanupEstimatePhotos } from '../src/lib/cleanupEstimatePhotos.js';

function fixture() {
  const list = vi.fn(async (prefix: string) => ({
    error: null,
    data:
      prefix === 'estimate-uploads'
        ? [
            { name: '100', id: null },
            { name: '9999999999', id: null },
            { name: 'unrecognized', id: null },
          ]
        : prefix === 'estimate-uploads/100'
          ? [{ name: 'owner', id: null }]
          : [
              { name: 'attached.jpg', id: '1' },
              { name: 'abandoned.jpg', id: '2' },
            ],
  }));
  const remove = vi.fn(async () => ({ error: null }));
  const lookup = vi.fn((_column: string, path: string) => ({
    maybeSingle: vi.fn(async () => ({
      data: path.endsWith('/attached.jpg') ? { id: 'saved' } : null,
      error: null,
    })),
  }));
  const client = {
    storage: { from: vi.fn(() => ({ list, remove })) },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: lookup })) })),
  } as unknown as SupabaseClient;
  return { client, list, remove };
}

it('dry-runs by default and protects retained and still-claimable uploads', async () => {
  const f = fixture();
  expect(await cleanupEstimatePhotos(f.client)).toEqual({ count: 1, applied: false });
  expect(f.remove).not.toHaveBeenCalled();
  expect(f.list).not.toHaveBeenCalledWith('estimate-uploads/9999999999', expect.anything());
});

it('deletes only expired unattached uploads with apply enabled', async () => {
  const f = fixture();
  expect(await cleanupEstimatePhotos(f.client, true)).toEqual({ count: 1, applied: true });
  expect(f.remove).toHaveBeenCalledExactlyOnceWith(['estimate-uploads/100/owner/abandoned.jpg']);
});

it('fails closed on storage listing failures', async () => {
  const f = fixture();
  f.list.mockRejectedValueOnce(new Error('Offline'));
  await expect(cleanupEstimatePhotos(f.client, true)).rejects.toThrow();
  expect(f.remove).not.toHaveBeenCalled();
});
