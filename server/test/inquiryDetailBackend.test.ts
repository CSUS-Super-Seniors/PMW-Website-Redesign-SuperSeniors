import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInquiryBackend } from '../src/inquiries.js';

type Row = Record<string, unknown>;
type Tables = { inquiries: Row[]; inquiry_photos: Row[] };

// A small in-memory stand-in for the PostgREST calls the detail backend makes.
// It applies eq(), order() and update() to real rows, so the tests check results,
// not only which calls were made.
function fakeDatabase(tables: Tables, fail: Partial<Record<'select' | 'update', boolean>> = {}) {
  const from = (table: keyof Tables) => {
    const filters: [string, unknown][] = [];
    const within: [string, unknown[]][] = [];
    const orders: [string, boolean][] = [];
    let columns: string[] | null = null;
    let changes: Row | null = null;

    const matching = () =>
      tables[table].filter(
        (row) =>
          filters.every(([column, value]) => row[column] === value) &&
          within.every(([column, values]) => values.includes(row[column])),
      );
    const pick = (row: Row) =>
      columns ? Object.fromEntries(columns.map((column) => [column, row[column]])) : row;
    const sorted = (rows: Row[]) =>
      [...rows].sort((a, b) => {
        for (const [column, ascending] of orders) {
          const left = String(a[column]);
          const right = String(b[column]);
          if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1);
        }
        return 0;
      });
    const error = { code: 'XX000', message: 'private database detail' };

    const run = () => {
      if (changes) {
        if (fail.update) return { data: null, error };
        const rows = matching();
        for (const row of rows) Object.assign(row, changes);
        return { data: rows.map(pick), error: null };
      }
      if (fail.select) return { data: null, error };
      return { data: sorted(matching()).map(pick), error: null };
    };

    const builder = {
      select(list: string) {
        columns = list.split(',');
        return builder;
      },
      update(values: Row) {
        changes = values;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      in(column: string, values: unknown[]) {
        within.push([column, values]);
        return builder;
      },
      order(column: string, options: { ascending: boolean }) {
        orders.push([column, options.ascending]);
        return builder;
      },
      async maybeSingle() {
        const result = run();
        return { data: result.data?.[0] ?? null, error: result.error };
      },
      then<T>(resolve: (value: ReturnType<typeof run>) => T) {
        return Promise.resolve(run()).then(resolve);
      },
    };
    return builder;
  };

  return createInquiryBackend({ from } as unknown as Pick<SupabaseClient, 'from'>);
}

const ID = '5eed0003-0000-4000-8000-000000001048';
const OTHER_ID = '5eed0003-0000-4000-8000-000000001047';

function inquiry(overrides: Row = {}): Row {
  return {
    id: ID,
    inquiry_number: 'INQ-1048',
    status: 'new',
    created_at: '2026-10-01T17:18:00+00:00',
    updated_at: '2026-10-01T17:18:00+00:00',
    item: 'Dining chair',
    issue_type: 'Loose joint / wobbling',
    description: 'The chair rocks from side to side.',
    first_name: 'Margaret',
    last_name: 'Lewis',
    email: 'margaret@example.com',
    phone: '(916) 555-0142',
    preferred_contact: 'phone',
    text_ok: true,
    address: '4821 Fair Oaks Blvd',
    city: 'Carmichael',
    in_service_area: true,
    customer_id: 'private-crm-link',
    ...overrides,
  };
}

function photo(n: number, createdAt: string, inquiryId = ID): Row {
  return {
    id: `a1b2c3d4-0000-4000-8000-${String(n).padStart(12, '0')}`,
    inquiry_id: inquiryId,
    storage_path: `inquiries/${inquiryId}/photo-${n}.jpg`,
    created_at: createdAt,
  };
}

describe('inquiry detail backend', () => {
  it('maps every detail field from the inquiries table', async () => {
    const backend = fakeDatabase({ inquiries: [inquiry()], inquiry_photos: [] });

    expect(await backend.getInquiry(ID)).toEqual({
      id: ID,
      inquiryNumber: 'INQ-1048',
      status: 'new',
      submittedAt: '2026-10-01T17:18:00+00:00',
      item: 'Dining chair',
      issueType: 'Loose joint / wobbling',
      description: 'The chair rocks from side to side.',
      customerName: 'Margaret Lewis',
      email: 'margaret@example.com',
      phone: '(916) 555-0142',
      preferredContact: 'phone',
      textOk: true,
      address: '4821 Fair Oaks Blvd',
      city: 'Carmichael',
      inServiceArea: true,
      photos: [],
    });
  });

  it('returns only this inquiry’s photo ids, in upload order, without storage paths', async () => {
    const backend = fakeDatabase({
      inquiries: [inquiry(), inquiry({ id: OTHER_ID, inquiry_number: 'INQ-1047' })],
      inquiry_photos: [
        photo(2, '2026-10-01T17:20:00+00:00'),
        photo(9, '2026-10-01T17:19:00+00:00', OTHER_ID),
        photo(1, '2026-10-01T17:19:00+00:00'),
      ],
    });

    const detail = await backend.getInquiry(ID);
    expect(detail?.photos).toEqual([
      { id: 'a1b2c3d4-0000-4000-8000-000000000001' },
      { id: 'a1b2c3d4-0000-4000-8000-000000000002' },
    ]);
    expect(JSON.stringify(detail)).not.toContain('photo-');
  });

  it('keeps optional fields empty instead of inventing values', async () => {
    const backend = fakeDatabase({
      inquiries: [
        inquiry({
          issue_type: null,
          description: null,
          email: null,
          phone: null,
          preferred_contact: null,
          text_ok: false,
          address: null,
          city: null,
          in_service_area: false,
        }),
      ],
      inquiry_photos: [],
    });

    expect(await backend.getInquiry(ID)).toMatchObject({
      issueType: null,
      description: null,
      email: null,
      phone: null,
      preferredContact: null,
      textOk: false,
      address: null,
      city: null,
      inServiceArea: false,
    });
  });

  it('returns null for an unknown id', async () => {
    const backend = fakeDatabase({ inquiries: [inquiry()], inquiry_photos: [] });
    expect(await backend.getInquiry(OTHER_ID)).toBeNull();
  });

  it('throws without leaking the database error', async () => {
    const backend = fakeDatabase({ inquiries: [inquiry()], inquiry_photos: [] }, { select: true });
    const failure = backend.getInquiry(ID);
    await expect(failure).rejects.toThrow('Inquiry lookup failed');
    await expect(backend.getInquiry(ID)).rejects.not.toThrow(/private/);
  });
});

