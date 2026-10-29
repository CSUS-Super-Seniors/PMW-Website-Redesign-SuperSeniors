import { z } from 'zod';

// Approved provisional options, pending Todd's Q9 response.
export const issueOptions = [
  { value: 'loose_joints', label: 'Loose joints / wobbling' },
  { value: 'broken_wood', label: 'Broken or cracked wood' },
  { value: 'surface_damage', label: 'Scratches, dents, or chips' },
  { value: 'finish_damage', label: 'Worn, faded, or peeling finish' },
  { value: 'water_heat_fire_damage', label: 'Water, heat, or fire damage' },
  { value: 'door_drawer_problem', label: 'Doors or drawers sticking / misaligned' },
  { value: 'hardware_problem', label: 'Loose or broken hinges, handles, or hardware' },
  { value: 'veneer_damage', label: 'Loose, peeling, or missing veneer' },
  { value: 'other', label: 'Other / not sure' },
] as const;

export type IssueType = (typeof issueOptions)[number]['value'];

function requiredText(label: string, max: number) {
  return z
    .string({
      error: (issue) =>
        issue.input === undefined ? `${label} is required.` : `${label} must be text.`,
    })
    .refine((value) => value.trim().length > 0, { error: `${label} is required.` })
    .max(max, { error: `${label} must be ${max} characters or fewer.` });
}

const emailFormat = z.email();
const usPhoneFormat = /^(?:\+?1[ .-]?)?(?:\([0-9]{3}\)|[0-9]{3})[ .-]?[0-9]{3}[ .-]?[0-9]{4}$/;

export const estimateStep1Schema = z.strictObject(
  {
    first_name: requiredText('First name', 100),
    last_name: requiredText('Last name', 100),
    email: requiredText('Email', 254).refine(
      (value) => emailFormat.safeParse(value.trim()).success,
      { error: 'Enter a valid email address.' },
    ),
    phone: requiredText('Phone number', 32).refine((value) => usPhoneFormat.test(value.trim()), {
      error: 'Enter a 10-digit US phone number, optionally starting with 1.',
    }),
    text_ok: z.boolean({ error: 'Text message permission must be true or false.' }).default(false),
    address: requiredText('Service address', 300),
    city: z
      .string({ error: 'City must be text.' })
      .max(100, { error: 'City must be 100 characters or fewer.' })
      .optional(),
    item: requiredText('Item', 200),
    issue_type: z.enum(
      issueOptions.map((option) => option.value),
      { error: 'Select a problem from the list.' },
    ),
    description: requiredText('Description', 1000),
  },
  {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? 'Some form fields are not recognized. Please refresh the page and try again.'
        : 'Please provide the Step 1 form as a JSON object.',
  },
);

export type EstimateStep1Input = z.input<typeof estimateStep1Schema>;
export type EstimateStep1Data = z.infer<typeof estimateStep1Schema>;
export type EstimateStep1FieldErrors = Partial<Record<keyof EstimateStep1Input, string>>;

export interface EstimateStep1Errors {
  fieldErrors: EstimateStep1FieldErrors;
  formErrors: string[];
}

export type EstimateStep1ValidationResponse =
  { valid: true } | ({ valid: false } & EstimateStep1Errors);

// One message per field matches Input, Select, Textarea, Checkbox and InlineFieldError.
export function mapEstimateStep1Errors(error: z.ZodError): EstimateStep1Errors {
  const fieldErrors: EstimateStep1FieldErrors = {};
  const formErrors: string[] = [];

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && Object.hasOwn(estimateStep1Schema.shape, field)) {
      fieldErrors[field as keyof EstimateStep1Input] ??= issue.message;
    } else {
      formErrors.push(issue.message);
    }
  }

  return { fieldErrors, formErrors };
}
