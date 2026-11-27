import { z } from 'zod';
import { leadSourceSchema } from './leadSource.js';
import { CITY_MAX_LENGTH } from './serviceArea.js';

/**
 * Add customer (K3, SSPMW-363). The portal form and the server both validate with
 * this schema, so a request that skips the browser check is refused the same way.
 * Field names match the customers table. Never add a Social Security number.
 */

export const preferredContactOptions = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone call' },
  { value: 'text', label: 'Text message' },
] as const;

export type PreferredContact = (typeof preferredContactOptions)[number]['value'];

export const CUSTOMER_EXISTS_MESSAGES = {
  email: 'A customer with this email already exists.',
  phone: 'A customer with this phone number already exists.',
} as const;

export const CUSTOMER_SAVE_FAILED_MESSAGE =
  'The customer could not be saved. Check your connection and try again.';

const emailFormat = z.email();
// The same US phone format as the estimate form.
const usPhoneFormat = /^(?:\+?1[ .-]?)?(?:\([0-9]{3}\)|[0-9]{3})[ .-]?[0-9]{3}[ .-]?[0-9]{4}$/;

function requiredName(label: string) {
  return z
    .string({
      error: (issue) =>
        issue.input === undefined ? `${label} is required.` : `${label} must be text.`,
    })
    .trim()
    .min(1, { error: `${label} is required.` })
    .max(100, { error: `${label} must be 100 characters or fewer.` });
}

/** Optional text: blank or missing becomes null, anything else is trimmed. */
function optionalText(label: string, max: number) {
  return z
    .string({ error: `${label} must be text.` })
    .trim()
    .max(max, { error: `${label} must be ${max} characters or fewer.` })
    .nullish()
    .transform((value) => value || null);
}

/** True for a real calendar date written YYYY-MM-DD, so 2026-02-30 is refused. */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1900 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// A blank select or date input arrives as "". Treat it the same as not chosen.
const blankToNull = (value: unknown) => (value === '' ? null : value);

export const newCustomerSchema = z
  .strictObject(
    {
      first_name: requiredName('First name'),
      last_name: requiredName('Last name'),
      email: optionalText('Email', 254).refine(
        (value) => value === null || emailFormat.safeParse(value).success,
        { error: 'Enter a valid email address.' },
      ),
      phone: optionalText('Phone number', 32).refine(
        (value) => value === null || usPhoneFormat.test(value),
        { error: 'Enter a 10-digit US phone number, optionally starting with 1.' },
      ),
      address: optionalText('Address', 300),
      city: optionalText('City', CITY_MAX_LENGTH),
      preferred_contact: z.preprocess(
        blankToNull,
        z
          .enum(
            preferredContactOptions.map((option) => option.value),
            { error: 'Select a preferred contact method from the list.' },
          )
          .nullish()
          .transform((value) => value ?? null),
      ),
      text_ok: z.boolean({ error: 'Text OK must be true or false.' }).default(false),
      lead_source: z.preprocess(
        blankToNull,
        leadSourceSchema.nullish().transform((value) => value ?? null),
      ),
      next_follow_up_date: z.preprocess(
        blankToNull,
        z
          .string({ error: 'Next follow-up date must be a date.' })
          .refine(isCalendarDate, { error: 'Enter a real date.' })
          .nullish()
          .transform((value) => value ?? null),
      ),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? 'Some form fields are not recognized. Please refresh the page and try again.'
          : 'Please provide the customer as a JSON object.',
    },
  )
  .superRefine((value, context) => {
    // Without either one the owner can't reach the customer or spot a duplicate.
    if (value.email === null && value.phone === null) {
      for (const path of ['email', 'phone'] as const) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: 'Enter a phone number or an email address.',
        });
      }
    }
    if (value.preferred_contact === 'email' && value.email === null) {
      context.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Enter an email address to use email as the preferred contact.',
      });
    }
    if (
      (value.preferred_contact === 'phone' || value.preferred_contact === 'text') &&
      value.phone === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'Enter a phone number to use calls or texts as the preferred contact.',
      });
    }
    if (value.preferred_contact === 'text' && !value.text_ok) {
      context.addIssue({
        code: 'custom',
        path: ['text_ok'],
        message: 'Check "OK to text" to use text messages as the preferred contact.',
      });
    }
  });

export type NewCustomerInput = z.input<typeof newCustomerSchema>;
export type NewCustomerData = z.output<typeof newCustomerSchema>;
export type NewCustomerField = keyof NewCustomerInput;
export type NewCustomerFieldErrors = Partial<Record<NewCustomerField, string>>;

export interface NewCustomerErrors {
  fieldErrors: NewCustomerFieldErrors;
  formErrors: string[];
}

export const newCustomerFields = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'text_ok',
  'preferred_contact',
  'address',
  'city',
  'lead_source',
  'next_follow_up_date',
] as const satisfies readonly NewCustomerField[];

/** One message per field, the first one found, matching the shared input components. */
export function mapNewCustomerErrors(error: z.ZodError): NewCustomerErrors {
  const fieldErrors: NewCustomerFieldErrors = {};
  const formErrors: string[] = [];
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && (newCustomerFields as readonly string[]).includes(field)) {
      fieldErrors[field as NewCustomerField] ??= issue.message;
    } else {
      formErrors.push(issue.message);
    }
  }
  return { fieldErrors, formErrors };
}
