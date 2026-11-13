/** Database values. The list shows them as New, Reviewed, Accepted and Declined. */
export type InquiryStatus = 'new' | 'contacted' | 'converted' | 'closed';

export const INQUIRY_PAGE_SIZES = [5, 10, 20] as const;
export const DEFAULT_INQUIRY_PAGE_SIZE = 10;

export interface InquirySummary {
  id: string;
  inquiryNumber: string;
  customerName: string;
  item: string;
  city: string | null;
  status: InquiryStatus;
  submittedAt: string;
}

export interface InquiryPage {
  inquiries: InquirySummary[];
  total: number;
  page: number;
  pageSize: number;
}

export type InquiryListResult =
  | ({ status: 'ok' } & InquiryPage)
  | { status: 'unauthenticated' }
  | { status: 'no-access' }
  | { status: 'error' };

const statuses: readonly string[] = ['new', 'contacted', 'converted', 'closed'];

function isWholeNumber(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

function isInquirySummary(value: unknown): value is InquirySummary {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.inquiryNumber === 'string' &&
    typeof row.customerName === 'string' &&
    typeof row.item === 'string' &&
    (row.city === null || typeof row.city === 'string') &&
    typeof row.status === 'string' &&
    statuses.includes(row.status) &&
    typeof row.submittedAt === 'string'
  );
}

export async function fetchInquiries(
  accessToken: string,
  { page, pageSize }: { page: number; pageSize: number },
): Promise<InquiryListResult> {
  try {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const response = await fetch(`/api/inquiries?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'no-access' };
    if (!response.ok) return { status: 'error' };
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return { status: 'error' };
    const {
      inquiries,
      total,
      page: gotPage,
      pageSize: gotPageSize,
    } = body as Record<string, unknown>;
    if (
      !Array.isArray(inquiries) ||
      !inquiries.every(isInquirySummary) ||
      !isWholeNumber(total, 0) ||
      !isWholeNumber(gotPage, 1) ||
      !isWholeNumber(gotPageSize, 1)
    ) {
      return { status: 'error' };
    }
    return { status: 'ok', inquiries, total, page: gotPage, pageSize: gotPageSize };
  } catch {
    return { status: 'error' };
  }
}
