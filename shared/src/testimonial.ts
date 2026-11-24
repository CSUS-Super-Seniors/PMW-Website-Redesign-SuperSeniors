import { z } from 'zod';

export const TESTIMONIAL_BODY_LIMIT = 500;

/** Off-screen bot trap; removed by the API before validating or saving a submission. */
export const TESTIMONIAL_HONEYPOT_FIELD = 'pmw_extra';

export const testimonialSubmissionSchema = z.strictObject({
  name: z
    .string({ error: 'Full name is required.' })
    .trim()
    .min(1, 'Full name is required.')
    .max(100, 'Name must be 100 characters or fewer.'),
  email: z
    .string({ error: 'Email address is required.' })
    .trim()
    .min(1, 'Email address is required.')
    .max(254, 'Email must be 254 characters or fewer.')
    .pipe(z.email('Enter a valid email address.')),
  city: z
    .string({ error: 'City is required.' })
    .trim()
    .min(1, 'City is required.')
    .max(100, 'City must be 100 characters or fewer.'),
  service: z
    .string({ error: 'Service is required.' })
    .trim()
    .min(1, 'Service is required.')
    .max(200, 'Service must be 200 characters or fewer.'),
  body: z
    .string({ error: 'Your testimonial is required.' })
    .max(TESTIMONIAL_BODY_LIMIT, 'Testimonial must be 500 characters or fewer.')
    .trim()
    .min(1, 'Your testimonial is required.'),
  can_publish: z.literal(true, { error: 'Permission to publish is required.' }),
  photo_contact_ok: z.boolean().default(false),
});

export type TestimonialSubmissionInput = z.input<typeof testimonialSubmissionSchema>;
export type TestimonialSubmission = z.output<typeof testimonialSubmissionSchema>;
export type TestimonialSubmissionRequest = TestimonialSubmission & {
  [TESTIMONIAL_HONEYPOT_FIELD]?: string;
};
export type TestimonialFieldErrors = Partial<Record<keyof TestimonialSubmissionInput, string>>;

export type PublicTestimonial = {
  id: string;
  name: string;
  city: string | null;
  service: string | null;
  rating: number | null;
  body: string;
  submitted_at: string;
};

export function mapTestimonialErrors(error: z.ZodError) {
  const fieldErrors: TestimonialFieldErrors = {};
  const formErrors: string[] = [];
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && Object.hasOwn(testimonialSubmissionSchema.shape, field)) {
      fieldErrors[field as keyof TestimonialSubmissionInput] ??= issue.message;
    } else {
      formErrors.push(issue.message);
    }
  }
  return { fieldErrors, formErrors };
}
