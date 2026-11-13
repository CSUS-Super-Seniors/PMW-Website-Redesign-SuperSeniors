import type { SupabaseClient } from '@supabase/supabase-js';

export const INQUIRY_PAGE_SIZE_MIN = 5;
export const INQUIRY_PAGE_SIZE_MAX = 20;
export const INQUIRY_PAGE_SIZE_DEFAULT = 10;

export interface InquiryListItem {
  id: string;
  inquiryNumber: string;
  customerName: string;
  item: string;
  city: string | null;
  status: string;
  submittedAt: string;
}

export interface InquiryPage {
  inquiries: InquiryListItem[];
  total: number;
}

export interface InquiryBackend {
  listInquiries(options: { page: number; pageSize: number }): Promise<InquiryPage>;
}

interface InquiryRow {
  id: string;
  inquiry_number: string;
  first_name: string;
  last_name: string;
  item: string;
  city: string | null;
  status: string;
  created_at: string;
}

const PAGE_MAX = 100_000;

export type InquiryListQuery =
  { ok: true; page: number; pageSize: number } | { ok: false; error: string };

function readPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d{0,5}$/.test(value)) return null;
  return Number(value);
}

// Query values arrive as strings, arrays or nested objects, so check them here
// even though the client only ever sends the page sizes it offers.
export function parseInquiryListQuery(query: Record<string, unknown>): InquiryListQuery {
  const page = query.page === undefined ? 1 : readPositiveInteger(query.page);
  if (page === null || page > PAGE_MAX) {
    return { ok: false, error: `page must be a whole number from 1 to ${PAGE_MAX}.` };
  }
  const pageSize =
    query.pageSize === undefined ? INQUIRY_PAGE_SIZE_DEFAULT : readPositiveInteger(query.pageSize);
  if (pageSize === null || pageSize < INQUIRY_PAGE_SIZE_MIN || pageSize > INQUIRY_PAGE_SIZE_MAX) {
    return {
      ok: false,
      error: `pageSize must be a whole number from ${INQUIRY_PAGE_SIZE_MIN} to ${INQUIRY_PAGE_SIZE_MAX}.`,
    };
  }
  return { ok: true, page, pageSize };
}

// PostgREST answers with this code when the requested offset is past the last row.
const RANGE_NOT_SATISFIABLE = 'PGRST103';

function toListItem(row: InquiryRow): InquiryListItem {
  return {
    id: row.id,
    inquiryNumber: row.inquiry_number,
    // The name is shown as the visitor typed it on the form, not the linked CRM customer.
    customerName: `${row.first_name} ${row.last_name}`.trim(),
    item: row.item,
    city: row.city,
    status: row.status,
    submittedAt: row.created_at,
  };
}

export function createInquiryBackend(client: Pick<SupabaseClient, 'from'>): InquiryBackend {
  return {
    async listInquiries({ page, pageSize }) {
      const from = (page - 1) * pageSize;
      const { data, error, count } = await client
        .from('inquiries')
        .select('id,inquiry_number,first_name,last_name,item,city,status,created_at', {
          count: 'exact',
        })
        // Newest first. The id breaks ties so rows never move between pages.
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error?.code === RANGE_NOT_SATISFIABLE) {
        // The page is past the end (for example, rows were removed). Report the
        // real total so the client can move back to the last page.
        const { count: total, error: countError } = await client
          .from('inquiries')
          .select('id', { count: 'exact', head: true });
        if (countError || total === null) throw new Error('Inquiry count failed');
        return { inquiries: [], total };
      }
      if (error || !data || count === null) throw new Error('Inquiry list lookup failed');

      return { inquiries: (data as InquiryRow[]).map(toListItem), total: count };
    },
  };
}
