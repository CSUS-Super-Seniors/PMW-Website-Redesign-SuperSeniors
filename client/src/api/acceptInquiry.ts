export interface AcceptedJob {
  id: string;
  jobNumber: string;
}

export type AcceptInquiryResult =
  | { status: 'ok'; job: AcceptedJob }
  | { status: 'unauthenticated' }
  | { status: 'no-access' }
  | { status: 'not-found' }
  | { status: 'not-acceptable' }
  | { status: 'error' };

function isAcceptedJob(value: unknown): value is AcceptedJob {
  if (typeof value !== 'object' || value === null) return false;
  const { id, jobNumber } = value as Record<string, unknown>;
  return typeof id === 'string' && typeof jobNumber === 'string';
}

export async function acceptInquiry(
  accessToken: string,
  inquiryId: string,
): Promise<AcceptInquiryResult> {
  try {
    const response = await fetch(`/api/inquiries/${encodeURIComponent(inquiryId)}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'no-access' };
    if (response.status === 404) return { status: 'not-found' };
    if (response.status === 409) return { status: 'not-acceptable' };
    if (!response.ok) return { status: 'error' };
    const body: unknown = await response.json();
    const job = typeof body === 'object' && body !== null ? (body as { job?: unknown }).job : null;
    return isAcceptedJob(job) ? { status: 'ok', job } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}
