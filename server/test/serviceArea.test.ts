import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { OUTSIDE_SERVICE_AREA_MESSAGE } from '@pmw/validation';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import {
  SERVICE_AREA_UNAVAILABLE_MESSAGE,
  createServiceAreaBackend,
  requireServiceArea,
  type ServiceAreaBackend,
} from '../src/serviceArea.js';

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});
const auth = {
  verifyToken: vi.fn(() => Promise.reject(new Error('Authentication must not be called'))),
  loadProfile: vi.fn(() => Promise.reject(new Error('Profiles must not be loaded'))),
};

/** A fake `service_cities` table: the rows can change between requests. */
function fakeCitiesTable(rows: { name: string; is_active: boolean }[]) {
  const eq = vi.fn(async (column: string, value: unknown) => ({
    data: rows.filter((row) => row[column as 'is_active'] === value).map(({ name }) => ({ name })),
    error: null,
  }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, eq, rows };
}

const sampleRows = () => [
  { name: 'Carmichael', is_active: true },
  { name: 'Fair Oaks', is_active: true },
  { name: 'Placerville', is_active: false },
];

describe('createServiceAreaBackend', () => {
  it('passes Carmichael and blocks Davis using only active service_cities rows', async () => {
    const table = fakeCitiesTable(sampleRows());
    const backend = createServiceAreaBackend(table.client);

    await expect(backend.isInServiceArea('Carmichael')).resolves.toBe(true);
    await expect(backend.isInServiceArea('Davis')).resolves.toBe(false);
    await expect(backend.isInServiceArea('Placerville')).resolves.toBe(false);
    expect(table.from).toHaveBeenCalledWith('service_cities');
    expect(table.select).toHaveBeenCalledWith('name');
    expect(table.eq).toHaveBeenCalledWith('is_active', true);
  });

  it('ignores capitalization and extra spaces', async () => {
    const backend = createServiceAreaBackend(fakeCitiesTable(sampleRows()).client);
    await expect(backend.isInServiceArea('  fair   OAKS ')).resolves.toBe(true);
  });

  it('picks up a newly added city with no code change', async () => {
    const table = fakeCitiesTable(sampleRows());
    const backend = createServiceAreaBackend(table.client);
    await expect(backend.isInServiceArea('Davis')).resolves.toBe(false);

    table.rows.push({ name: 'Davis', is_active: true });
    await expect(backend.isInServiceArea('Davis')).resolves.toBe(true);

    table.rows.find((row) => row.name === 'Davis')!.is_active = false;
    await expect(backend.isInServiceArea('Davis')).resolves.toBe(false);
  });

  it.each([
    { data: null, error: { message: 'permission denied' } },
    { data: null, error: null },
  ])('throws instead of approving when the list cannot be read: %j', async (result) => {
    const eq = vi.fn(async () => result);
    const client = { from: () => ({ select: () => ({ eq }) }) } as never;
    await expect(createServiceAreaBackend(client).isInServiceArea('Carmichael')).rejects.toThrow(
      'Service cities could not be loaded.',
    );
  });
});

describe('POST /api/estimates/service-area', () => {
  const path = '/api/estimates/service-area';
  const app = (serviceArea?: ServiceAreaBackend) => createApp(config, auth, undefined, serviceArea);

  it('answers in and out of the service area without authentication', async () => {
    const backend = createServiceAreaBackend(fakeCitiesTable(sampleRows()).client);
    const inside = await request(app(backend))
      .post(path)
      .set('Origin', 'http://localhost:5173')
      .send({ city: 'Carmichael' })
      .expect(200);
    expect(inside.body).toEqual({ inServiceArea: true });
    expect(inside.headers['cache-control']).toBe('no-store');

    const outside = await request(app(backend)).post(path).send({ city: 'Davis' }).expect(200);
    expect(outside.body).toEqual({ inServiceArea: false });
    expect(auth.verifyToken).not.toHaveBeenCalled();
  });

  it('never sends the city list to the browser', async () => {
    const backend = createServiceAreaBackend(fakeCitiesTable(sampleRows()).client);
    const response = await request(app(backend)).post(path).send({ city: 'Davis' });
    expect(response.text).not.toContain('Carmichael');
    expect(response.text).not.toContain('Fair Oaks');
  });

  it.each([
    [{}, 'City is required.'],
    [{ city: '  ' }, 'City is required.'],
    [{ city: 12 }, 'City must be text.'],
    [{ city: 'a'.repeat(101) }, 'City must be 100 characters or fewer.'],
    [{ city: 'Davis', extra: true }, 'Please provide the city as a JSON object.'],
    ['Davis', 'Please provide the city as a JSON object.'],
  ])('rejects %j with 400', async (body, error) => {
    const isInServiceArea = vi.fn();
    const response = await request(app({ isInServiceArea }))
      .post(path)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(body))
      .expect(400);
    expect(response.body).toEqual({ error });
    expect(isInServiceArea).not.toHaveBeenCalled();
  });

  it('returns 503 when the check is not configured or the city list fails', async () => {
    const missing = await request(app()).post(path).send({ city: 'Carmichael' }).expect(503);
    expect(missing.body).toEqual({ error: SERVICE_AREA_UNAVAILABLE_MESSAGE });

    const failing = { isInServiceArea: vi.fn().mockRejectedValue(new Error('db down')) };
    const failed = await request(app(failing)).post(path).send({ city: 'Carmichael' }).expect(503);
    expect(failed.body).toEqual({ error: SERVICE_AREA_UNAVAILABLE_MESSAGE });
    expect(failed.text).not.toContain('db down');
  });

  it('keeps request bodies small', async () => {
    const isInServiceArea = vi.fn();
    await request(app({ isInServiceArea }))
      .post(path)
      .send({ city: 'a'.repeat(2000) })
      .expect(413);
    expect(isInServiceArea).not.toHaveBeenCalled();
  });
});

