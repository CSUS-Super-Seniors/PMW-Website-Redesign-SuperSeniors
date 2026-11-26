import type {
  PublicTestimonial,
  TestimonialFieldErrors,
  TestimonialSubmissionRequest,
} from '@pmw/validation';

export class TestimonialValidationError extends Error {
  constructor(readonly fieldErrors: TestimonialFieldErrors) {
    super('Please check the testimonial form.');
    this.name = 'TestimonialValidationError';
  }
}

export class TestimonialSubmissionError extends Error {
  constructor(
    readonly status: 429 | 503,
    message: string,
  ) {
    super(message);
    this.name = 'TestimonialSubmissionError';
  }
}

export async function getPublicTestimonials(): Promise<PublicTestimonial[]> {
  const stub = import.meta.env.DEV ? import.meta.env.VITE_TESTIMONIALS_STUB : undefined;
  if (stub === 'success' || stub === 'failure') {
    return (await import('../dev/testimonialFixtures')).testimonialFixtures;
  }
  const response = await fetch('/api/public/testimonials');
  if (!response.ok) throw new Error('Testimonials could not be loaded.');
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== 'object' ||
    !Array.isArray(Reflect.get(result, 'testimonials'))
  ) {
    throw new Error('Testimonials could not be loaded.');
  }
  return Reflect.get(result, 'testimonials') as PublicTestimonial[];
}

export async function submitTestimonial(input: TestimonialSubmissionRequest): Promise<void> {
  const stub = import.meta.env.DEV ? import.meta.env.VITE_TESTIMONIALS_STUB : undefined;
  if (stub === 'success' || stub === 'failure') {
    await new Promise<void>((resolve) => setTimeout(resolve, 600));
    if (stub === 'failure') throw new Error('Testimonial preview failure');
    return;
  }
  const response = await fetch('/api/public/testimonials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (response.ok) return;
  if (response.status === 429 || response.status === 503) {
    const result: unknown = await response.json().catch(() => null);
    const message: unknown =
      result && typeof result === 'object' ? Reflect.get(result, 'error') : null;
    throw new TestimonialSubmissionError(
      response.status,
      typeof message === 'string' && message.trim()
        ? message.trim()
        : response.status === 429
          ? 'Too many submissions. Please wait a minute and try again.'
          : 'Your testimonial could not be submitted. Please try again.',
    );
  }
  if (response.status === 400) {
    const result: unknown = await response.json().catch(() => null);
    const fieldErrors =
      result && typeof result === 'object' ? Reflect.get(result, 'fieldErrors') : null;
    if (fieldErrors && typeof fieldErrors === 'object') {
      const recognized: TestimonialFieldErrors = {};
      for (const field of [
        'name',
        'email',
        'city',
        'service',
        'body',
        'can_publish',
        'photo_contact_ok',
      ] as const) {
        const message: unknown = Reflect.get(fieldErrors, field);
        if (typeof message === 'string') recognized[field] = message;
      }
      if (Object.keys(recognized).length) throw new TestimonialValidationError(recognized);
    }
  }
  throw new Error('Your testimonial could not be submitted. Please try again.');
}
