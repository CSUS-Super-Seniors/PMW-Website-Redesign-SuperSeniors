import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInquiryBackend } from '../src/inquiries.js';

type Row = Record<string, string | null>;

function row(n: number, createdAt: string, overrides: Row = {}): Row {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    inquiry_number: `INQ-${1000 + n}`,
    first_name: `First${n}`,
    last_name: `Last${n}`,
    item: `Item ${n}`,
    city: `City ${n}`,
    status: 'new',
    created_at: createdAt,
    ...overrides,
  };
}

// Applies order() and range() to the rows the way PostgREST would, so the
// tests check which rows come back, not only which calls were made.
function fakeDatabase(rows: Row[], failWith: { code: string; message: string } | null = null) {
  const calls: { select: unknown[][]; order: unknown[][]; range: unknown[][] } = {
    select: [],
    order: [],
    range: [],
  };

  const from = vi.fn((table: string) => {
    if (table !== 'inquiries') throw new Error(`Unexpected table ${table}`);
    const orders: { column: string; ascending: boolean }[] = [];
    let head = false;
    let window: [number, number] | null = null;

    const result = () => {
      if (failWith) return { data: null, error: failWith, count: null };
      if (head) return { data: null, error: null, count: rows.length };
      const sorted = [...rows].sort((a, b) => {
        for (const { column, ascending } of orders) {
          const left = a[column] ?? '';
          const right = b[column] ?? '';
          if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1);
        }
        return 0;
      });
      if (window && window[0] >= rows.length && rows.length > 0) {
        return {
          data: null,
          error: { code: 'PGRST103', message: 'Requested range not satisfiable' },
          count: null,
        };
      }
      const data = window ? sorted.slice(window[0], window[1] + 1) : sorted;
      return { data, error: null, count: rows.length };
    };

    const builder = {
      select(columns: string, options?: { count?: string; head?: boolean }) {
        calls.select.push([columns, options]);
        head = options?.head === true;
        return builder;
      },
      order(column: string, options: { ascending: boolean }) {
        calls.order.push([column, options]);
        orders.push({ column, ascending: options.ascending });
        return builder;
      },
      range(start: number, end: number) {
        calls.range.push([start, end]);
        window = [start, end];
        return builder;
      },
      then<T>(resolve: (value: ReturnType<typeof result>) => T) {
        return Promise.resolve(result()).then(resolve);
      },
    };
    return builder;
  });

  const backend = createInquiryBackend({ from } as unknown as Pick<SupabaseClient, 'from'>);
  return { backend, from, calls };
}

// Submitted out of order, with two rows sharing a timestamp.
const rows = [
  row(1, '2026-09-28T09:00:00+00:00'),
  row(2, '2026-10-01T17:18:00+00:00'),
  row(3, '2026-09-30T22:16:00+00:00'),
  row(4, '2026-10-01T17:18:00+00:00'),
  row(5, '2026-09-29T21:28:00+00:00'),
  row(6, '2026-10-02T08:00:00+00:00'),
  row(7, '2026-09-27T12:00:00+00:00'),
];

describe('inquiry database adapter', () => {
  it('lists newest first and breaks timestamp ties by id', async () => {
    const { backend, calls } = fakeDatabase(rows);
    const { inquiries, total } = await backend.listInquiries({ page: 1, pageSize: 20 });

    expect(total).toBe(7);
    expect(inquiries.map((inquiry) => inquiry.inquiryNumber)).toEqual([
      'INQ-1006',
      'INQ-1004',
      'INQ-1002',
      'INQ-1003',
      'INQ-1005',
      'INQ-1001',
      'INQ-1007',
    ]);
    expect(calls.order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });

  it('returns each page in order with no rows repeated or skipped', async () => {
    const { backend, calls } = fakeDatabase(rows);
    const pages = [];
    for (const page of [1, 2]) {
      pages.push((await backend.listInquiries({ page, pageSize: 5 })).inquiries);
    }

    expect(calls.range).toEqual([
      [0, 4],
      [5, 9],
    ]);
    expect(pages.map((page) => page.length)).toEqual([5, 2]);
    const all = (await backend.listInquiries({ page: 1, pageSize: 20 })).inquiries;
    expect(pages.flat()).toEqual(all);
  });

  it('uses the page size to pick the offset', async () => {
    const { backend, calls } = fakeDatabase(rows);
    await backend.listInquiries({ page: 3, pageSize: 20 });
    expect(calls.range).toEqual([[40, 59]]);
  });

  it('maps the columns the list shows from the inquiries table', async () => {
    const { backend, from, calls } = fakeDatabase([
      row(48, '2026-10-01T17:18:00+00:00', {
        first_name: 'Margaret',
        last_name: 'Lewis',
        item: 'Dining chair',
        city: null,
        status: 'contacted',
      }),
    ]);
    const { inquiries } = await backend.listInquiries({ page: 1, pageSize: 10 });

    expect(from).toHaveBeenCalledWith('inquiries');
    expect(calls.select[0]).toEqual([
      'id,inquiry_number,first_name,last_name,item,city,status,created_at',
      { count: 'exact' },
    ]);
    expect(inquiries).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000048',
        inquiryNumber: 'INQ-1048',
        customerName: 'Margaret Lewis',
        item: 'Dining chair',
        city: null,
        status: 'contacted',
        submittedAt: '2026-10-01T17:18:00+00:00',
      },
    ]);
  });

  it('returns an empty list when there are no inquiries', async () => {
    const { backend } = fakeDatabase([]);
    expect(await backend.listInquiries({ page: 1, pageSize: 10 })).toEqual({
      inquiries: [],
      total: 0,
    });
  });

  it('returns no rows and the real total for a page past the end', async () => {
    const { backend, calls } = fakeDatabase(rows);
    expect(await backend.listInquiries({ page: 9, pageSize: 5 })).toEqual({
      inquiries: [],
      total: 7,
    });
    expect(calls.select[1]).toEqual(['id', { count: 'exact', head: true }]);
  });

  it('throws without leaking the database error', async () => {
    const { backend } = fakeDatabase(rows, { code: '42501', message: 'permission denied' });
    await expect(backend.listInquiries({ page: 1, pageSize: 10 })).rejects.toThrow(
      'Inquiry list lookup failed',
    );
  });
});