describe('marking an inquiry Reviewed', () => {
  it('moves a New inquiry to Reviewed (contacted) and updates updated_at', async () => {
    const row = inquiry();
    const backend = fakeDatabase({ inquiries: [row], inquiry_photos: [] });

    expect(await backend.markReviewed(ID)).toBe('contacted');
    expect(row.status).toBe('contacted');
    expect(row.updated_at).not.toBe('2026-10-01T17:18:00+00:00');
  });

  it('is safe to repeat', async () => {
    const row = inquiry();
    const backend = fakeDatabase({ inquiries: [row], inquiry_photos: [] });

    await backend.markReviewed(ID);
    expect(await backend.markReviewed(ID)).toBe('contacted');
    expect(row.status).toBe('contacted');
  });

  it.each(['contacted', 'converted', 'closed'])(
    'leaves a %s inquiry unchanged and reports its status',
    async (status) => {
      const row = inquiry({ status });
      const backend = fakeDatabase({ inquiries: [row], inquiry_photos: [] });

      expect(await backend.markReviewed(ID)).toBe(status);
      expect(row.status).toBe(status);
      expect(row.updated_at).toBe('2026-10-01T17:18:00+00:00');
    },
  );

  it('changes only the requested inquiry', async () => {
    const other = inquiry({ id: OTHER_ID });
    const backend = fakeDatabase({ inquiries: [inquiry(), other], inquiry_photos: [] });

    await backend.markReviewed(ID);
    expect(other.status).toBe('new');
  });

  it('returns null for an unknown id', async () => {
    const backend = fakeDatabase({ inquiries: [inquiry()], inquiry_photos: [] });
    expect(await backend.markReviewed(OTHER_ID)).toBeNull();
  });

  it('throws without leaking the database error when the update fails', async () => {
    const backend = fakeDatabase({ inquiries: [inquiry()], inquiry_photos: [] }, { update: true });
    await expect(backend.markReviewed(ID)).rejects.toThrow('Inquiry review update failed');
  });
});

describe('declining an inquiry', () => {
  const declined = {
    id: ID,
    inquiry_number: 'INQ-1048',
    first_name: 'Margaret',
    item: 'Dining chair',
    email: 'margaret@example.com',
  };

  it.each(['new', 'contacted'])(
    'moves a %s inquiry to Declined (closed) and returns only the email fields',
    async (status) => {
      const row = inquiry({ status });
      const backend = fakeDatabase({ inquiries: [row], inquiry_photos: [] });

      expect(await backend.decline(ID)).toEqual({ result: 'declined', inquiry: declined });
      expect(row.status).toBe('closed');
      expect(row.updated_at).not.toBe('2026-10-01T17:18:00+00:00');
    },
  );

  it('reports an already declined inquiry without changing it again', async () => {
    const row = inquiry({ status: 'closed' });
    const backend = fakeDatabase({ inquiries: [row], inquiry_photos: [] });

    expect(await backend.decline(ID)).toEqual({ result: 'already_declined', inquiry: declined });
    expect(row.updated_at).toBe('2026-10-01T17:18:00+00:00');
  });

  it('never declines an accepted inquiry', async () => {
    const row = inquiry({ status: 'converted' });
    const backend = fakeDatabase({ inquiries: [row], inquiry_photos: [] });

    expect(await backend.decline(ID)).toEqual({ result: 'not_declinable', status: 'converted' });
    expect(row.status).toBe('converted');
    expect(row.updated_at).toBe('2026-10-01T17:18:00+00:00');
  });

  it('changes only the requested inquiry', async () => {
    const other = inquiry({ id: OTHER_ID });
    const backend = fakeDatabase({ inquiries: [inquiry(), other], inquiry_photos: [] });

    await backend.decline(ID);
    expect(other.status).toBe('new');
  });

  it('returns not_found for an unknown id', async () => {
    const backend = fakeDatabase({ inquiries: [inquiry()], inquiry_photos: [] });
    expect(await backend.decline(OTHER_ID)).toEqual({ result: 'not_found' });
  });

  it('throws without leaking the database error when the update fails', async () => {
    const backend = fakeDatabase({ inquiries: [inquiry()], inquiry_photos: [] }, { update: true });
    await expect(backend.decline(ID)).rejects.toThrow('Inquiry decline update failed');
  });
});
