import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CUSTOMER_PAGE_SIZES,
  CUSTOMER_SEARCH_MAX_LENGTH,
  DEFAULT_CUSTOMER_PAGE_SIZE,
  customerStatuses,
  type CustomerStatus,
} from '@pmw/validation';

/** One row of the owner customer list (SSPMW-338). */
export interface CustomerListItem {
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

export interface CustomerListFilters {
  search: string | null;
  status: CustomerStatus | null;
  /** YYYY-MM-DD bounds on the last job date, inclusive. */
  lastJobFrom: string | null;
  lastJobTo: string | null;
}

export interface CustomerPage {
  customers: CustomerListItem[];
  total: number;
}

export interface CustomerBackend {
  listCustomers(
    options: CustomerListFilters & { page: number; pageSize: number },
  ): Promise<CustomerPage>;
}

export type CustomerListQuery =
  | ({ ok: true; page: number; pageSize: number } & CustomerListFilters)
  | { ok: false; error: string };

const PAGE_MAX = 100_000;
const pageSizes: readonly number[] = CUSTOMER_PAGE_SIZES;
const statuses: readonly string[] = customerStatuses;

function readPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d{0,5}$/.test(value)) return null;
  return Number(value);
}

/** A real calendar date in YYYY-MM-DD form, or null. Rejects 2026-02-30. */
export function readIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : null;
}

/**
 * Query values arrive as strings, arrays or nested objects, so every one is
 * checked here even though the page only sends values it offers. An empty value
 * means "no filter", the same as leaving it out.
 */
export function parseCustomerListQuery(query: Record<string, unknown>): CustomerListQuery {
  const page = query.page === undefined ? 1 : readPositiveInteger(query.page);
  if (page === null || page > PAGE_MAX) {
    return { ok: false, error: `page must be a whole number from 1 to ${PAGE_MAX}.` };
  }
  const pageSize =
    query.pageSize === undefined ? DEFAULT_CUSTOMER_PAGE_SIZE : readPositiveInteger(query.pageSize);
  if (pageSize === null || !pageSizes.includes(pageSize)) {
    return { ok: false, error: `pageSize must be one of ${CUSTOMER_PAGE_SIZES.join(', ')}.` };
  }

  if (query.search !== undefined && typeof query.search !== 'string') {
    return { ok: false, error: 'search must be text.' };
  }
  const search = (query.search ?? '').trim();
  if (search.length > CUSTOMER_SEARCH_MAX_LENGTH) {
    return {
      ok: false,
      error: `search must be ${CUSTOMER_SEARCH_MAX_LENGTH} characters or fewer.`,
    };
  }

  const rawStatus = query.status ?? '';
  if (typeof rawStatus !== 'string' || (rawStatus !== '' && !statuses.includes(rawStatus))) {
    return { ok: false, error: `status must be one of ${customerStatuses.join(', ')}.` };
  }

  const dates: (string | null)[] = [];
  for (const name of ['from', 'to'] as const) {
    const raw = query[name] ?? '';
    const date = raw === '' ? null : readIsoDate(raw);
    if (raw !== '' && date === null) {
      return { ok: false, error: `${name} must be a date in YYYY-MM-DD format.` };
    }
    dates.push(date);
  }
  const [lastJobFrom, lastJobTo] = dates;
  if (lastJobFrom && lastJobTo && lastJobTo < lastJobFrom) {
    return { ok: false, error: 'to must be on or after from.' };
  }

  return {
    ok: true,
    page,
    pageSize,
    search: search === '' ? null : search,
    status: rawStatus === '' ? null : (rawStatus as CustomerStatus),
    lastJobFrom,
    lastJobTo,
  };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isCustomerListItem(value: unknown): value is CustomerListItem {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.firstName === 'string' &&
    typeof row.lastName === 'string' &&
    isNullableString(row.phone) &&
    isNullableString(row.city) &&
    isNullableString(row.email) &&
    typeof row.jobCount === 'number' &&
    isNullableString(row.lastJobDate) &&
    typeof row.isRepeat === 'boolean'
  );
}

/**
 * Reads the list through `public.list_customers`, which holds the search, Repeat
 * and last job rules. The server's client uses the service role, so the owner
 * check on the route is what keeps employees out here; the function's Row Level
 * Security covers anyone calling the database directly.
 */
export function createCustomerBackend(client: Pick<SupabaseClient, 'rpc'>): CustomerBackend {
  return {
    async listCustomers({ page, pageSize, search, status, lastJobFrom, lastJobTo }) {
      const { data, error } = await client.rpc('list_customers', {
        p_search: search,
        p_status: status,
        p_last_job_from: lastJobFrom,
        p_last_job_to: lastJobTo,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });
      if (error || !data || typeof data !== 'object')
        throw new Error('Customer list lookup failed');
      const { customers, total } = data as Record<string, unknown>;
      if (
        !Array.isArray(customers) ||
        !customers.every(isCustomerListItem) ||
        typeof total !== 'number'
      ) {
        throw new Error('Customer list lookup returned an unexpected shape');
      }
      // Only the list columns, so nothing extra the function might add reaches the browser.
      return {
        total,
        customers: customers.map((row) => ({
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone,
          city: row.city,
          email: row.email,
          jobCount: row.jobCount,
          lastJobDate: row.lastJobDate,
          isRepeat: row.isRepeat,
        })),
      };
    },
  };
}
