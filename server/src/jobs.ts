import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeLike } from './customerMatch.js';
import { UUID_PATTERN } from './inquiries.js';

/** The statuses the `jobs_status_check` constraint allows. Figma's "Planning" is `scheduled`. */
export const JOB_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_PAGE_SIZE_MIN = 5;
export const JOB_PAGE_SIZE_MAX = 20;
export const JOB_PAGE_SIZE_DEFAULT = 10;
export const JOB_SEARCH_MAX_LENGTH = 100;

// A name search needs every word to match, so the words are capped.
const SEARCH_TERMS_MAX = 5;
// Customer ids that go into the jobs filter. Keeps the request URL short.
const CUSTOMER_MATCH_MAX = 200;
const PAGE_MAX = 100_000;

export interface JobListItem {
  id: string;
  jobNumber: string;
  customerName: string;
  item: string;
  jobType: string | null;
  status: string;
  /** `jobs.scheduled_date`. */
  startDate: string | null;
  /** The due date of the last checklist step, or null when the job has none. */
  dueDate: string | null;
}

export interface JobPage {
  jobs: JobListItem[];
  total: number;
}

export interface JobListOptions {
  page: number;
  pageSize: number;
  status: JobStatus | null;
  search: string | null;
}

export interface JobBackend {
  listJobs(options: JobListOptions): Promise<JobPage>;
}

export type JobListQuery = ({ ok: true } & JobListOptions) | { ok: false; error: string };

function readPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d{0,5}$/.test(value)) return null;
  return Number(value);
}

/** True when the text has a control character (tab, newline, NUL, DEL and so on). */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

// Query values arrive as strings, arrays or nested objects, so check every one here.
export function parseJobListQuery(query: Record<string, unknown>): JobListQuery {
  const page = query.page === undefined ? 1 : readPositiveInteger(query.page);
  if (page === null || page > PAGE_MAX) {
    return { ok: false, error: `page must be a whole number from 1 to ${PAGE_MAX}.` };
  }

  const pageSize =
    query.pageSize === undefined ? JOB_PAGE_SIZE_DEFAULT : readPositiveInteger(query.pageSize);
  if (pageSize === null || pageSize < JOB_PAGE_SIZE_MIN || pageSize > JOB_PAGE_SIZE_MAX) {
    return {
      ok: false,
      error: `pageSize must be a whole number from ${JOB_PAGE_SIZE_MIN} to ${JOB_PAGE_SIZE_MAX}.`,
    };
  }

  let status: JobStatus | null = null;
  if (query.status !== undefined) {
    const match = JOB_STATUSES.find((allowed) => allowed === query.status);
    if (!match) return { ok: false, error: `status must be one of: ${JOB_STATUSES.join(', ')}.` };
    status = match;
  }

  let search: string | null = null;
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || hasControlCharacter(query.q)) {
      return { ok: false, error: 'q must be plain text.' };
    }
    const cleaned = query.q.trim().replace(/\s+/g, ' ');
    if (cleaned.length > JOB_SEARCH_MAX_LENGTH) {
      return { ok: false, error: `q must be at most ${JOB_SEARCH_MAX_LENGTH} characters.` };
    }
    search = cleaned === '' ? null : cleaned;
  }

  return { ok: true, page, pageSize, status, search };
}

/**
 * `%term%` for a case-insensitive "contains" match, written so it is safe inside a
 * PostgREST `or=(...)` string. `escapeLike` makes `%`, `_` and `\` match literally.
 * The double quotes keep `,`, `(` and `)` from being read as filter syntax, and a
 * `\` or `"` inside the quotes needs its own backslash.
 */
function quotedPattern(term: string): string {
  const pattern = `%${escapeLike(term)}%`;
  return `"${pattern.replace(/[\\"]/g, (character) => `\\${character}`)}"`;
}

/** The `or` filter for the jobs table: its own text columns, or one of these customers. */
export function jobSearchFilter(search: string, customerIds: string[]): string {
  const pattern = quotedPattern(search);
  const parts = [
    `item.ilike.${pattern}`,
    `job_type.ilike.${pattern}`,
    `job_number.ilike.${pattern}`,
  ];
  // Ids are checked even though they come from our own table.
  const safeIds = customerIds.filter((id) => UUID_PATTERN.test(id));
  if (safeIds.length > 0) parts.push(`customer_id.in.(${safeIds.join(',')})`);
  return parts.join(',');
}

interface JobRow {
  id: string;
  job_number: string;
  item: string;
  job_type: string | null;
  status: string;
  scheduled_date: string | null;
  customers: { first_name: string; last_name: string } | null;
  job_steps: { position: number; due_date: string | null }[] | null;
}

const JOB_COLUMNS =
  'id,job_number,item,job_type,status,scheduled_date,customers(first_name,last_name),job_steps(position,due_date)';

function lastStepDueDate(steps: JobRow['job_steps']): string | null {
  let last: { position: number; due_date: string | null } | null = null;
  for (const step of steps ?? []) {
    if (!last || step.position > last.position) last = step;
  }
  return last?.due_date ?? null;
}

function toListItem(row: JobRow): JobListItem {
  return {
    id: row.id,
    jobNumber: row.job_number,
    customerName: row.customers
      ? `${row.customers.first_name} ${row.customers.last_name}`.trim()
      : '',
    item: row.item,
    jobType: row.job_type,
    status: row.status,
    startDate: row.scheduled_date,
    dueDate: lastStepDueDate(row.job_steps),
  };
}

// PostgREST answers with this code when the requested offset is past the last row.
const RANGE_NOT_SATISFIABLE = 'PGRST103';

export function createJobBackend(client: Pick<SupabaseClient, 'from'>): JobBackend {
  /** Customers whose name matches every word of the search ("Margaret Lewis"). */
  async function findCustomerIds(search: string): Promise<string[]> {
    let query = client.from('customers').select('id');
    for (const term of search.split(' ').slice(0, SEARCH_TERMS_MAX)) {
      const pattern = quotedPattern(term);
      // Several `or` filters are combined with AND, so each word must match a name.
      query = query.or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`);
    }
    const { data, error } = await query.limit(CUSTOMER_MATCH_MAX);
    if (error || !data) throw new Error('Customer search failed');
    return (data as { id: string }[]).map((customer) => customer.id);
  }

  return {
    async listJobs({ page, pageSize, status, search }) {
      const searchFilter = search ? jobSearchFilter(search, await findCustomerIds(search)) : null;

      const run = (start: number, end: number) => {
        let query = client.from('jobs').select(JOB_COLUMNS, { count: 'exact' });
        if (status) query = query.eq('status', status);
        if (searchFilter) query = query.or(searchFilter);
        return (
          query
            // Newest first. The id breaks ties so rows never move between pages.
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(start, end)
        );
      };

      const start = (page - 1) * pageSize;
      const { data, error, count } = await run(start, start + pageSize - 1);

      if (error?.code === RANGE_NOT_SATISFIABLE) {
        // The page is past the end. Report the real total so the client can step back.
        const first = await run(0, 0);
        if (first.error || first.count === null) throw new Error('Job count failed');
        return { jobs: [], total: first.count };
      }
      if (error || !data || count === null) throw new Error('Job list lookup failed');

      return { jobs: (data as unknown as JobRow[]).map(toListItem), total: count };
    },
  };
}
