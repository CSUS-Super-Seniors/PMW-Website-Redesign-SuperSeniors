import { z } from 'zod';

const usPhone = /^(?:\+?1[ .-]?)?(?:\([0-9]{3}\)|[0-9]{3})[ .-]?[0-9]{3}[ .-]?[0-9]{4}$/;

export const contactMessageSchema = z
  .strictObject(
    {
      name: z
        .string({ error: 'Name is required and must be text.' })
        .trim()
        .min(1, 'Name is required.')
        .max(100, 'Name must be 100 characters or fewer.'),
      phone: z
        .string()
        .trim()
        .max(32, 'Phone number must be 32 characters or fewer.')
        .refine((value) => !value || usPhone.test(value), 'Enter a valid US phone number.')
        .nullish()
        .transform((value) => value || null),
      email: z
        .string()
        .trim()
        .max(254, 'Email must be 254 characters or fewer.')
        .refine(
          (value) => !value || z.email().safeParse(value).success,
          'Enter a valid email address.',
        )
        .nullish()
        .transform((value) => value || null),
      message: z
        .string({ error: 'Message is required and must be text.' })
        .trim()
        .min(1, 'Message is required.')
        .max(5000, 'Message must be 5000 characters or fewer.'),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? 'Some form fields are not recognized. Please refresh the page and try again.'
          : 'Please provide the contact form as a JSON object.',
    },
  )
  .refine((value) => value.phone !== null || value.email !== null, {
    path: ['email'],
    error: 'Provide a phone number or email address.',
  });

export type ContactMessageInput = z.input<typeof contactMessageSchema>;
export type ContactMessageData = z.output<typeof contactMessageSchema>;
export type ContactMessageFieldErrors = Partial<Record<keyof ContactMessageInput, string>>;

export function mapContactMessageErrors(error: z.ZodError) {
  const fieldErrors: ContactMessageFieldErrors = {};
  const formErrors: string[] = [];
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && Object.hasOwn(contactMessageSchema.shape, field)) {
      fieldErrors[field as keyof ContactMessageInput] ??= issue.message;
    } else {
      formErrors.push(issue.message);
    }
  }
  return { fieldErrors, formErrors };
}
