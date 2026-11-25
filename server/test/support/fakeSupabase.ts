import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEmail, normalizePhone } from '../../src/customerMatch.js';

// An in-memory stand-in for the Supabase client, shared by the server tests that
// read and write customers, inquiries and jobs. It supports only the query builder
// calls those modules use.

export type Row = Record<string, unknown>;
type Action = 'select' | 'insert' | 'update' | 'delete';
type Result = { data: unknown; error: Error | null };

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Turns a Postgres ilike pattern into a regular expression: % is any text, _ is one
// character, and a backslash makes the next character literal.
function likeToRegExp(pattern: string) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '\\') {
      index += 1;
      source += escapeRegExp(pattern[index] ?? '');
    } else if (character === '%') {
      source += '.*';
    } else if (character === '_') {
      source += '.';
    } else {
      source += escapeRegExp(character);
    }
  }
  return new RegExp(`^${source}$`, 'i');
}

// Keeps each table in memory. Inserted rows get an id, created_at and deleted_at.
// `failing` lists calls that should return an error, such as "jobs:insert".
export function fakeDatabase(
  seed: {
    inquiries?: Row[];
    customers?: Row[];
    jobs?: Row[];
    inquiry_photos?: Row[];
    job_media?: Row[];
    files?: string[];
  },
  failing: string[] = [],
  hooks: { beforeInsert?: (table: string, tables: Record<string, Row[]>) => void } = {},
) {
  const tables: Record<string, Row[]> = {
    inquiries: seed.inquiries ?? [],
    customers: seed.customers ?? [],
    jobs: seed.jobs ?? [],
    inquiry_photos: seed.inquiry_photos ?? [],
    job_media: seed.job_media ?? [],
  };
  let counter = 0;
  let jobNumber = 1000;

  function from(table: string) {
    const rows = tables[table];
    let action: Action = 'select';
    let payload: Row = {};
    let columns: string[] | null = null;
    let sortByCreated = false;
    let max = Infinity;
    let mode: 'many' | 'single' | 'maybe' = 'many';
    const filters: Array<(row: Row) => boolean> = [];

    function run(): Result {
      if (failing.includes(`${table}:${action}`)) {
        return { data: null, error: new Error('database down') };
      }
      let matched: Row[];
      if (action === 'insert') {
        hooks.beforeInsert?.(table, tables);
        // Mirrors the unique index from the unique_job_per_inquiry migration.
        if (
          table === 'jobs' &&
          payload.inquiry_id &&
          rows.some((row) => row.inquiry_id === payload.inquiry_id)
        ) {
          return {
            data: null,
            error: Object.assign(new Error('duplicate key value violates unique constraint'), {
              code: '23505',
            }),
          };
        }
        counter += 1;
        const row: Row = {
          id: `${table}-${counter}`,
          created_at: new Date(2030, 0, 1, 0, 0, counter).toISOString(),
          deleted_at: null,
          ...(table === 'jobs' ? { job_number: `J-${(jobNumber += 1)}` } : {}),
          ...payload,
        };
        rows.push(row);
        matched = [row];
      } else {
        matched = rows.filter((row) => filters.every((filter) => filter(row)));
        if (sortByCreated) {
          matched.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        }
        if (action === 'update') for (const row of matched) Object.assign(row, payload);
        if (action === 'delete') for (const row of matched) rows.splice(rows.indexOf(row), 1);
      }
      const picked = matched
        .slice(0, max)
        .map((row) =>
          columns ? Object.fromEntries(columns.map((column) => [column, row[column]])) : row,
        );
      if (mode === 'many') return { data: picked, error: null };
      if (picked.length === 0) {
        return mode === 'single'
          ? { data: null, error: new Error('no rows') }
          : { data: null, error: null };
      }
      return { data: picked[0], error: null };
    }

    const builder = {
      select(list?: string) {
        if (list) columns = list.split(',');
        return builder;
      },
      insert(row: Row) {
        action = 'insert';
        payload = row;
        return builder;
      },
      update(values: Row) {
        action = 'update';
        payload = values;
        return builder;
      },
      delete() {
        action = 'delete';
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      is(column: string, value: null) {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      ilike(column: string, pattern: string) {
        const expression = likeToRegExp(pattern);
        filters.push((row) => typeof row[column] === 'string' && expression.test(row[column]));
        return builder;
      },
      order(column: string) {
        sortByCreated = column === 'created_at';
        return builder;
      },
      limit(count: number) {
        max = count;
        return builder;
      },
      single() {
        mode = 'single';
        return builder;
      },
      maybeSingle() {
        mode = 'maybe';
        return builder;
      },
      then(onfulfilled: (value: Result) => unknown, onrejected?: (reason: unknown) => unknown) {
        return Promise.resolve(run()).then(onfulfilled, onrejected);
      },
    };
    return builder;
  }

  // Files are tracked as "bucket/path" strings.
  const files = new Set(seed.files ?? []);
  const storage = {
    from(bucket: string) {
      return {
        async copy(source: string, destination: string, options?: { destinationBucket?: string }) {
          if (failing.includes('storage:copy')) {
            return { data: null, error: new Error('storage down') };
          }
          if (!files.has(`${bucket}/${source}`)) {
            return { data: null, error: new Error('Object not found') };
          }
          const target = `${options?.destinationBucket ?? bucket}/${destination}`;
          if (files.has(target)) {
            return { data: null, error: new Error('The resource already exists') };
          }
          files.add(target);
          return { data: { path: destination }, error: null };
        },
      };
    },
  };

  // Mirrors public.find_or_create_customer: oldest active customer by email, then by
  // phone digits, otherwise insert (when p_create). A failing "customers:select" or
  // "customers:insert" makes the call fail the way the database would.
  async function rpc(name: string, args: Row) {
    if (failing.includes(`rpc:${name}`)) return { data: null, error: new Error('database down') };
    if (name !== 'find_or_create_customer') {
      return { data: null, error: new Error(`Unknown function ${name}`) };
    }
    if (failing.includes('customers:select')) {
      return { data: null, error: new Error('database down') };
    }
    const email = normalizeEmail(args.p_email as string | null);
    const phone = normalizePhone(args.p_phone as string | null);
    const active = tables.customers
      .filter((row) => (row.deleted_at ?? null) === null)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const byEmail = email
      ? active.find((row) => normalizeEmail(row.email as string) === email)
      : null;
    if (byEmail)
      return {
        data: [{ customer_id: byEmail.id, matched_by: 'email', created: false }],
        error: null,
      };
    const byPhone = phone
      ? active.find((row) => normalizePhone(row.phone as string) === phone)
      : null;
    if (byPhone)
      return {
        data: [{ customer_id: byPhone.id, matched_by: 'phone', created: false }],
        error: null,
      };
    if (!args.p_create) return { data: [], error: null };
    if (failing.includes('customers:insert')) {
      return { data: null, error: new Error('database down') };
    }
    hooks.beforeInsert?.('customers', tables);
    counter += 1;
    const phoneText = typeof args.p_phone === 'string' ? args.p_phone.trim() : '';
    const row: Row = {
      id: `customers-${counter}`,
      created_at: new Date(2030, 0, 1, 0, 0, counter).toISOString(),
      deleted_at: null,
      first_name: args.p_first_name,
      last_name: args.p_last_name,
      email,
      phone: phoneText || null,
      address: args.p_address ?? null,
      city: args.p_city ?? null,
      preferred_contact: args.p_preferred_contact ?? null,
      text_ok: args.p_text_ok ?? false,
      lead_source: args.p_lead_source ?? null,
      next_follow_up_date: args.p_next_follow_up_date ?? null,
    };
    tables.customers.push(row);
    return { data: [{ customer_id: row.id, matched_by: null, created: true }], error: null };
  }

  return {
    client: { from, storage, rpc } as unknown as Pick<SupabaseClient, 'from' | 'storage' | 'rpc'>,
    tables,
    files,
  };
}
