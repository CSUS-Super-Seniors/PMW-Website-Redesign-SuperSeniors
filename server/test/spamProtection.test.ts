import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  ESTIMATE_HONEYPOT_FIELD,
  ESTIMATE_RATE_LIMIT_MESSAGE,
  SERVICE_AREA_RATE_LIMIT_MESSAGE,
} from '@pmw/validation';
import { ESTIMATE_SUBMIT_PATH, createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { rejectHoneypot } from '../src/lib/honeypot.js';
import { createRateLimiter, rateLimitKey } from '../src/lib/rateLimit.js';
import {
  MAX_ESTIMATE_PHOTO_UPLOAD_BYTES,
  checkEstimatePhoto,
  detectImageType,
} from '../src/lib/photoChecks.js';

const baseEnv = {
  CLIENT_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
};
const auth = {
  verifyToken: vi.fn(() => Promise.reject(new Error('Authentication must not be called'))),
  loadProfile: vi.fn(() => Promise.reject(new Error('Profiles must not be loaded'))),
};

const customer = {
  first_name: 'Margaret',
  last_name: 'Lewis',
  email: 'margaret@example.com',
  city: 'Carmichael',
  item: 'Dining chair',
};

/** The real app with a stand-in for the SSPMW-70 submit handler. */
function appWithSubmit(env: Record<string, string> = {}) {
  const saveInquiry = vi.fn();
  const sendEmails = vi.fn();
  const app = createApp(loadConfig({ ...baseEnv, ...env }), auth, undefined, {
    serviceArea: { isInServiceArea: async (city) => city === 'Carmichael' },
    estimateSubmit: (req, res) => {
      saveInquiry(req.body);
      sendEmails();
      res.status(201).json({ success: true, inquiryNumber: 'INQ-2001' });
    },
  });
  return { app, saveInquiry, sendEmails };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe('estimate submit route protection', () => {
  it('lets a normal customer submission through to the submit handler', async () => {
    const { app, saveInquiry, sendEmails } = appWithSubmit();
    const response = await request(app)
      .post(ESTIMATE_SUBMIT_PATH)
      .set('Origin', 'http://localhost:5173')
      .send({ ...customer, [ESTIMATE_HONEYPOT_FIELD]: '' })
      .expect(201);
    expect(response.body).toEqual({ success: true, inquiryNumber: 'INQ-2001' });
    // The empty honeypot is removed so a strict schema never sees it.
    expect(saveInquiry).toHaveBeenCalledExactlyOnceWith(customer);
    expect(sendEmails).toHaveBeenCalledTimes(1);
  });

  it('accepts a submission that leaves the honeypot out entirely', async () => {
    const { app, saveInquiry } = appWithSubmit();
    await request(app).post(ESTIMATE_SUBMIT_PATH).send(customer).expect(201);
    expect(saveInquiry).toHaveBeenCalledExactlyOnceWith(customer);
  });

  it.each(['https://spam.example', ' x ', 0, false, null, ['a'], { a: 1 }])(
    'drops a filled honeypot %j: no inquiry, no email, and a success-looking reply',
    async (value) => {
      const { app, saveInquiry, sendEmails } = appWithSubmit();
      const response = await request(app)
        .post(ESTIMATE_SUBMIT_PATH)
        .send({ ...customer, [ESTIMATE_HONEYPOT_FIELD]: value })
        .expect(201);
      expect(response.body).toEqual({ success: true });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(saveInquiry).not.toHaveBeenCalled();
      expect(sendEmails).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Estimate request dropped by honeypot');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('margaret');
    },
  );

  it('rejects repeated posts from one visitor once the configured limit is reached', async () => {
    const { app, saveInquiry } = appWithSubmit({
      ESTIMATE_RATE_LIMIT_MAX: '3',
      ESTIMATE_RATE_LIMIT_WINDOW_MINUTES: '10',
    });
    for (let i = 0; i < 3; i++)
      await request(app).post(ESTIMATE_SUBMIT_PATH).send(customer).expect(201);

    const blocked = await request(app).post(ESTIMATE_SUBMIT_PATH).send(customer).expect(429);
    expect(blocked.body).toEqual({ success: false, error: ESTIMATE_RATE_LIMIT_MESSAGE });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(600);
    expect(saveInquiry).toHaveBeenCalledTimes(3);
  });

  it('counts honeypot bot posts toward the limit too', async () => {
    const { app } = appWithSubmit({ ESTIMATE_RATE_LIMIT_MAX: '2' });
    const bot = { ...customer, [ESTIMATE_HONEYPOT_FIELD]: 'spam' };
    await request(app).post(ESTIMATE_SUBMIT_PATH).send(bot).expect(201);
    await request(app).post(ESTIMATE_SUBMIT_PATH).send(bot).expect(201);
    await request(app).post(ESTIMATE_SUBMIT_PATH).send(bot).expect(429);
  });

  it('limits each visitor separately when a trusted proxy reports the client IP', async () => {
    const { app } = appWithSubmit({ ESTIMATE_RATE_LIMIT_MAX: '1', TRUST_PROXY_HOPS: '1' });
    const from = (ip: string) =>
      request(app).post(ESTIMATE_SUBMIT_PATH).set('X-Forwarded-For', ip).send(customer);
    await from('203.0.113.1').expect(201);
    await from('203.0.113.1').expect(429);
    await from('203.0.113.2').expect(201);
  });

  it('ignores a spoofed X-Forwarded-For when no proxy is trusted', async () => {
    const { app } = appWithSubmit({ ESTIMATE_RATE_LIMIT_MAX: '1' });
    const from = (ip: string) =>
      request(app).post(ESTIMATE_SUBMIT_PATH).set('X-Forwarded-For', ip).send(customer);
    await from('203.0.113.1').expect(201);
    await from('203.0.113.99').expect(429);
  });

  it('refuses an outside-area city on the submit route after the spam checks', async () => {
    const { app, saveInquiry } = appWithSubmit();
    const response = await request(app)
      .post(ESTIMATE_SUBMIT_PATH)
      .send({ ...customer, city: 'Davis', [ESTIMATE_HONEYPOT_FIELD]: '' })
      .expect(422);
    expect(response.body.code).toBe('outside_service_area');
    expect(saveInquiry).not.toHaveBeenCalled();

    // A bot gets the fake success before the city is even looked at.
    await request(app)
      .post(ESTIMATE_SUBMIT_PATH)
      .send({ ...customer, city: 'Davis', [ESTIMATE_HONEYPOT_FIELD]: 'spam' })
      .expect(201);
    expect(saveInquiry).not.toHaveBeenCalled();
  });

  it('limits rotating IPv6 addresses from one /64 as one visitor', async () => {
    const { app } = appWithSubmit({ ESTIMATE_RATE_LIMIT_MAX: '1', TRUST_PROXY_HOPS: '1' });
    const from = (ip: string) =>
      request(app).post(ESTIMATE_SUBMIT_PATH).set('X-Forwarded-For', ip).send(customer);
    await from('2001:db8:1:2::1').expect(201);
    await from('2001:db8:1:2::2').expect(429);
    await from('2001:db8:1:2:ffff:1:2:3').expect(429);
    await from('2001:db8:1:3::1').expect(201);
  });

  it('limits the service-area check too, but generously', async () => {
    const { app } = appWithSubmit();
    for (let i = 0; i < 30; i++)
      await request(app).post('/api/estimates/service-area').send({ city: 'Davis' }).expect(200);
    const blocked = await request(app)
      .post('/api/estimates/service-area')
      .send({ city: 'Davis' })
      .expect(429);
    expect(blocked.body.error).toBe(SERVICE_AREA_RATE_LIMIT_MESSAGE);
  });

  it('does not limit or trap the other public estimate endpoints', async () => {
    const { app } = appWithSubmit({ ESTIMATE_RATE_LIMIT_MAX: '1' });
    for (let i = 0; i < 3; i++)
      await request(app).post('/api/estimates/validate-step-1').send({}).expect(400);
  });

  it('answers 501 until the SSPMW-70 submit handler is passed in', async () => {
    const app = createApp(loadConfig(baseEnv), auth);
    await request(app).post(ESTIMATE_SUBMIT_PATH).send(customer).expect(501);
  });
});

describe('createRateLimiter', () => {
  function limited(options: Partial<Parameters<typeof createRateLimiter>[0]> = {}) {
    const app = express();
    app.post(
      '/',
      createRateLimiter({ max: 2, windowMs: 60_000, message: 'Slow down', ...options }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    return app;
  }

  it('opens again after the window ends', async () => {
    let time = 0;
    const app = limited({ now: () => time });
    await request(app).post('/').expect(200);
    await request(app).post('/').expect(200);
    time = 59_999;
    const blocked = await request(app).post('/').expect(429);
    expect(blocked.headers['retry-after']).toBe('1');
    time = 60_000;
    await request(app).post('/').expect(200);
  });

  it('stays bounded in memory, never resets an active limit, and never locks out new visitors', async () => {
    let time = 0;
    const app = express();
    app.set('trust proxy', 1);
    app.post(
      '/',
      createRateLimiter({
        max: 1,
        windowMs: 60_000,
        message: 'Slow down',
        maxVisitors: 2,
        // One bucket, so every untracked visitor shares it in this test.
        overflowBuckets: 1,
        overflowMax: 2,
        now: () => time,
      }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    const from = (ip: string) => request(app).post('/').set('X-Forwarded-For', ip);
    await from('203.0.113.1').expect(200);
    time = 1;
    await from('203.0.113.2').expect(200);
    time = 2;
    // Both slots are still active: .1 keeps its limit...
    await from('203.0.113.1').expect(429);
    // ...and new visitors go through the overflow bucket instead of a lockout.
    await from('203.0.113.3').expect(200);
    await from('203.0.113.4').expect(200);
    const full = await from('203.0.113.5').expect(429);
    expect(full.headers['retry-after']).toBe('60');
    time = 60_000;
    // .1's window has ended, so its slot is reused.
    await from('203.0.113.5').expect(200);
    await from('203.0.113.5').expect(429);
    await from('203.0.113.2').expect(429);
  });

  /** Calls the limiter directly, without HTTP, for flood-sized tests. */
  function directLimiter(options: Partial<Parameters<typeof createRateLimiter>[0]> = {}) {
    const limiter = createRateLimiter({
      max: 5,
      windowMs: 3_600_000,
      message: 'Slow down',
      ...options,
    });
    return (ip: string) => {
      let status = 200;
      const res = {
        set: () => res,
        status: (code: number) => {
          status = code;
          return res;
        },
        json: () => res,
      };
      let passed = false;
      limiter({ ip, socket: {} } as never, res as never, () => {
        passed = true;
      });
      return passed ? 200 : status;
    };
  }

  it('after a flood of 50,000 IPv6 networks, one address cannot drain the overflow for everyone', () => {
    const send = directLimiter();
    for (let n = 0; n < 50_000; n++) send(`2001:db8:${(n >> 16) & 0xffff}:${n & 0xffff}::1`);

    // The attacker's next address gets its bucket's 10 requests, then 429.
    const attacker = '198.51.100.7';
    const results = Array.from({ length: 12 }, () => send(attacker));
    expect(results.filter((status) => status === 200)).toHaveLength(10);
    expect(results.at(-1)).toBe(429);

    // A real customer lands in a different bucket and still gets through.
    expect(send('203.0.113.9')).toBe(200);
  });

  it('only slows new visitors down once a flood has filled every overflow bucket', () => {
    const send = directLimiter({ maxVisitors: 1, overflowBuckets: 4, overflowMax: 1 });
    send('192.0.2.1'); // takes the only tracked slot
    let passed = 0;
    for (let n = 2; n < 200; n++) if (send(`192.0.2.${n}`) === 200) passed++;
    expect(passed).toBe(4); // one per bucket, then the buckets are full
  });
});

describe('rateLimitKey', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['2001:db8:1:2::1', '2001:0db8:0001:0002::/64'],
    ['2001:DB8:1:2:a:b:c:d', '2001:0db8:0001:0002::/64'],
    ['::1', '0000:0000:0000:0000::/64'],
    ['fe80::1%eth0', 'fe80:0000:0000:0000::/64'],
    [undefined, 'unknown'],
  ])('keys %s as %s', (ip, key) => {
    expect(rateLimitKey(ip)).toBe(key);
  });
});

describe('rejectHoneypot', () => {
  it('passes through bodies that are not objects', async () => {
    const app = express();
    app.post('/', express.json({ strict: false }), rejectHoneypot('trap'), (req, res) => {
      res.json({ body: req.body });
    });
    const response = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send('"text"')
      .expect(200);
    expect(response.body).toEqual({ body: 'text' });
  });
});

describe('config', () => {
  it('uses safe defaults', () => {
    const config = loadConfig(baseEnv);
    expect(config.trustProxyHops).toBe(0);
    expect(config.estimateRateLimit).toEqual({ max: 5, windowMs: 60 * 60_000 });
  });

  it.each([
    ['ESTIMATE_RATE_LIMIT_MAX', '0'],
    ['ESTIMATE_RATE_LIMIT_MAX', '2.5'],
    ['ESTIMATE_RATE_LIMIT_MAX', 'lots'],
    ['ESTIMATE_RATE_LIMIT_WINDOW_MINUTES', '0'],
    ['ESTIMATE_RATE_LIMIT_WINDOW_MINUTES', '1441'],
    ['TRUST_PROXY_HOPS', '-1'],
    ['TRUST_PROXY_HOPS', 'true'],
  ])('rejects %s=%s', (key, value) => {
    expect(() => loadConfig({ ...baseEnv, [key]: value })).toThrow(`${key} must be a whole number`);
  });
});

describe('checkEstimatePhoto', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const pdf = Buffer.from('%PDF-1.7 not a photo');
  const html = Buffer.from('<script>alert(1)</script>');

  it('accepts real JPG and PNG files', () => {
    expect(checkEstimatePhoto(jpeg, 'image/jpeg')).toEqual({
      ok: true,
      type: 'image/jpeg',
      extension: 'jpg',
    });
    expect(checkEstimatePhoto(png, 'image/png')).toEqual({
      ok: true,
      type: 'image/png',
      extension: 'png',
    });
    expect(checkEstimatePhoto(jpeg)).toMatchObject({ ok: true, type: 'image/jpeg' });
    expect(checkEstimatePhoto(png, 'image/png; charset=binary')).toMatchObject({ ok: true });
  });

  it.each([
    ['a PDF renamed to .jpg', pdf, 'image/jpeg'],
    ['HTML renamed to .png', html, 'image/png'],
    ['a PNG sent as a JPG', png, 'image/jpeg'],
    ['a JPG sent as a GIF', jpeg, 'image/gif'],
    ['a truncated JPG header', Buffer.from([0xff, 0xd8]), 'image/jpeg'],
  ])('refuses %s with 415', (_name, bytes, type) => {
    expect(checkEstimatePhoto(bytes, type)).toEqual({
      ok: false,
      status: 415,
      error: 'Photos must be JPG or PNG images.',
    });
  });

  it('refuses a file over 10 MB with 413 and accepts exactly 10 MB', () => {
    const exact = Buffer.alloc(MAX_ESTIMATE_PHOTO_UPLOAD_BYTES);
    jpeg.copy(exact);
    expect(checkEstimatePhoto(exact, 'image/jpeg')).toMatchObject({ ok: true });
    const over = Buffer.alloc(MAX_ESTIMATE_PHOTO_UPLOAD_BYTES + 1);
    jpeg.copy(over);
    expect(checkEstimatePhoto(over, 'image/jpeg')).toEqual({
      ok: false,
      status: 413,
      error: 'Photos must be 10 MB or smaller.',
    });
  });

  it.each(['image/jpg', 'image/pjpeg', 'application/octet-stream', ''])(
    'lets the content decide when the browser declares %j',
    (type) => {
      expect(checkEstimatePhoto(jpeg, type)).toMatchObject({ ok: true, type: 'image/jpeg' });
      expect(checkEstimatePhoto(pdf, type)).toMatchObject({ ok: false, status: 415 });
    },
  );

  it('supports a smaller limit for already-compressed uploads', () => {
    const big = Buffer.alloc(1024 * 1024 + 1);
    jpeg.copy(big);
    expect(checkEstimatePhoto(big, 'image/jpeg', 1024 * 1024)).toMatchObject({
      status: 413,
      error: 'Photos must be 1 MB or smaller.',
    });
  });

  it.each([Buffer.alloc(0), undefined, 'not bytes', {}])('refuses an empty upload %j', (bytes) => {
    expect(checkEstimatePhoto(bytes, 'image/jpeg')).toMatchObject({ ok: false, status: 400 });
  });

  it('detects types by content only', () => {
    expect(detectImageType(jpeg)).toBe('image/jpeg');
    expect(detectImageType(png)).toBe('image/png');
    expect(detectImageType(pdf)).toBeUndefined();
  });
});
