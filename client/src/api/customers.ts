import type { CustomerStatus } from '@pmw/validation';

export interface CustomerSummary {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  city: string | null;
  email: string | null;
  /** Jobs that are not cancelled. */
  jobCount: number;
  /** YYYY-MM-DD, or null when the customer has no jobs. */
  lastJobDate: string | null;
  isRepeat: boolean;
}

export interface CustomerListParams {
  page: number;
  pageSize: number;
  /** Empty means no search. */
  search: string;
  /** Empty means all statuses. */
  status: CustomerStatus | '';
  /** YYYY-MM-DD bounds on the last job date, or empty. */
  from: string;
  to: string;
}

export interface CustomerPage {
  customers: CustomerSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export type CustomerListResult =
  | ({ status: 'ok' } & CustomerPage)
  | { status: 'unauthenticated' }
  | { status: 'no-access' }
  | { status: 'error' };

function isWholeNumber(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isCustomerSummary(value: unknown): value is CustomerSummary {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.firstName === 'string' &&
    typeof row.lastName === 'string' &&
    isNullableString(row.phone) &&
    isNullableString(row.city) &&
    isNullableString(row.email) &&
    isWholeNumber(row.jobCount, 0) &&
    isNullableString(row.lastJobDate) &&
    typeof row.isRepeat === 'boolean'
  );
}

/** Builds the query string. Empty filters are left out. */
export function customerListQuery({
  page,
  pageSize,
  search,
  status,
  from,
  to,
}: CustomerListParams): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const trimmed = search.trim();
  if (trimmed) params.set('search', trimmed);
  if (status) params.set('status', status);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return params.toString();
}

export async function fetchCustomers(
  accessToken: string,
  params: CustomerListParams,
  signal?: AbortSignal,
): Promise<CustomerListResult> {
  try {
    const response = await fetch(`/api/customers?${customerListQuery(params)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'no-access' };
    if (!response.ok) return { status: 'error' };
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return { status: 'error' };
    const { customers, total, page, pageSize } = body as Record<string, unknown>;
    if (
      !Array.isArray(customers) ||
      !customers.every(isCustomerSummary) ||
      !isWholeNumber(total, 0) ||
      !isWholeNumber(page, 1) ||
      !isWholeNumber(pageSize, 1)
    ) {
      return { status: 'error' };
    }
    return { status: 'ok', customers, total, page, pageSize };
  } catch {
    return { status: 'error' };
  }
}
