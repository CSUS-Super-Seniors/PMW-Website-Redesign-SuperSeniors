import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { InquiryStatus } from './inquiries';
import { fetchInquiry, markInquiryReviewed, type InquiryDetailResult } from './inquiryDetail';

export type InquiryDetailState = { status: 'loading' } | InquiryDetailResult;

/**
 * Loads one estimate request. When it is New, it then asks the server to mark it
 * Reviewed and shows the status the server reports (SSPMW-144).
 */
export function useInquiryDetail(id: string): {
  state: InquiryDetailState;
  retry: () => void;
  /** Shows a status the server reported after a change, such as a decline. */
  setStatus: (status: InquiryStatus) => void;
  accessToken: string | undefined;
} {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const userId = session?.user.id;
  const tokenRef = useRef(accessToken);
  const [result, setResult] = useState<{ key: string; value: InquiryDetailResult } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // An answer only counts for the user and request it was fetched for.
  const key = `${userId}:${id}:${attempt}`;
  const state: InquiryDetailState =
    result !== null && result.key === key ? result.value : { status: 'loading' };

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!userId || !token) return;
    let cancelled = false;
    const requestKey = `${userId}:${id}:${attempt}`;

    fetchInquiry(token, id).then(async (value) => {
      if (cancelled) return;
      setResult({ key: requestKey, value });
      if (value.status !== 'ok' || value.inquiry.status !== 'new') return;

      // Opening a New request marks it Reviewed. The server only moves New, so a
      // repeated call (or a request accepted meanwhile) is safe. On failure the
      // page keeps showing New and the next visit tries again.
      const status = await markInquiryReviewed(token, id);
      if (cancelled || status === null) return;
      // Only replace New: a decline saved while this call ran must stay shown.
      setResult((current) =>
        current?.key === requestKey &&
        current.value.status === 'ok' &&
        current.value.inquiry.status === 'new'
          ? { key: requestKey, value: { ...value, inquiry: { ...value.inquiry, status } } }
          : current,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [userId, id, attempt]);

  function setStatus(status: InquiryStatus) {
    setResult((current) =>
      current?.key === key && current.value.status === 'ok'
        ? { key, value: { ...current.value, inquiry: { ...current.value.inquiry, status } } }
        : current,
    );
  }

  return { state, retry: () => setAttempt((n) => n + 1), setStatus, accessToken };
}
