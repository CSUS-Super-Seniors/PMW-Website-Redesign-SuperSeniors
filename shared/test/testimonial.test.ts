import { describe, expect, it } from 'vitest';
import { mapTestimonialErrors, testimonialSubmissionSchema } from '../src/testimonial.js';

const valid = {
  name: ' Alex Example ',
  email: ' alex@example.com ',
  body: ' Excellent repair. ',
  can_publish: true,
};

describe('testimonial submission contract', () => {
  it('trims required text and defaults optional photo contact to false', () => {
    expect(testimonialSubmissionSchema.parse(valid)).toEqual({
      name: 'Alex Example',
      email: 'alex@example.com',
      body: 'Excellent repair.',
      can_publish: true,
      photo_contact_ok: false,
    });
  });

  it('accepts 500 characters and rejects 501', () => {
    expect(testimonialSubmissionSchema.safeParse({ ...valid, body: 'x'.repeat(500) }).success).toBe(
      true,
    );
    const result = testimonialSubmissionSchema.safeParse({ ...valid, body: 'x'.repeat(501) });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(mapTestimonialErrors(result.error).fieldErrors.body).toContain('500 characters');
  });

  it.each([
    { name: ' ' },
    { email: 'bad' },
    { can_publish: false },
    { can_publish: 'true' },
    { photo_contact_ok: 'false' },
    { status: 'approved' },
    { rating: 5 },
  ])('rejects invalid and server-owned data: %j', (override) => {
    expect(testimonialSubmissionSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it('accepts either optional photo-contact choice', () => {
    expect(
      testimonialSubmissionSchema.parse({ ...valid, photo_contact_ok: true }).photo_contact_ok,
    ).toBe(true);
    expect(
      testimonialSubmissionSchema.parse({ ...valid, photo_contact_ok: false }).photo_contact_ok,
    ).toBe(false);
  });
});
