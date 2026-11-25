import {
  JOB_START_DATE_PAST_MESSAGE,
  isBeforeToday,
  jobCreateSchema,
  mapJobCreateErrors,
  todayInBusinessZone,
  type JobCreateErrors,
  type JobCreateInput,
} from '@pmw/validation';
import type { JobConflict } from '../api/jobs';

/** What the owner has typed. Every field is text, as in the browser. */
export interface JobFormValues {
  customerId: string;
  item: string;
  jobType: string;
  status: string;
  startDate: string;
  dueDate: string;
  notes: string;
  leadSource: string;
  estimatedHours: string;
}

export const emptyJobForm: JobFormValues = {
  customerId: '',
  item: '',
  jobType: '',
  status: 'scheduled',
  startDate: '',
  dueDate: '',
  notes: '',
  leadSource: '',
  estimatedHours: '',
};

/** Turns the typed text into what the server expects. Blank optional fields become null. */
export function toJobInput(values: JobFormValues): JobCreateInput {
  const hours = values.estimatedHours.trim();
  return {
    // A blank customer is left out, so the message is "Customer is required."
    customer_id: values.customerId || undefined,
    item: values.item,
    job_type: values.jobType || null,
    status: values.status,
    start_date: values.startDate || null,
    due_date: values.dueDate || null,
    notes: values.notes,
    lead_source: values.leadSource || null,
    estimated_hours: hours === '' ? null : Number(hours),
  } as JobCreateInput;
}

/** The same checks the server makes, plus "not before today" (Pacific time). */
export function validateJobForm(
  values: JobFormValues,
  today: string = todayInBusinessZone(),
): JobCreateErrors {
  const parsed = jobCreateSchema.safeParse(toJobInput(values));
  const errors: JobCreateErrors = parsed.success
    ? { fieldErrors: {}, formErrors: [] }
    : mapJobCreateErrors(parsed.error);

  if (
    !errors.fieldErrors.start_date &&
    values.startDate &&
    isBeforeToday(values.startDate, today)
  ) {
    errors.fieldErrors.start_date = JOB_START_DATE_PAST_MESSAGE;
  }
  return errors;
}

export function hasErrors(errors: JobCreateErrors): boolean {
  return Object.keys(errors.fieldErrors).length > 0 || errors.formErrors.length > 0;
}

// Noon, so a time zone shift can never move the date to a neighbouring day.
function dateAtNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

/** "October 1, 2026" */
export function formatLongDate(iso: string): string {
  return dateAtNoon(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Monday, October 12" */
export function formatWeekdayDate(iso: string): string {
  return dateAtNoon(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** The wording from the Figma "time conflict" frame. */
export function conflictMessage(conflict: JobConflict): string {
  return `Job ${conflict.jobNumber} (${conflict.customerName}, ${conflict.item}) is already booked for ${formatWeekdayDate(conflict.date)}. Choose a different start date, or check the calendar for a free day.`;
}

/** The wording from the Figma "past start date" frame. */
export function pastDateMessage(today: string): string {
  return `The start date is earlier than today, ${formatLongDate(today)}. Pick today or a later day.`;
}
