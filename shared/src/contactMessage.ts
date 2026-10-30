import { z } from 'zod';

export const CONTACT_MESSAGE_LIMIT = 500;

function isUSPhone(value: string) {
  return (
    /^\+?[\d\s().-]+$/.test(value) && /^(?:1)?[2-9]\d{2}[2-9]\d{6}$/.test(value.replace(/\D/g, ''))
  );
}

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
        .refine((value) => !value || isUSPhone(value), 'Enter a valid US phone number.')
        .nullish()
        .transform((value) => {
          if (!value) return null;
          const digits = value.replace(/\D/g, '');
          return digits.length === 10 ? `+1${digits}` : `+${digits}`;
        }),
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
        .max(CONTACT_MESSAGE_LIMIT, 'Message must be 500 characters or fewer.'),
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
