import { z } from 'zod';
import { leadSourceOptions } from './leadSource.js';

/**
 * Provisional job types until the client answers Q8 (the final service names).
 * These are the types the sample jobs use. Swap this list when the client answers.
 */
export const jobTypeOptions = ['Repair', 'Refinishing', 'Restoration'] as const;
export type JobType = (typeof jobTypeOptions)[number];

/** A new job starts Scheduled or In Progress. Completed and Cancelled are set later. */
export const jobCreateStatuses = ['scheduled', 'in_progress'] as const;
export type JobCreateStatus = (typeof jobCreateStatuses)[number];
export const jobCreateStatusLabels: Record<JobCreateStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
};

export const JOB_ITEM_MAX = 200;
export const JOB_NOTES_MAX = 2000;
/** `jobs.estimated_hours` is numeric(5, 2), so this is the largest value it can hold. */
export const JOB_ESTIMATED_HOURS_MAX = 999.99;

/** The business is in Sacramento, so "today" is a Pacific time date. */
export const BUSINESS_TIME_ZONE = 'America/Los_Angeles';
export const JOB_START_DATE_PAST_MESSAGE = 'Start date cannot be in the past.';

const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a real calendar date written YYYY-MM-DD. Rejects 2026-02-30. */
export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Today's date (YYYY-MM-DD) where the business is, whatever time zone the server runs in. */
export function todayInBusinessZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Both dates are YYYY-MM-DD, so comparing them as text compares them as dates. */
export function isBeforeToday(date: string, today: string): boolean {
  return date < today;
}

/** Text the staff member may leave blank. Blank becomes null. */
function optionalText(label: string, max: number) {
  return z
    .string({ error: `${label} must be text.` })
    .nullish()
    .transform((value) => value?.trim() || null)
    .refine((value) => value === null || value.length <= max, {
      error: `${label} must be ${max} characters or fewer.`,
    });
}

function optionalDate(label: string) {
  return z
    .string({ error: `${label} must be a date.` })
    .nullish()
    .transform((value) => value?.trim() || null)
    .refine((value) => value === null || isRealIsoDate(value), {
      error: `${label} must be a real date.`,
    });
}

export const jobCreateSchema = z
  .strictObject(
    {
      customer_id: z
        .string({
          error: (issue) =>
            issue.input == null ? 'Customer is required.' : 'Choose a customer from the list.',
        })
        .trim()
        .min(1, 'Customer is required.')
        .regex(UUID_FORMAT, 'Choose a customer from the list.'),
      item: z
        .string({
          error: (issue) => (issue.input == null ? 'Item is required.' : 'Item must be text.'),
        })
        .trim()
        .min(1, 'Item is required.')
        .max(JOB_ITEM_MAX, `Item must be ${JOB_ITEM_MAX} characters or fewer.`),
      job_type: z
        .enum(jobTypeOptions, { error: 'Select a job type from the list.' })
        .nullish()
        .transform((value) => value ?? null),
      status: z
        .enum(jobCreateStatuses, { error: 'Select a status from the list.' })
        .default('scheduled'),
      start_date: optionalDate('Start date'),
      due_date: optionalDate('Due date'),
      notes: optionalText('Job notes', JOB_NOTES_MAX),
      lead_source: z
        .enum(
          leadSourceOptions.map((option) => option.value),
          { error: 'Select a lead source from the list.' },
        )
        .nullish()
        .transform((value) => value ?? null),
      estimated_hours: z
        .number({ error: 'Estimated hours must be a number.' })
        .min(0, 'Estimated hours cannot be negative.')
        .max(JOB_ESTIMATED_HOURS_MAX, `Estimated hours must be ${JOB_ESTIMATED_HOURS_MAX} or less.`)
        .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
          error: 'Estimated hours can have at most two decimal places.',
        })
        .nullish()
        .transform((value) => value ?? null),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? 'Some job fields are not recognized.'
          : 'Please send the job form as a JSON object.',
    },
  )
  .refine((job) => !job.start_date || !job.due_date || job.due_date >= job.start_date, {
    path: ['due_date'],
    error: 'Due date cannot be before the start date.',
  });

export type JobCreateInput = z.input<typeof jobCreateSchema>;
export type JobCreateData = z.output<typeof jobCreateSchema>;
export type JobCreateFieldErrors = Partial<Record<keyof JobCreateInput, string>>;
export interface JobCreateErrors {
  fieldErrors: JobCreateFieldErrors;
  formErrors: string[];
}

// One message per field, so each one lands on the right input.
export function mapJobCreateErrors(error: z.ZodError): JobCreateErrors {
  const fieldErrors: JobCreateFieldErrors = {};
  const formErrors: string[] = [];

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && Object.hasOwn(jobCreateSchema.shape, field)) {
      fieldErrors[field as keyof JobCreateInput] ??= issue.message;
    } else {
      formErrors.push(issue.message);
    }
  }

  return { fieldErrors, formErrors };
}