describe('requireServiceArea (submit route guard)', () => {
  /** Stands in for the SSPMW-70 submit route, which mounts the guard the same way. */
  function submitApp(serviceArea?: ServiceAreaBackend) {
    const saved = vi.fn();
    const app = express();
    app.post('/submit', express.json(), requireServiceArea(serviceArea), (req, res) => {
      saved({ ...req.body, in_service_area: res.locals.inServiceArea });
      res.status(201).json({ success: true });
    });
    return { app, saved };
  }

  it('refuses an outside-area submit even when the browser check was skipped', async () => {
    const { app, saved } = submitApp(
      createServiceAreaBackend(fakeCitiesTable(sampleRows()).client),
    );
    const response = await request(app).post('/submit').send({ city: 'Davis' }).expect(422);
    expect(response.body).toEqual({
      error: OUTSIDE_SERVICE_AREA_MESSAGE,
      code: 'outside_service_area',
    });
    expect(saved).not.toHaveBeenCalled();
  });

  it('lets an inside-area submit through and records the result for the inquiry', async () => {
    const { app, saved } = submitApp(
      createServiceAreaBackend(fakeCitiesTable(sampleRows()).client),
    );
    await request(app).post('/submit').send({ city: 'carmichael, ca' }).expect(201);
    expect(saved).toHaveBeenCalledExactlyOnceWith({
      city: 'carmichael, ca',
      in_service_area: true,
    });
  });

  it.each([{}, { city: '' }, { city: 7 }])('refuses a missing or invalid city %j', async (body) => {
    const isInServiceArea = vi.fn();
    const { app, saved } = submitApp({ isInServiceArea });
    await request(app).post('/submit').send(body).expect(400);
    expect(isInServiceArea).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
  });

  it('refuses with 503 rather than saving when the check is unavailable', async () => {
    const failing = submitApp({ isInServiceArea: vi.fn().mockRejectedValue(new Error('down')) });
    await request(failing.app).post('/submit').send({ city: 'Carmichael' }).expect(503);
    expect(failing.saved).not.toHaveBeenCalled();

    const missing = submitApp();
    await request(missing.app).post('/submit').send({ city: 'Carmichael' }).expect(503);
    expect(missing.saved).not.toHaveBeenCalled();
  });
});
