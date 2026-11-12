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

/** One estimate request as the owner detail page shows it (SSPMW-144). */
export interface InquiryDetail {
  id: string;
  inquiryNumber: string;
  status: string;
  submittedAt: string;
  item: string;
  issueType: string | null;
  description: string | null;
  customerName: string;
  email: string | null;
  phone: string | null;
  preferredContact: string | null;
  textOk: boolean;
  address: string | null;
  city: string | null;
  /** Stored at submit, so a later service-area rule change does not alter it (Q7). */
  inServiceArea: boolean;
  /** Only ids. The browser asks the owner-only view-url route for a signed URL per photo. */
  photos: { id: string }[];
}

export interface InquiryBackend {
  listInquiries(options: { page: number; pageSize: number }): Promise<InquiryPage>;
  /** Returns null when no inquiry has this id. */
  getInquiry(id: string): Promise<InquiryDetail | null>;
  /**
   * Moves a New inquiry to Reviewed (`contacted`). Any other status is left alone,
   * so opening an accepted or declined request never changes it. Returns the
   * status after the call, or null when no inquiry has this id.
   */
  markReviewed(id: string): Promise<string | null>;
}

/** Inquiry and photo ids are uuids; anything else is refused before the database. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    async getInquiry(id) {
      const { data, error } = await client
        .from('inquiries')
        .select(DETAIL_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error('Inquiry lookup failed');
      if (!data) return null;

      const photos = await client
        .from('inquiry_photos')
        .select('id')
        .eq('inquiry_id', id)
        // Upload order, with the id breaking ties so the order never changes.
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (photos.error || !photos.data) throw new Error('Inquiry photo lookup failed');

      return toDetail(data as InquiryDetailRow, photos.data as { id: string }[]);
    },

    async markReviewed(id) {
      // Only a New inquiry moves. The status filter makes this safe to repeat and
      // safe against a request that was accepted or declined in the meantime.
      const updated = await client
        .from('inquiries')
        .update({ status: 'contacted', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'new')
        .select('status');
      if (updated.error || !updated.data) throw new Error('Inquiry review update failed');
      if (updated.data.length > 0) return 'contacted';

      const current = await client.from('inquiries').select('status').eq('id', id).maybeSingle();
      if (current.error) throw new Error('Inquiry status lookup failed');
      return (current.data as { status: string } | null)?.status ?? null;
    },
  };
}

// One literal, so Supabase's typed select() can read it.
const DETAIL_COLUMNS =
  'id,inquiry_number,status,created_at,item,issue_type,description,first_name,last_name,email,phone,preferred_contact,text_ok,address,city,in_service_area';

interface InquiryDetailRow {
  id: string;
  inquiry_number: string;
  status: string;
  created_at: string;
  item: string;
  issue_type: string | null;
  description: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: string | null;
  text_ok: boolean;
  address: string | null;
  city: string | null;
  in_service_area: boolean;
}

function toDetail(row: InquiryDetailRow, photos: { id: string }[]): InquiryDetail {
  return {
    id: row.id,
    inquiryNumber: row.inquiry_number,
    status: row.status,
    submittedAt: row.created_at,
    item: row.item,
    issueType: row.issue_type,
    description: row.description,
    // As the visitor typed it on the form, like the list.
    customerName: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    phone: row.phone,
    preferredContact: row.preferred_contact,
    textOk: row.text_ok,
    address: row.address,
    city: row.city,
    inServiceArea: row.in_service_area,
    photos: photos.map(({ id }) => ({ id })),
  };
}
