import type { JobCreateFieldErrors, JobCreateInput } from '@pmw/validation';

export interface CustomerOption {
  id: string;
  name: string;
  city: string | null;
}

export type CustomerOptionsResult =
  | { status: 'ok'; customers: CustomerOption[] }
  | { status: 'unauthenticated' }
  | { status: 'no-access' }
  | { status: 'error' };

function isCustomerOption(value: unknown): value is CustomerOption {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.name === 'string' &&
    (row.city === null || typeof row.city === 'string')
  );
}

export async function fetchCustomerOptions(accessToken: string): Promise<CustomerOptionsResult> {
  try {
    const response = await fetch('/api/job-customers', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'no-access' };
    if (!response.ok) return { status: 'error' };
    const body: unknown = await response.json();
    const customers =
      typeof body === 'object' && body !== null
        ? (body as { customers?: unknown }).customers
        : null;
    if (!Array.isArray(customers) || !customers.every(isCustomerOption)) {
      return { status: 'error' };
    }
    return { status: 'ok', customers };
  } catch {
    return { status: 'error' };
  }
}

/** The other job that already holds the start date, as the server reports it. */
export interface JobConflict {
  jobNumber: string;
  customerName: string;
  item: string;
  date: string;
}

export interface CreatedJob {
  id: string;
  jobNumber: string;
}

export type CreateJobResult =
  | { status: 'ok'; job: CreatedJob }
  | { status: 'invalid'; fieldErrors: JobCreateFieldErrors; formErrors: string[] }
  | { status: 'conflict'; conflict: JobConflict }
  | { status: 'unauthenticated' }
  | { status: 'no-access' }
  | { status: 'error' };

function isCreatedJob(value: unknown): value is CreatedJob {
  if (typeof value !== 'object' || value === null) return false;
  const { id, jobNumber } = value as Record<string, unknown>;
  return typeof id === 'string' && typeof jobNumber === 'string';
}

function isJobConflict(value: unknown): value is JobConflict {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.jobNumber === 'string' &&
    typeof row.customerName === 'string' &&
    typeof row.item === 'string' &&
    typeof row.date === 'string'
  );
}

/** Keeps only the messages the server sent as text, so the page can trust what it shows. */
function readErrors(body: unknown): { fieldErrors: JobCreateFieldErrors; formErrors: string[] } {
  const fieldErrors: Record<string, string> = {};
  const formErrors: string[] = [];
  if (typeof body === 'object' && body !== null) {
    const raw = body as { fieldErrors?: unknown; formErrors?: unknown };
    if (typeof raw.fieldErrors === 'object' && raw.fieldErrors !== null) {
      for (const [field, message] of Object.entries(raw.fieldErrors)) {
        if (typeof message === 'string') fieldErrors[field] = message;
      }
    }
    if (Array.isArray(raw.formErrors)) {
      for (const message of raw.formErrors) {
        if (typeof message === 'string') formErrors.push(message);
      }
    }
  }
  return { fieldErrors: fieldErrors as JobCreateFieldErrors, formErrors };
}

export async function createJob(
  accessToken: string,
  input: JobCreateInput,
): Promise<CreateJobResult> {
  try {
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'no-access' };

    const body: unknown = await response.json().catch(() => null);
    if (response.status === 400) return { status: 'invalid', ...readErrors(body) };
    if (response.status === 409) {
      const conflict =
        typeof body === 'object' && body !== null
          ? (body as { conflict?: unknown }).conflict
          : null;
      return isJobConflict(conflict) ? { status: 'conflict', conflict } : { status: 'error' };
    }
    if (!response.ok) return { status: 'error' };

    const job = typeof body === 'object' && body !== null ? (body as { job?: unknown }).job : null;
    return isCreatedJob(job) ? { status: 'ok', job } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}
