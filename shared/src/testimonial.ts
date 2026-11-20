import { z } from 'zod';

export const TESTIMONIAL_BODY_LIMIT = 500;

export const testimonialSubmissionSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, 'Enter your name.')
    .max(100, 'Name must be 100 characters or fewer.'),
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .max(254, 'Email must be 254 characters or fewer.')
    .pipe(z.email('Enter a valid email address.')),
  city: z.string().trim().max(100, 'City must be 100 characters or fewer.').optional(),
  service: z.string().trim().max(200, 'Service must be 200 characters or fewer.').optional(),
  body: z
    .string()
    .max(TESTIMONIAL_BODY_LIMIT, 'Testimonial must be 500 characters or fewer.')
    .trim()
    .min(1, 'Enter your testimonial.'),
  can_publish: z.literal(true, { error: 'Permission to publish is required.' }),
  photo_contact_ok: z.boolean().default(false),
});

export type TestimonialSubmissionInput = z.input<typeof testimonialSubmissionSchema>;
export type TestimonialSubmission = z.output<typeof testimonialSubmissionSchema>;
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
