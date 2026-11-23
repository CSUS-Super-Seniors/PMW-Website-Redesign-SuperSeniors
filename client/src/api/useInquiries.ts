import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fetchInquiries, type InquiryListResult } from './inquiries';

export type InquiriesState = { status: 'loading' } | InquiryListResult;

export function useInquiries(
  page: number,
  pageSize: number,
): { state: InquiriesState; retry: () => void } {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const userId = session?.user.id;
  const tokenRef = useRef(accessToken);
  const [result, setResult] = useState<{ key: string; value: InquiryListResult } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // An answer only counts for the user and page it was fetched for, so an
  // older page never flashes up after the owner moves to another one.
  const key = `${userId}:${page}:${pageSize}:${attempt}`;
  const state: InquiriesState =
    result !== null && result.key === key ? result.value : { status: 'loading' };

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!userId || !token) return;
    let cancelled = false;
    const requestKey = `${userId}:${page}:${pageSize}:${attempt}`;
    fetchInquiries(token, { page, pageSize }).then((value) => {
      if (!cancelled) setResult({ key: requestKey, value });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, page, pageSize, attempt]);

  function retry() {
    setAttempt((n) => n + 1);
  }

  return { state, retry };
}
