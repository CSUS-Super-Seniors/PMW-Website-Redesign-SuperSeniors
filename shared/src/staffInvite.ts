import { z } from 'zod';

/** Where the invite email's link opens (SSPMW-271). Supabase must allow it as a redirect URL. */
export const STAFF_SET_PASSWORD_PATH = '/staff/set-password';

export const staffRoleOptions = [
  { value: 'employee', label: 'Employee' },
  { value: 'owner', label: 'Owner' },
] as const;

export type StaffInviteRole = (typeof staffRoleOptions)[number]['value'];

const roleValues = staffRoleOptions.map((option) => option.value) as [
  StaffInviteRole,
  ...StaffInviteRole[],
];

/** Add employee form (E6). The client checks it first; the server always checks it again. */
export const staffInviteSchema = z.strictObject(
  {
    fullName: z
      .string({ error: 'Enter a name.' })
      .trim()
      .min(1, 'Enter a name.')
      .max(100, 'Name must be 100 characters or fewer.'),
    email: z
      .string({ error: 'Enter an email address.' })
      .trim()
      .min(1, 'Enter an email address.')
      .max(254, 'Email must be 254 characters or fewer.')
      .pipe(z.email('Enter a valid email address, like name@example.com.'))
      .transform((value) => value.toLowerCase()),
    role: z.enum(roleValues, { error: 'Choose a role.' }),
  },
  {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? 'Some form fields are not recognized. Please refresh the page and try again.'
        : 'Please send the invite as a JSON object.',
  },
);

export type StaffInviteInput = z.input<typeof staffInviteSchema>;
export type StaffInviteData = z.output<typeof staffInviteSchema>;
export type StaffInviteFieldErrors = Partial<Record<keyof StaffInviteData, string>>;

export function mapStaffInviteErrors(error: z.ZodError) {
  const fieldErrors: StaffInviteFieldErrors = {};
  const formErrors: string[] = [];
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && Object.hasOwn(staffInviteSchema.shape, field)) {
      fieldErrors[field as keyof StaffInviteData] ??= issue.message;
    } else {
      formErrors.push(issue.message);
    }
  }
  return { fieldErrors, formErrors };
}
