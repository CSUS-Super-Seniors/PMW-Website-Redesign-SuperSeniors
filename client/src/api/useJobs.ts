import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fetchJobs, type JobListQuery, type JobListResult } from './jobs';

export type JobsState = { status: 'loading' } | JobListResult;

export function useJobs(query: JobListQuery): { state: JobsState; retry: () => void } {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const userId = session?.user.id;
  const { page, pageSize, status, search } = query;
  const tokenRef = useRef(accessToken);
  const [result, setResult] = useState<{ key: string; value: JobListResult } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // An answer only counts for the user and filters it was fetched for, so an older
  // search never flashes up after the staff member types something else.
  const key = JSON.stringify([userId, page, pageSize, status, search, attempt]);
  const state: JobsState =
    result !== null && result.key === key ? result.value : { status: 'loading' };

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!userId || !token) return;
    let cancelled = false;
    const requestKey = JSON.stringify([userId, page, pageSize, status, search, attempt]);
    fetchJobs(token, { page, pageSize, status, search }).then((value) => {
      if (!cancelled) setResult({ key: requestKey, value });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, page, pageSize, status, search, attempt]);

  function retry() {
    setAttempt((n) => n + 1);
  }

  return { state, retry };
}
