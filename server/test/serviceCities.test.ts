import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createServiceAreaBackend } from '../src/serviceArea.js';

const config = loadConfig({
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
});

describe('public service cities and shared eligibility source', () => {
  afterEach(() => vi.restoreAllMocks());

  function setup() {
    const rows = [
      { name: 'Unranked Z', display_order: null, is_active: true },
      { name: 'Fair Oaks', display_order: 2, is_active: true },
      { name: 'Carmichael', display_order: 1, is_active: true },
      { name: 'Davis', display_order: 0, is_active: false },
      { name: 'Unranked A', display_order: null, is_active: true },
      { name: 'Another ranked city', display_order: 2, is_active: true },
    ];
    const eq = vi.fn(async () => ({ data: rows.filter((row) => row.is_active), error: null }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const backend = createServiceAreaBackend({ from } as never);
    const auth = { verifyToken: vi.fn(), loadProfile: vi.fn() };
    const app = createApp(config, auth, undefined, {
      serviceArea: backend,
      serviceCities: backend,
    });
    return { app, rows, eq, select, from, auth };
  }

  it('returns only public fields, ranked then unranked, without authentication', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app, from, select, eq, auth } = setup();
    const response = await request(app).get('/api/service-cities').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      cities: [
        { name: 'Carmichael' },
        { name: 'Another ranked city' },
        { name: 'Fair Oaks' },
        { name: 'Unranked A' },
        { name: 'Unranked Z' },
      ],
    });
    expect(from).toHaveBeenCalledWith('service_cities');
    expect(select).toHaveBeenCalledWith('name, display_order');
    expect(eq).toHaveBeenCalledWith('is_active', true);
    expect(auth.verifyToken).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('observes additions, deactivation and deletion on subsequent list and eligibility reads', async () => {
    const { app, rows } = setup();
    rows.push({ name: 'New city', display_order: null, is_active: true });
    expect((await request(app).get('/api/service-cities')).body.cities).toContainEqual({
      name: 'New city',
    });
    await request(app)
      .post('/api/estimates/service-area')
      .send({ city: 'NEW CITY, CA' })
      .expect(200, { inServiceArea: true });
    rows.find((row) => row.name === 'New city')!.is_active = false;
    expect((await request(app).get('/api/service-cities')).body.cities).not.toContainEqual({
      name: 'New city',
    });
    await request(app)
      .post('/api/estimates/service-area')
      .send({ city: 'New city' })
      .expect(200, { inServiceArea: false });
    rows.splice(
      rows.findIndex((row) => row.name === 'Carmichael'),
      1,
    );
    expect((await request(app).get('/api/service-cities')).body.cities).not.toContainEqual({
      name: 'Carmichael',
    });
  });

  it('returns an empty successful list without fallback cities', async () => {
    const { app, rows } = setup();
    rows.splice(0);
    await request(app).get('/api/service-cities').expect(200, { cities: [] });
  });

  const invalidRows = [
    { name: '' },
    { name: ' \t\n ' },
    { name: 'private-invalid-name'.repeat(10) },
    { name: 123 },
    { name: null },
    { name: { secret: 'private row details' } },
    {},
    null,
  ];

  it.each([false, true])('filters invalid rows (invalid-only array: %s)', async (invalidOnly) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = invalidOnly
      ? invalidRows
      : [
          { name: '  Fair   Oaks ', display_order: 2 },
          ...invalidRows,
          { name: 'Carmichael', display_order: 1 },
        ];
    const backend = createServiceAreaBackend({
      from: () => ({ select: () => ({ eq: async () => ({ data, error: null }) }) }),
    } as never);
    const auth = { verifyToken: vi.fn(), loadProfile: vi.fn() };
    const app = createApp(config, auth, undefined, {
      serviceCities: backend,
      serviceArea: backend,
    });
    await request(app)
      .get('/api/service-cities')
      .expect(200, {
        cities: invalidOnly ? [] : [{ name: 'Carmichael' }, { name: '  Fair   Oaks ' }],
      });
    for (const [city, inServiceArea] of [
      ['Carmichael', !invalidOnly],
      ['Davis', false],
      ['  CARMICHAEL, CA 95608, USA ', !invalidOnly],
      ['fair oaks', !invalidOnly],
    ] as const) {
      await request(app).post('/api/estimates/service-area').send({ city }).expect(200, {
        inServiceArea,
      });
    }
    // Exactly one fixed-format, count-only warning for each successful read.
    expect(warn.mock.calls).toEqual(
      Array.from({ length: 5 }, () => [
        'Service cities: skipped invalid rows; rejected-row count:',
        invalidRows.length,
      ]),
    );
  });

  it('returns safe 503 errors for missing, failed and non-array responses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const auth = { verifyToken: vi.fn(), loadProfile: vi.fn() };
    const missing = await request(createApp(config, auth)).get('/api/service-cities').expect(503);
    expect(missing.headers['cache-control']).toBe('no-store');
    for (const result of [
      { data: null, error: { message: 'private database details' } },
      { data: [{ name: 'Carmichael' }], error: { message: 'private database details' } },
      { data: null, error: null },
      { data: { name: 'Carmichael' }, error: null },
    ]) {
      const backend = createServiceAreaBackend({
        from: () => ({ select: () => ({ eq: async () => result }) }),
      } as never);
      await expect(backend.listActiveCities()).rejects.toThrow(
        'Service cities could not be loaded.',
      );
      await expect(backend.isInServiceArea('Carmichael')).rejects.toThrow(
        'Service cities could not be loaded.',
      );
      const app = createApp(config, auth, undefined, {
        serviceCities: backend,
        serviceArea: backend,
      });
      const response = await request(app).get('/api/service-cities').expect(503);
      expect(response.text).not.toContain('Carmichael');
      expect(response.text).not.toContain('private database details');
      expect(response.body.cities).toBeUndefined();
      const eligibility = await request(app)
        .post('/api/estimates/service-area')
        .send({ city: 'Carmichael' })
        .expect(503);
      expect(eligibility.text).not.toContain('private database details');
      expect(eligibility.body.inServiceArea).toBeUndefined();
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
