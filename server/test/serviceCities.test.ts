import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { SERVICE_AREA_UNAVAILABLE_MESSAGE, createServiceAreaBackend } from '../src/serviceArea.js';

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

  it.each([0, 1])(
    'limits city reads using the configured trusted proxy hops (%s)',
    async (hops) => {
      let now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const listActiveCities = vi.fn(async () => [{ name: 'Carmichael' }]);
      const app = createApp(
        { ...config, trustProxyHops: hops },
        { verifyToken: vi.fn(), loadProfile: vi.fn() },
        undefined,
        {
          serviceArea: { listActiveCities, isInServiceArea: async () => true },
        },
      );
      for (let i = 0; i < 60; i++) {
        const response = await request(app)
          .get('/api/service-cities')
          .set('X-Forwarded-For', '192.0.2.1')
          .expect(200);
        expect(response.headers['cache-control']).toBe('no-store');
      }
      now += 1500;
      const limited = await request(app)
        .get('/api/service-cities')
        .set('X-Forwarded-For', '192.0.2.1')
        .expect(429);
      expect(limited.headers['cache-control']).toBe('no-store');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
      expect(limited.body).toEqual({
        success: false,
        error: 'Too many city list requests. Please wait a minute and retry.',
      });
      expect(listActiveCities).toHaveBeenCalledTimes(60);
      await request(app)
        .get('/api/service-cities')
        .set('X-Forwarded-For', '192.0.2.2')
        .expect(hops ? 200 : 429);
      expect(listActiveCities).toHaveBeenCalledTimes(hops ? 61 : 60);
      now += 60_000;
      await request(app).get('/api/service-cities').set('X-Forwarded-For', '192.0.2.1').expect(200);
      expect(listActiveCities).toHaveBeenCalledTimes(hops ? 62 : 61);
    },
  );

  it('trims and deduplicates display names only after deterministic presentation ordering', async () => {
    const { app, rows } = setup();
    rows.splice(
      0,
      rows.length,
      { name: 'Carmichael', display_order: 9, is_active: true },
      { name: ' CARMICHAEL, CA ', display_order: 1, is_active: true },
      { name: ' fair oaks, California ', display_order: null, is_active: true },
      { name: ' Fair Oaks ', display_order: 2, is_active: true },
      { name: 'New unranked city', display_order: null, is_active: true },
      { name: 'Tie City', display_order: 3, is_active: true },
      { name: 'tie city, CA', display_order: 3, is_active: true },
    );
    const expected = {
      cities: [
        { name: 'CARMICHAEL, CA' },
        { name: 'Fair Oaks' },
        { name: 'Tie City' },
        { name: 'New unranked city' },
      ],
    };
    await request(app).get('/api/service-cities').expect(200, expected);
    rows.reverse();
    await request(app).get('/api/service-cities').expect(200, expected);
    for (const city of [
      'Carmichael',
      'CARMICHAEL, CA 95608, USA',
      ' fair OAKS ',
      'Fair Oaks, California',
      'New unranked city',
      'tie city',
    ]) {
      await request(app)
        .post('/api/estimates/service-area')
        .send({ city })
        .expect(200, { inServiceArea: true });
    }
    await request(app)
      .post('/api/estimates/service-area')
      .send({ city: 'Davis' })
      .expect(200, { inServiceArea: false });
  });

  it('keeps estimate checks and the submit guard usable before the ordering migration', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let namesUnavailable = false;
    const rows = [
      { name: 'Carmichael', is_active: true },
      { name: 'Fair Oaks', is_active: true },
      { name: 'Davis', is_active: false },
    ];
    const eq = vi.fn(async (columns: string, column: string, value: unknown) => {
      if (columns.includes('display_order')) {
        return { data: null, error: { code: '42703', message: 'private missing column details' } };
      }
      if (namesUnavailable) {
        return { data: null, error: { code: '42501', message: 'private permission details' } };
      }
      return {
        data: rows
          .filter((row) => column === 'is_active' && row.is_active === value)
          .map(({ name }) => ({ name })),
        error: null,
      };
    });
    const select = vi.fn((columns: string) => ({
      eq: (column: string, value: unknown) => eq(columns, column, value),
    }));
    const backend = createServiceAreaBackend({ from: () => ({ select }) } as never);
    const saved = vi.fn();
    const app = createApp(config, { verifyToken: vi.fn(), loadProfile: vi.fn() }, undefined, {
      serviceArea: backend,
      estimateSubmit: (_req, res) => {
        saved(res.locals.inServiceArea);
        res.status(201).json({ success: true });
      },
    });

    await request(app).get('/api/service-cities').expect(503, {
      error: 'We could not load the cities we serve. Please try again or call us.',
    });
    expect(select.mock.calls).toEqual([['name, display_order']]);
    select.mockClear();

    for (const [city, inServiceArea] of [
      ['  CARMICHAEL, CA 95608, USA ', true],
      ['Davis', false],
    ] as const) {
      await request(app).post('/api/estimates/service-area').send({ city }).expect(200, {
        inServiceArea,
      });
    }
    await request(app).post('/api/estimates').send({ city: 'Carmichael' }).expect(201);
    expect(saved).toHaveBeenCalledExactlyOnceWith(true);
    await request(app).post('/api/estimates').send({ city: 'Davis' }).expect(422);
    saved.mockClear();

    namesUnavailable = true;
    await request(app)
      .post('/api/estimates/service-area')
      .send({ city: 'Carmichael' })
      .expect(503, { error: SERVICE_AREA_UNAVAILABLE_MESSAGE });
    await request(app)
      .post('/api/estimates')
      .send({ city: 'Carmichael' })
      .expect(503, { error: SERVICE_AREA_UNAVAILABLE_MESSAGE });
    expect(saved).not.toHaveBeenCalled();
    expect(select.mock.calls).toEqual(Array.from({ length: 6 }, () => ['name']));
    expect(
      eq.mock.calls.every(([, column, value]) => column === 'is_active' && value === true),
    ).toBe(true);
    expect(warn).not.toHaveBeenCalled();
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
      serviceArea: backend,
    });
    await request(app)
      .get('/api/service-cities')
      .expect(200, {
        cities: invalidOnly ? [] : [{ name: 'Carmichael' }, { name: 'Fair   Oaks' }],
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
