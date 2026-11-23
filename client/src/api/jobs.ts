/** Database values. The list shows them as Scheduled, In Progress, Completed and Cancelled. */
export const JOB_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_PAGE_SIZES = [5, 10, 20] as const;
export const DEFAULT_JOB_PAGE_SIZE = 10;
/** The server refuses longer searches. */
export const JOB_SEARCH_MAX_LENGTH = 100;

export interface JobSummary {
  id: string;
  jobNumber: string;
  customerName: string;
  item: string;
  jobType: string | null;
  status: JobStatus;
  /** Dates are `YYYY-MM-DD` with no time zone. */
  startDate: string | null;
  dueDate: string | null;
}

export interface JobPage {
  jobs: JobSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JobListQuery {
  page: number;
  pageSize: number;
  status: JobStatus | null;
  /** Empty means no search. */
  search: string;
}

export type JobListResult =
  | ({ status: 'ok' } & JobPage)
  | { status: 'unauthenticated' }
  | { status: 'no-access' }
  | { status: 'error' };

const statuses: readonly string[] = JOB_STATUSES;

function isWholeNumber(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isJobSummary(value: unknown): value is JobSummary {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.jobNumber === 'string' &&
    typeof row.customerName === 'string' &&
    typeof row.item === 'string' &&
    isTextOrNull(row.jobType) &&
    typeof row.status === 'string' &&
    statuses.includes(row.status) &&
    isTextOrNull(row.startDate) &&
    isTextOrNull(row.dueDate)
  );
}

export async function fetchJobs(
  accessToken: string,
  { page, pageSize, status, search }: JobListQuery,
): Promise<JobListResult> {
  try {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) params.set('status', status);
    if (search) params.set('q', search);
    const response = await fetch(`/api/jobs?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'no-access' };
    if (!response.ok) return { status: 'error' };
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return { status: 'error' };
    const { jobs, total, page: gotPage, pageSize: gotPageSize } = body as Record<string, unknown>;
    if (
      !Array.isArray(jobs) ||
      !jobs.every(isJobSummary) ||
      !isWholeNumber(total, 0) ||
      !isWholeNumber(gotPage, 1) ||
      !isWholeNumber(gotPageSize, 1)
    ) {
      return { status: 'error' };
    }
    return { status: 'ok', jobs, total, page: gotPage, pageSize: gotPageSize };
  } catch {
    return { status: 'error' };
  }
}
