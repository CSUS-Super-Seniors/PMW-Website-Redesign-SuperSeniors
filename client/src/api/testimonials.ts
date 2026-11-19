import type {
  PublicTestimonial,
  TestimonialFieldErrors,
  TestimonialSubmission,
} from '@pmw/validation';

export class TestimonialValidationError extends Error {
  constructor(readonly fieldErrors: TestimonialFieldErrors) {
    super('Please check the testimonial form.');
    this.name = 'TestimonialValidationError';
  }
}

export async function getPublicTestimonials(): Promise<PublicTestimonial[]> {
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

export async function submitTestimonial(input: TestimonialSubmission): Promise<void> {
  const response = await fetch('/api/public/testimonials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (response.ok) return;
  if (response.status === 400) {
    const result: unknown = await response.json().catch(() => null);
    const fieldErrors =
      result && typeof result === 'object' ? Reflect.get(result, 'fieldErrors') : null;
    if (fieldErrors && typeof fieldErrors === 'object') {
      const recognized: TestimonialFieldErrors = {};
      for (const field of ['name', 'email', 'body', 'can_publish', 'photo_contact_ok'] as const) {
        const message: unknown = Reflect.get(fieldErrors, field);
        if (typeof message === 'string') recognized[field] = message;
      }
      if (Object.keys(recognized).length) throw new TestimonialValidationError(recognized);
    }
  }
  throw new Error('Your testimonial could not be submitted. Please try again.');
}
