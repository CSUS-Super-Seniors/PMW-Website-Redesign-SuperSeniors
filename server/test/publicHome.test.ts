import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  PUBLIC_SERVICE_CITIES_PATH,
  RECENT_GALLERY_PATH,
  type RecentGallery,
} from '@pmw/validation';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPublicHomeBackend, type PublicHomeBackend } from '../src/publicHome.js';

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});
const auth = {
  verifyToken: vi.fn(() => Promise.reject(new Error('Public reads must not authenticate'))),
  loadProfile: vi.fn(() => Promise.reject(new Error('Public reads must not load profiles'))),
};
const id = '00000000-0000-4000-8000-000000000225';
const path = `media/${id}.jpg`;
const imageUrl = `https://example.supabase.co/storage/v1/object/public/gallery/${path}`;

function publicApp(publicHome?: PublicHomeBackend) {
  return createApp(config, auth, undefined, { publicHome });
}

describe('public Home reads', () => {
  it('reads the active, ordered city list on every request without staff authentication', async () => {
    const rows = [{ name: 'Carmichael' }];
    const order = vi.fn(async () => ({ data: [...rows], error: null }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const backend = createPublicHomeBackend({ from } as never);
    const app = publicApp(backend);

    const first = await request(app).get(PUBLIC_SERVICE_CITIES_PATH).expect(200);
    expect(first.body).toEqual({ cities: ['Carmichael'] });
    expect(first.headers['cache-control']).toBe('no-store');
    rows.push({ name: 'Fair Oaks' });
    const updated = await request(app).get(PUBLIC_SERVICE_CITIES_PATH).expect(200);
    expect(updated.body.cities).toEqual(['Carmichael', 'Fair Oaks']);
    rows.splice(0, 1);
    expect((await request(app).get(PUBLIC_SERVICE_CITIES_PATH)).body.cities).toEqual(['Fair Oaks']);
    expect(from).toHaveBeenCalledWith('service_cities');
    expect(select).toHaveBeenCalledWith('name');
    expect(eq).toHaveBeenCalledWith('is_active', true);
    expect(order).toHaveBeenCalledWith('name');
    expect(order).toHaveBeenCalledTimes(3);
    expect(auth.verifyToken).not.toHaveBeenCalled();
  });

  it('projects only public URLs and media IDs, and reads again after removal', async () => {
    let rows: object[] = [
      {
        id,
        before_path: path,
        after_path: null,
        job_id: 'private-job-id',
        job_number: 'J-1001',
        customer_name: 'Private Customer',
        storage_path: 'private/123-Main-St.jpg',
      },
    ];
    const rpc = vi.fn(async () => ({ data: rows, error: null }));
    const bucket = vi.fn(() => ({ getPublicUrl: () => ({ data: { publicUrl: imageUrl } }) }));
    const backend = createPublicHomeBackend({ rpc, storage: { from: bucket } } as never);
    const app = publicApp(backend);
    const first = await request(app).get(RECENT_GALLERY_PATH).expect(200);
    expect(first.body).toEqual({ items: [{ id, beforeUrl: imageUrl, afterUrl: null }] });
    expect(first.headers['cache-control']).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('recent_gallery_work');
    expect(bucket).toHaveBeenCalledWith('gallery');
    expect(first.text).not.toMatch(/Private Customer|J-1001|123-Main-St|private-job-id/);
    rows = [];
    expect((await request(app).get(RECENT_GALLERY_PATH)).body).toEqual({ items: [] });
    expect(auth.verifyToken).not.toHaveBeenCalled();
  });

  it.each(['jobs/customer-name/photo.jpg', '../private.jpg', 'https://private.example/photo.jpg'])(
    'refuses a gallery path that could reveal private file information: %s',
    async (before_path) => {
      const backend = createPublicHomeBackend({
        rpc: async () => ({ data: [{ id, before_path, after_path: null }], error: null }),
      } as never);
      const response = await request(publicApp(backend)).get(RECENT_GALLERY_PATH).expect(503);
      expect(response.text).not.toContain(before_path);
    },
  );

  it('strips unexpected backend fields at the HTTP boundary', async () => {
    const response = await request(
      publicApp({
        listServiceCities: async () => [],
        recentWork: async () =>
          [
            { id, beforeUrl: imageUrl, afterUrl: null, customer: 'Hidden' },
          ] as RecentGallery['items'],
      }),
    )
      .get(RECENT_GALLERY_PATH)
      .expect(200);
    expect(response.body).toEqual({ items: [{ id, beforeUrl: imageUrl, afterUrl: null }] });
  });

  it.each([PUBLIC_SERVICE_CITIES_PATH, RECENT_GALLERY_PATH])(
    'distinguishes an unavailable backend from empty content for %s',
    async (endpoint) => {
      await request(publicApp()).get(endpoint).expect(503);
      const backend: PublicHomeBackend = {
        listServiceCities: async () => {
          throw new Error('secret database details');
        },
        recentWork: async () => {
          throw new Error('secret database details');
        },
      };
      const response = await request(publicApp(backend)).get(endpoint).expect(503);
      expect(response.text).not.toContain('secret');
      expect(response.headers['cache-control']).toBe('no-store');
    },
  );

  it('handles database failures without exposing their details', async () => {
    const backend = createPublicHomeBackend({
      from: () => ({
        select: () => ({ eq: () => ({ order: async () => ({ data: null, error: 'secret' }) }) }),
      }),
      rpc: async () => ({ data: null, error: 'secret' }),
    } as never);
    for (const endpoint of [PUBLIC_SERVICE_CITIES_PATH, RECENT_GALLERY_PATH]) {
      const response = await request(publicApp(backend)).get(endpoint).expect(503);
      expect(response.text).not.toContain('secret');
    }
  });
});
