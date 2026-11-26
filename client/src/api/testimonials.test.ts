import { afterEach, describe, expect, it, vi } from 'vitest';
import { TESTIMONIAL_HONEYPOT_FIELD } from '@pmw/validation';
import {
  getPublicTestimonials,
  submitTestimonial,
  TestimonialSubmissionError,
  TestimonialValidationError,
} from './testimonials';

const input = {
  name: 'Alex',
  email: 'alex@example.com',
  city: 'Carmichael',
  service: 'Refinishing',
  body: 'Great work.',
  can_publish: true as const,
  photo_contact_ok: false,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends the honeypot value with the testimonial request', async () => {
  vi.stubEnv('VITE_TESTIMONIALS_STUB', '');
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }, { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  const payload = { ...input, [TESTIMONIAL_HONEYPOT_FIELD]: 'bot-filled-value' };
  await submitTestimonial(payload);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    '/api/public/testimonials',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  );
});

describe('testimonial API errors', () => {
  function mockResponse(response: Response) {
    vi.stubEnv('VITE_TESTIMONIALS_STUB', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  }

  it.each([
    [429, 'Too many submissions. Please wait a minute and try again.'],
    [503, 'Testimonials are temporarily unavailable.'],
  ] as const)('preserves the friendly HTTP %s message', async (status, message) => {
    mockResponse(Response.json({ error: message }, { status }));
    await expect(submitTestimonial(input)).rejects.toMatchObject({
      name: 'TestimonialSubmissionError',
      status,
      message,
    });
  });

  it.each([
    [429, 'Too many submissions. Please wait a minute and try again.'],
    [503, 'Your testimonial could not be submitted. Please try again.'],
  ] as const)('uses a friendly fallback for malformed HTTP %s replies', async (status, message) => {
    mockResponse(new Response('<html>Proxy error</html>', { status }));
    await expect(submitTestimonial(input)).rejects.toEqual(
      new TestimonialSubmissionError(status, message),
    );
  });

  it('preserves recognized validation errors and drops unexpected fields', async () => {
    mockResponse(
      Response.json(
        { fieldErrors: { email: 'Enter a valid email address.', status: 'internal', body: 42 } },
        { status: 400 },
      ),
    );
    await expect(submitTestimonial(input)).rejects.toEqual(
      new TestimonialValidationError({ email: 'Enter a valid email address.' }),
    );
  });

  it('does not show unexpected server errors', async () => {
    mockResponse(Response.json({ error: 'private database details' }, { status: 500 }));
    await expect(submitTestimonial(input)).rejects.toThrow(
      'Your testimonial could not be submitted. Please try again.',
    );
  });
});

describe('testimonial development previews', () => {
  it.each(['success', 'failure'])(
    'previews sample cards and the %s result without API requests',
    async (stub) => {
      vi.stubEnv('DEV', true);
      vi.stubEnv('VITE_TESTIMONIALS_STUB', stub);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const entries = await getPublicTestimonials();
      expect(entries).toHaveLength(3);
      expect(entries.map((entry) => entry.rating)).toEqual([5, 4, null]);
      if (stub === 'success') await expect(submitTestimonial(input)).resolves.toBeUndefined();
      else await expect(submitTestimonial(input)).rejects.toThrow('Testimonial preview failure');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('always uses the API in production even when the preview flag is set', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_TESTIMONIALS_STUB', 'success');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ testimonials: [] }))
      .mockResolvedValueOnce(Response.json({ success: true }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getPublicTestimonials()).toEqual([]);
    await submitTestimonial(input);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/public/testimonials');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/public/testimonials',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    );
  });

  it('uses the API in development when the preview is disabled', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_TESTIMONIALS_STUB', '');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ testimonials: [] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getPublicTestimonials()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
