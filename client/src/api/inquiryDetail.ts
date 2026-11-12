import type { InquiryStatus } from './inquiries';

/** One estimate request as GET /api/inquiries/:id returns it (SSPMW-144). */
export interface InquiryDetail {
  id: string;
  inquiryNumber: string;
  status: InquiryStatus;
  submittedAt: string;
  item: string;
  issueType: string | null;
  description: string | null;
  customerName: string;
  email: string | null;
  phone: string | null;
  preferredContact: 'email' | 'phone' | 'text' | null;
  textOk: boolean;
  address: string | null;
  city: string | null;
  inServiceArea: boolean;
  /** Ids only. Each photo is shown through a short-lived signed URL. */
  photos: { id: string }[];
}

export type InquiryDetailResult =
  | { status: 'ok'; inquiry: InquiryDetail }
  | { status: 'unauthenticated' }
  | { status: 'no-access' }
  | { status: 'not-found' }
  | { status: 'error' };

const statuses: readonly string[] = ['new', 'contacted', 'converted', 'closed'];
const contactPreferences: readonly unknown[] = ['email', 'phone', 'text', null];

const isText = (value: unknown) => typeof value === 'string';
const isOptionalText = (value: unknown) => value === null || typeof value === 'string';

function isInquiryDetail(value: unknown): value is InquiryDetail {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    isText(row.id) &&
    isText(row.inquiryNumber) &&
    isText(row.status) &&
    statuses.includes(row.status as string) &&
    isText(row.submittedAt) &&
    isText(row.item) &&
    isOptionalText(row.issueType) &&
    isOptionalText(row.description) &&
    isText(row.customerName) &&
    isOptionalText(row.email) &&
    isOptionalText(row.phone) &&
    contactPreferences.includes(row.preferredContact) &&
    typeof row.textOk === 'boolean' &&
    isOptionalText(row.address) &&
    isOptionalText(row.city) &&
    typeof row.inServiceArea === 'boolean' &&
    Array.isArray(row.photos) &&
    row.photos.every((photo) => photo && typeof photo === 'object' && isText(photo.id))
  );
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchInquiry(accessToken: string, id: string): Promise<InquiryDetailResult> {
  try {
    const response = await fetch(`/api/inquiries/${encodeURIComponent(id)}`, {
      headers: authHeaders(accessToken),
    });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'no-access' };
    // A malformed id is answered with 400; to the owner it is the same as missing.
    if (response.status === 404 || response.status === 400) return { status: 'not-found' };
    if (!response.ok) return { status: 'error' };
    const body: unknown = await response.json();
    return isInquiryDetail(body) ? { status: 'ok', inquiry: body } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

/**
 * Marks a New request Reviewed. Returns the status the server reports afterwards,
 * or null when the call failed (the page then keeps showing the loaded status).
 */
export async function markInquiryReviewed(
  accessToken: string,
  id: string,
): Promise<InquiryStatus | null> {
  try {
    const response = await fetch(`/api/inquiries/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      headers: authHeaders(accessToken),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const status = (body as { status?: unknown } | null)?.status;
    return typeof status === 'string' && statuses.includes(status)
      ? (status as InquiryStatus)
      : null;
  } catch {
    return null;
  }
}

/** Asks the owner-only route for a signed URL. Returns null when it cannot be had. */
export async function fetchPhotoViewUrl(
  accessToken: string,
  photoId: string,
): Promise<string | null> {
  try {
    const response = await fetch(`/api/inquiry-photos/${encodeURIComponent(photoId)}/view-url`, {
      headers: authHeaders(accessToken),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const url = (body as { signedUrl?: unknown } | null)?.signedUrl;
    if (typeof url !== 'string') return null;
    // Only show web addresses; never a javascript: or data: URL.
    const protocol = new URL(url, window.location.origin).protocol;
    return protocol === 'https:' || protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}
